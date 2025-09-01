/**
 * Module Loader Service for SeraphC2
 * Implements requirements 13.1, 13.2 - Module loading with sandboxed execution and digital signature verification
 */

import { EventEmitter } from 'events';
import { createHash, createVerify } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Module,
  ModuleExecution,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
  ModuleStatus,
  ModuleExecutionResult,
  ModuleSandboxConfig,
  ModuleEvent,
  ModuleLoadedEvent,
  ModuleUnloadedEvent,
  ModuleExecutionStartedEvent,
  ModuleExecutionCompletedEvent,
  ModuleExecutionFailedEvent,
} from '../../types/modules';
import { Logger } from '../../utils/logger';

export interface ModuleLoaderConfig {
  moduleDirectory: string;
  sandboxDirectory: string;
  trustedPublicKeys: string[];
  defaultSandboxConfig: ModuleSandboxConfig;
  maxConcurrentExecutions: number;
  executionTimeoutMs: number;
  signatureVerificationRequired: boolean;
  allowUnsignedModules: boolean;
  moduleCleanupIntervalMs: number;
}

export class ModuleLoaderService extends EventEmitter {
  private logger: Logger;
  private loadedModules: Map<string, Module> = new Map();
  private moduleExecutions: Map<string, ModuleExecution> = new Map();
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private moduleInstances: Map<string, Map<string, any>> = new Map(); // moduleId -> implantId -> instance
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private config: ModuleLoaderConfig) {
    super();
    this.logger = Logger.getInstance();
    this.startCleanupTimer();
  }

  /**
   * Load a module with signature verification and sandboxing
   */
  async loadModule(request: ModuleLoadRequest): Promise<Module> {
    try {
      this.logger.info('Loading module', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
      });

      // Get module from storage
      const module = await this.getModuleFromStorage(request.moduleId);
      if (!module) {
        throw new Error(`Module ${request.moduleId} not found`);
      }

      // Verify digital signature if required
      if (request.verifySignature !== false && this.config.signatureVerificationRequired) {
        await this.verifyModuleSignature(module);
      }

      // Check if module is already loaded for this implant
      const moduleKey = `${request.moduleId}-${request.implantId}`;
      if (this.loadedModules.has(moduleKey)) {
        this.logger.warn('Module already loaded for implant', {
          moduleId: request.moduleId,
          implantId: request.implantId,
        });
        return this.loadedModules.get(moduleKey)!;
      }

      // Prepare sandbox environment if requested
      let sandboxPath: string | undefined;
      if (request.sandboxed !== false) {
        sandboxPath = await this.prepareSandboxEnvironment(module, request.implantId);
      }

      // Load module into memory
      const loadedModule = await this.loadModuleIntoMemory(module, request, sandboxPath);

      // Store loaded module
      this.loadedModules.set(moduleKey, loadedModule);

      // Initialize module instance map for this implant
      if (!this.moduleInstances.has(request.moduleId)) {
        this.moduleInstances.set(request.moduleId, new Map());
      }

      // Update module status
      loadedModule.status = ModuleStatus.LOADED;
      loadedModule.loadedAt = new Date();

      this.logger.info('Module loaded successfully', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        sandboxed: request.sandboxed !== false,
      });

      // Emit module loaded event
      const event: ModuleLoadedEvent = {
        type: 'module_loaded',
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
        timestamp: new Date(),
        data: {
          moduleName: module.metadata.name,
          category: module.metadata.category,
          loadTime: Date.now() - (loadedModule.loadedAt?.getTime() || Date.now()),
          sandboxed: request.sandboxed !== false,
        },
      };
      this.emitModuleEvent(event);

      return loadedModule;
    } catch (error) {
      this.logger.error('Failed to load module', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a module capability
   */
  async executeModule(request: ModuleExecuteRequest): Promise<ModuleExecution> {
    try {
      const moduleKey = `${request.moduleId}-${request.implantId}`;
      const module = this.loadedModules.get(moduleKey);

      if (!module) {
        throw new Error(`Module ${request.moduleId} not loaded for implant ${request.implantId}`);
      }

      // Validate capability exists
      const capability = module.metadata.capabilities.find(cap => cap.name === request.capability);
      if (!capability) {
        throw new Error(`Capability ${request.capability} not found in module ${request.moduleId}`);
      }

      // Validate parameters
      this.validateModuleParameters(capability.parameters || [], request.parameters);

      // Create execution record
      const execution: ModuleExecution = {
        id: uuidv4(),
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
        capability: request.capability,
        parameters: request.parameters,
        startTime: new Date(),
        status: ModuleStatus.EXECUTING,
        logs: [],
      };

      this.moduleExecutions.set(execution.id, execution);

      this.logger.info('Executing module capability', {
        executionId: execution.id,
        moduleId: request.moduleId,
        implantId: request.implantId,
        capability: request.capability,
      });

      // Emit execution started event
      const startEvent: ModuleExecutionStartedEvent = {
        type: 'module_execution_started',
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
        timestamp: new Date(),
        data: {
          moduleName: module.metadata.name,
          capability: request.capability,
          parameters: request.parameters,
        },
      };
      this.emitModuleEvent(startEvent);

      // Execute module in sandbox
      const result = await this.executeModuleInSandbox(module, execution, request);

      // Update execution record
      execution.endTime = new Date();
      execution.status = result.success ? ModuleStatus.COMPLETED : ModuleStatus.ERROR;
      execution.result = result;

      // Update module statistics
      module.executionCount++;
      module.lastExecuted = new Date();
      if (result.success) {
        module.successCount++;
      } else {
        module.failureCount++;
      }

      this.logger.info('Module execution completed', {
        executionId: execution.id,
        moduleId: request.moduleId,
        success: result.success,
        duration: execution.endTime.getTime() - execution.startTime.getTime(),
      });

      // Emit execution completed event
      const completedEvent: ModuleExecutionCompletedEvent = {
        type: 'module_execution_completed',
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
        timestamp: new Date(),
        data: {
          moduleName: module.metadata.name,
          capability: request.capability,
          success: result.success,
          duration: execution.endTime.getTime() - execution.startTime.getTime(),
          resultSize: result.size,
        },
      };
      this.emitModuleEvent(completedEvent);

      return execution;
    } catch (error) {
      this.logger.error('Module execution failed', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        capability: request.capability,
        error: error instanceof Error ? error.message : String(error),
      });

      // Emit execution failed event
      const failedEvent: ModuleExecutionFailedEvent = {
        type: 'module_execution_failed',
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
        timestamp: new Date(),
        data: {
          moduleName:
            this.loadedModules.get(`${request.moduleId}-${request.implantId}`)?.metadata.name ||
            'Unknown',
          capability: request.capability,
          error: error instanceof Error ? error.message : String(error),
          duration: 0,
        },
      };
      this.emitModuleEvent(failedEvent);

      throw error;
    }
  }

  /**
   * Unload a module from memory
   */
  async unloadModule(request: ModuleUnloadRequest): Promise<boolean> {
    try {
      const moduleKey = `${request.moduleId}-${request.implantId}`;
      const module = this.loadedModules.get(moduleKey);

      if (!module) {
        this.logger.warn('Module not loaded for unloading', {
          moduleId: request.moduleId,
          implantId: request.implantId,
        });
        return false;
      }

      // Check for running executions
      const runningExecutions = Array.from(this.moduleExecutions.values()).filter(
        exec =>
          exec.moduleId === request.moduleId &&
          exec.implantId === request.implantId &&
          exec.status === ModuleStatus.EXECUTING
      );

      if (runningExecutions.length > 0 && !request.force) {
        throw new Error(
          `Cannot unload module ${request.moduleId}: ${runningExecutions.length} executions still running`
        );
      }

      // Force stop running executions if requested
      if (request.force) {
        for (const execution of runningExecutions) {
          await this.stopExecution(execution.id);
        }
      }

      // Clean up module instance
      const moduleInstances = this.moduleInstances.get(request.moduleId);
      if (moduleInstances) {
        moduleInstances.delete(request.implantId);
        if (moduleInstances.size === 0) {
          this.moduleInstances.delete(request.moduleId);
        }
      }

      // Clean up sandbox environment
      await this.cleanupSandboxEnvironment(request.moduleId, request.implantId);

      // Remove from loaded modules
      this.loadedModules.delete(moduleKey);

      const uptime = module.loadedAt ? Date.now() - module.loadedAt.getTime() : 0;

      this.logger.info('Module unloaded successfully', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        uptime,
        executionCount: module.executionCount,
      });

      // Emit module unloaded event
      const event: ModuleUnloadedEvent = {
        type: 'module_unloaded',
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
        timestamp: new Date(),
        data: {
          moduleName: module.metadata.name,
          uptime,
          executionCount: module.executionCount,
        },
      };
      this.emitModuleEvent(event);

      return true;
    } catch (error) {
      this.logger.error('Failed to unload module', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get loaded modules
   */
  getLoadedModules(implantId?: string): Module[] {
    if (implantId) {
      return Array.from(this.loadedModules.entries())
        .filter(([key]) => key.endsWith(`-${implantId}`))
        .map(([, module]) => module);
    }
    return Array.from(this.loadedModules.values());
  }

  /**
   * Get module executions
   */
  getModuleExecutions(moduleId?: string, implantId?: string): ModuleExecution[] {
    return Array.from(this.moduleExecutions.values()).filter(execution => {
      if (moduleId && execution.moduleId !== moduleId) return false;
      if (implantId && execution.implantId !== implantId) return false;
      return true;
    });
  }

  /**
   * Stop a running execution
   */
  async stopExecution(executionId: string): Promise<boolean> {
    const execution = this.moduleExecutions.get(executionId);
    if (!execution || execution.status !== ModuleStatus.EXECUTING) {
      return false;
    }

    const process = this.runningProcesses.get(executionId);
    if (process) {
      process.kill('SIGTERM');
      this.runningProcesses.delete(executionId);
    }

    execution.status = ModuleStatus.FAILED;
    execution.endTime = new Date();
    execution.error = 'Execution stopped by operator';

    this.logger.info('Module execution stopped', { executionId });
    return true;
  }

  /**
   * Verify module digital signature
   */
  private async verifyModuleSignature(module: Module): Promise<void> {
    try {
      const { signature, algorithm, publicKey } = module.signature;

      // Check if public key is trusted
      if (!this.config.trustedPublicKeys.includes(publicKey)) {
        if (!this.config.allowUnsignedModules) {
          throw new Error('Module signed with untrusted key');
        }
        this.logger.warn('Module signed with untrusted key but allowed', {
          moduleId: module.id,
          issuer: module.signature.issuer,
        });
        return;
      }

      // Verify signature
      const verifier = createVerify(algorithm);
      verifier.update(module.binary);
      const isValid = verifier.verify(publicKey, signature, 'base64');

      if (!isValid) {
        throw new Error('Invalid module signature');
      }

      // Verify hash
      const actualHash = createHash('sha256').update(module.binary).digest('hex');
      if (actualHash !== module.hash) {
        throw new Error('Module hash mismatch');
      }

      this.logger.debug('Module signature verified successfully', {
        moduleId: module.id,
        issuer: module.signature.issuer,
      });
    } catch (error) {
      this.logger.error('Module signature verification failed', {
        moduleId: module.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Prepare sandbox environment for module execution
   */
  private async prepareSandboxEnvironment(module: Module, implantId: string): Promise<string> {
    const sandboxPath = path.join(this.config.sandboxDirectory, `${module.id}-${implantId}`);

    try {
      // Create sandbox directory
      await fs.mkdir(sandboxPath, { recursive: true });

      // Write module binary to sandbox
      const modulePath = path.join(sandboxPath, `${module.metadata.name}.exe`);
      await fs.writeFile(modulePath, module.binary);

      // Create sandbox configuration
      const configPath = path.join(sandboxPath, 'sandbox.json');
      await fs.writeFile(configPath, JSON.stringify(this.config.defaultSandboxConfig, null, 2));

      this.logger.debug('Sandbox environment prepared', {
        moduleId: module.id,
        implantId,
        sandboxPath,
      });

      return sandboxPath;
    } catch (error) {
      this.logger.error('Failed to prepare sandbox environment', {
        moduleId: module.id,
        implantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load module into memory (placeholder for actual implementation)
   */
  private async loadModuleIntoMemory(
    module: Module,
    _request: ModuleLoadRequest,
    _sandboxPath?: string
  ): Promise<Module> {
    // This is a simplified implementation
    // In a real scenario, this would involve loading the module binary
    // into a controlled execution environment

    const loadedModule = { ...module };
    loadedModule.status = ModuleStatus.LOADING;

    // Simulate loading time
    await new Promise(resolve => setTimeout(resolve, 100));

    return loadedModule;
  }

  /**
   * Execute module in sandbox environment
   */
  private async executeModuleInSandbox(
    _module: Module,
    execution: ModuleExecution,
    request: ModuleExecuteRequest
  ): Promise<ModuleExecutionResult> {
    return new Promise(resolve => {
      const timeout = request.timeout || this.config.executionTimeoutMs;
      const startTime = Date.now();

      // This is a simplified implementation
      // In a real scenario, this would execute the module in a sandboxed environment

      // Simulate execution
      const timer = setTimeout(
        () => {
          const duration = Date.now() - startTime;

          // Simulate different outcomes based on capability
          let success = true;
          let data: any = {};

          if (request.capability === 'dump_credentials') {
            data = {
              type: 'lsass',
              credentials: [
                {
                  username: 'testuser',
                  domain: 'TESTDOMAIN',
                  hash: 'aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0',
                  hashType: 'NTLM',
                  source: 'LSASS',
                  confidence: 95,
                },
              ],
              source: 'LSASS Memory',
              timestamp: new Date(),
            };
          } else if (request.capability === 'scan_network') {
            data = {
              type: 'port_scan',
              hosts: [
                {
                  ipAddress: '192.168.1.1',
                  hostname: 'gateway',
                  openPorts: [22, 80, 443],
                  services: [
                    {
                      port: 22,
                      protocol: 'tcp',
                      service: 'ssh',
                      version: 'OpenSSH 7.4',
                      state: 'open',
                      confidence: 100,
                    },
                  ],
                  isAlive: true,
                  responseTime: 5,
                  lastSeen: new Date(),
                },
              ],
              networks: [],
              services: [],
              timestamp: new Date(),
              scanDuration: duration,
            };
          }

          const result: ModuleExecutionResult = {
            success,
            data,
            type: request.capability,
            size: JSON.stringify(data).length,
            checksum: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
          };

          // Add execution log
          execution.logs.push({
            timestamp: new Date(),
            level: 'info',
            message: `Module execution completed in ${duration}ms`,
            data: { capability: request.capability, success },
          });

          resolve(result);
        },
        Math.min(timeout, 1000)
      ); // Simulate execution time

      // Store process reference (in real implementation, this would be the actual process)
      this.runningProcesses.set(execution.id, { kill: () => clearTimeout(timer) } as any);
    });
  }

  /**
   * Validate module parameters
   */
  private validateModuleParameters(parameterDefs: any[], parameters: Record<string, any>): void {
    for (const paramDef of parameterDefs) {
      if (paramDef.required && !(paramDef.name in parameters)) {
        throw new Error(`Required parameter '${paramDef.name}' is missing`);
      }

      if (paramDef.name in parameters) {
        const value = parameters[paramDef.name];
        const validation = paramDef.validation;

        if (validation) {
          if (validation.pattern && typeof value === 'string') {
            const regex = new RegExp(validation.pattern);
            if (!regex.test(value)) {
              throw new Error(`Parameter '${paramDef.name}' does not match pattern`);
            }
          }

          if (validation.enum && !validation.enum.includes(value)) {
            throw new Error(
              `Parameter '${paramDef.name}' must be one of: ${validation.enum.join(', ')}`
            );
          }

          if (typeof value === 'string') {
            if (validation.minLength && value.length < validation.minLength) {
              throw new Error(`Parameter '${paramDef.name}' is too short`);
            }
            if (validation.maxLength && value.length > validation.maxLength) {
              throw new Error(`Parameter '${paramDef.name}' is too long`);
            }
          }

          if (typeof value === 'number') {
            if (validation.min !== undefined && value < validation.min) {
              throw new Error(`Parameter '${paramDef.name}' is below minimum value`);
            }
            if (validation.max !== undefined && value > validation.max) {
              throw new Error(`Parameter '${paramDef.name}' is above maximum value`);
            }
          }
        }
      }
    }
  }

  /**
   * Get module from storage (placeholder)
   */
  private async getModuleFromStorage(_moduleId: string): Promise<Module | null> {
    // This would typically load from database or file system
    // For now, return null to indicate module not found
    return null;
  }

  /**
   * Clean up sandbox environment
   */
  private async cleanupSandboxEnvironment(moduleId: string, implantId: string): Promise<void> {
    const sandboxPath = path.join(this.config.sandboxDirectory, `${moduleId}-${implantId}`);

    try {
      await fs.rm(sandboxPath, { recursive: true, force: true });
      this.logger.debug('Sandbox environment cleaned up', { moduleId, implantId });
    } catch (error) {
      this.logger.warn('Failed to cleanup sandbox environment', {
        moduleId,
        implantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start cleanup timer for old executions
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldExecutions();
    }, this.config.moduleCleanupIntervalMs);
  }

  /**
   * Clean up old module executions
   */
  private cleanupOldExecutions(): void {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [id, execution] of this.moduleExecutions.entries()) {
      if (execution.endTime && execution.endTime < cutoffTime) {
        this.moduleExecutions.delete(id);
      }
    }

    this.logger.debug('Cleaned up old module executions');
  }

  /**
   * Emit module event
   */
  private emitModuleEvent(event: ModuleEvent): void {
    this.emit('moduleEvent', event);
  }

  /**
   * Stop the module loader service
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Stop all running processes
    for (const [, process] of this.runningProcesses.entries()) {
      process.kill('SIGTERM');
    }

    this.removeAllListeners();
    this.loadedModules.clear();
    this.moduleExecutions.clear();
    this.runningProcesses.clear();
    this.moduleInstances.clear();
  }
}
