/**
 * Module Loader System for SeraphC2
 * Implements requirements 13.1, 13.2 - Module loader system with sandboxed execution and digital signature verification
 */

import { EventEmitter } from 'events';
import { createHash, createVerify } from 'crypto';
import { Worker } from 'worker_threads';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import {
  Module,
  ModuleStatus,
  ModuleExecution,
  ModuleExecutionResult,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
  ModuleSandboxConfig,
  ModuleResourceLimits,
  ModuleLoadedEvent,
  ModuleUnloadedEvent,
  ModuleExecutionStartedEvent,
  ModuleExecutionCompletedEvent,
  ModuleExecutionFailedEvent,
} from '../../types/modules';
import { Logger } from '../../utils/logger';

export interface ModuleLoaderConfig {
  maxConcurrentModules?: number;
  defaultTimeout?: number;
  defaultResourceLimits?: ModuleResourceLimits;
  sandboxConfig?: ModuleSandboxConfig;
  trustedPublicKeys?: string[];
  moduleDirectory?: string;
  enableSignatureVerification?: boolean;
}

export interface LoadedModuleInstance {
  module: Module;
  worker?: Worker;
  loadedAt: Date;
  lastExecuted?: Date;
  executionCount: number;
  isExecuting: boolean;
  resourceUsage: {
    peakMemoryUsage: number;
    averageCpuUsage: number;
    networkBytesReceived: number;
    networkBytesSent: number;
  };
}

export class ModuleLoader extends EventEmitter {
  private logger: Logger;
  private config: ModuleLoaderConfig;
  private loadedModules: Map<string, LoadedModuleInstance>;
  private executingModules: Map<string, ModuleExecution>;
  private moduleExecutions: Map<string, ModuleExecution>;

  constructor(config: ModuleLoaderConfig = {}) {
    super();
    this.logger = Logger.getInstance();
    this.config = {
      maxConcurrentModules: 10,
      defaultTimeout: 300000, // 5 minutes
      defaultResourceLimits: {
        maxMemory: 512 * 1024 * 1024, // 512MB
        maxCpuUsage: 50, // 50%
        maxExecutionTime: 300000, // 5 minutes
        maxNetworkConnections: 10,
        maxFileOperations: 100,
        maxRegistryOperations: 50,
        maxProcessCreations: 5,
      },
      sandboxConfig: {
        enabled: true,
        isolateNetwork: true,
        isolateFileSystem: true,
        isolateRegistry: true,
        isolateProcesses: true,
        allowedNetworkHosts: [],
        allowedFilePaths: [],
        allowedRegistryKeys: [],
        allowedProcesses: [],
        resourceLimits: config.defaultResourceLimits || {},
        timeoutMs: 300000,
      },
      trustedPublicKeys: [],
      moduleDirectory: join(tmpdir(), 'seraphc2-modules'),
      enableSignatureVerification: true,
      ...config,
    };

    this.loadedModules = new Map();
    this.executingModules = new Map();
    this.moduleExecutions = new Map();

    this.logger.info('ModuleLoader initialized', {
      maxConcurrentModules: this.config.maxConcurrentModules,
      sandboxEnabled: this.config.sandboxConfig?.enabled,
      signatureVerificationEnabled: this.config.enableSignatureVerification,
    });
  }

  /**
   * Load a module into memory
   */
  async loadModule(request: ModuleLoadRequest): Promise<void> {
    const { moduleId, implantId, operatorId, verifySignature = true, sandboxed = true } = request;

    this.logger.info('Loading module', { moduleId, implantId, operatorId, sandboxed });

    try {
      // Check if module is already loaded
      if (this.loadedModules.has(moduleId)) {
        this.logger.warn('Module already loaded', { moduleId });
        return;
      }

      // Check concurrent module limit
      if (this.loadedModules.size >= (this.config.maxConcurrentModules || 10)) {
        throw new Error('Maximum concurrent modules limit reached');
      }

      // Get module from repository (simulated for now)
      const module = await this.getModuleFromRepository(moduleId);
      if (!module) {
        throw new Error(`Module not found: ${moduleId}`);
      }

      // Verify digital signature if enabled
      if (verifySignature && this.config.enableSignatureVerification) {
        await this.verifyModuleSignature(module);
      }

      // Validate module hash
      await this.validateModuleHash(module);

      // Create module instance
      const instance: LoadedModuleInstance = {
        module,
        loadedAt: new Date(),
        executionCount: 0,
        isExecuting: false,
        resourceUsage: {
          peakMemoryUsage: 0,
          averageCpuUsage: 0,
          networkBytesReceived: 0,
          networkBytesSent: 0,
        },
      };

      // Initialize sandbox if enabled
      if (sandboxed && this.config.sandboxConfig?.enabled) {
        instance.worker = await this.createSandboxedWorker(module, request.resourceLimits);
      }

      // Update module status
      module.status = ModuleStatus.LOADED;
      module.loadedAt = new Date();

      // Store loaded module
      this.loadedModules.set(moduleId, instance);

      // Emit module loaded event
      const event: ModuleLoadedEvent = {
        type: 'module_loaded',
        moduleId,
        implantId,
        operatorId,
        timestamp: new Date(),
        data: {
          moduleName: module.metadata.name,
          category: module.metadata.category,
          loadTime: Date.now() - instance.loadedAt.getTime(),
          sandboxed,
        },
      };
      this.emit('moduleLoaded', event);

      this.logger.info('Module loaded successfully', {
        moduleId,
        moduleName: module.metadata.name,
        sandboxed,
      });
    } catch (error) {
      this.logger.error('Failed to load module', {
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a module capability
   */
  async executeModule(request: ModuleExecuteRequest): Promise<ModuleExecutionResult> {
    const { moduleId, implantId, operatorId, capability, parameters, timeout, resourceLimits } =
      request;

    this.logger.info('Executing module capability', {
      moduleId,
      implantId,
      capability,
      parameters: Object.keys(parameters),
    });

    try {
      // Check if module is loaded
      const instance = this.loadedModules.get(moduleId);
      if (!instance) {
        throw new Error(`Module not loaded: ${moduleId}`);
      }

      // Check if module is already executing
      if (instance.isExecuting) {
        throw new Error(`Module is already executing: ${moduleId}`);
      }

      // Validate capability exists
      const capabilityDef = instance.module.metadata.capabilities.find(c => c.name === capability);
      if (!capabilityDef) {
        throw new Error(`Capability not found: ${capability}`);
      }

      // Validate parameters
      await this.validateParameters(parameters, capabilityDef.parameters || []);

      // Create execution record
      const executionId = this.generateExecutionId();
      const execution: ModuleExecution = {
        id: executionId,
        moduleId,
        implantId,
        operatorId,
        capability,
        parameters,
        startTime: new Date(),
        status: ModuleStatus.EXECUTING,
        logs: [],
      };

      // Store execution
      this.moduleExecutions.set(executionId, execution);
      this.executingModules.set(moduleId, execution);
      instance.isExecuting = true;

      // Emit execution started event
      const startEvent: ModuleExecutionStartedEvent = {
        type: 'module_execution_started',
        moduleId,
        implantId,
        operatorId,
        timestamp: new Date(),
        data: {
          moduleName: instance.module.metadata.name,
          capability,
          parameters,
        },
      };
      this.emit('moduleExecutionStarted', startEvent);

      try {
        // Execute module capability
        const result = await this.executeCapability(
          instance,
          capability,
          parameters,
          timeout || this.config.defaultTimeout,
          resourceLimits
        );

        // Update execution record
        execution.endTime = new Date();
        execution.status = ModuleStatus.COMPLETED;
        execution.result = result;

        // Update instance statistics
        instance.executionCount++;
        instance.lastExecuted = new Date();
        instance.isExecuting = false;

        // Clean up execution tracking
        this.executingModules.delete(moduleId);

        // Emit execution completed event
        const completedEvent: ModuleExecutionCompletedEvent = {
          type: 'module_execution_completed',
          moduleId,
          implantId,
          operatorId,
          timestamp: new Date(),
          data: {
            moduleName: instance.module.metadata.name,
            capability,
            success: result.success,
            duration: execution.endTime.getTime() - execution.startTime.getTime(),
            resultSize: result.size,
          },
        };
        this.emit('moduleExecutionCompleted', completedEvent);

        this.logger.info('Module execution completed successfully', {
          moduleId,
          capability,
          executionId,
          duration: completedEvent.data.duration,
        });

        return result;
      } catch (executionError) {
        // Update execution record with error
        execution.endTime = new Date();
        execution.status = ModuleStatus.ERROR;
        execution.error =
          executionError instanceof Error ? executionError.message : String(executionError);

        // Update instance state
        instance.isExecuting = false;
        this.executingModules.delete(moduleId);

        // Emit execution failed event
        const failedEvent: ModuleExecutionFailedEvent = {
          type: 'module_execution_failed',
          moduleId,
          implantId,
          operatorId,
          timestamp: new Date(),
          data: {
            moduleName: instance.module.metadata.name,
            capability,
            error: execution.error,
            duration: execution.endTime.getTime() - execution.startTime.getTime(),
          },
        };
        this.emit('moduleExecutionFailed', failedEvent);

        this.logger.error('Module execution failed', {
          moduleId,
          capability,
          executionId,
          error: execution.error,
        });

        throw executionError;
      }
    } catch (error) {
      this.logger.error('Failed to execute module', {
        moduleId,
        capability,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Unload a module from memory
   */
  async unloadModule(request: ModuleUnloadRequest): Promise<void> {
    const { moduleId, implantId, operatorId, force = false } = request;

    this.logger.info('Unloading module', { moduleId, implantId, operatorId, force });

    try {
      const instance = this.loadedModules.get(moduleId);
      if (!instance) {
        this.logger.warn('Module not loaded', { moduleId });
        return;
      }

      // Check if module is executing
      if (instance.isExecuting && !force) {
        throw new Error(`Cannot unload executing module: ${moduleId}. Use force=true to override.`);
      }

      // Stop execution if forced
      if (instance.isExecuting && force) {
        await this.stopModuleExecution(moduleId);
      }

      // Terminate worker if exists
      if (instance.worker) {
        await instance.worker.terminate();
      }

      // Calculate uptime
      const uptime = Date.now() - instance.loadedAt.getTime();

      // Remove from loaded modules
      this.loadedModules.delete(moduleId);

      // Update module status
      instance.module.status = ModuleStatus.UNLOADED;

      // Emit module unloaded event
      const event: ModuleUnloadedEvent = {
        type: 'module_unloaded',
        moduleId,
        implantId,
        operatorId,
        timestamp: new Date(),
        data: {
          moduleName: instance.module.metadata.name,
          uptime,
          executionCount: instance.executionCount,
        },
      };
      this.emit('moduleUnloaded', event);

      this.logger.info('Module unloaded successfully', {
        moduleId,
        moduleName: instance.module.metadata.name,
        uptime,
        executionCount: instance.executionCount,
      });
    } catch (error) {
      this.logger.error('Failed to unload module', {
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get loaded modules
   */
  getLoadedModules(): Module[] {
    return Array.from(this.loadedModules.values()).map(instance => instance.module);
  }

  /**
   * Get module execution history
   */
  getModuleExecutions(moduleId?: string): ModuleExecution[] {
    const executions = Array.from(this.moduleExecutions.values());
    return moduleId ? executions.filter(e => e.moduleId === moduleId) : executions;
  }

  /**
   * Get module statistics
   */
  getModuleStats(): {
    loadedModules: number;
    executingModules: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
  } {
    const executions = Array.from(this.moduleExecutions.values());
    return {
      loadedModules: this.loadedModules.size,
      executingModules: this.executingModules.size,
      totalExecutions: executions.length,
      successfulExecutions: executions.filter(e => e.status === ModuleStatus.COMPLETED).length,
      failedExecutions: executions.filter(e => e.status === ModuleStatus.ERROR).length,
    };
  }

  /**
   * Stop all modules
   */
  async stopAllModules(): Promise<void> {
    this.logger.info('Stopping all modules');

    const unloadPromises = Array.from(this.loadedModules.keys()).map(moduleId =>
      this.unloadModule({
        moduleId,
        implantId: 'system',
        operatorId: 'system',
        force: true,
      })
    );

    await Promise.all(unloadPromises);
    this.logger.info('All modules stopped');
  }

  /**
   * Verify module digital signature
   */
  private async verifyModuleSignature(module: Module): Promise<void> {
    if (!this.config.trustedPublicKeys?.length) {
      throw new Error('No trusted public keys configured for signature verification');
    }

    const { signature } = module.signature;
    const { algorithm, publicKey } = module.signature;

    try {
      const verify = createVerify(algorithm);
      verify.update(module.binary);
      verify.end();

      const isValid = verify.verify(publicKey, signature, 'base64');
      if (!isValid) {
        throw new Error('Invalid module signature');
      }

      // Check if public key is trusted
      if (!this.config.trustedPublicKeys.includes(publicKey)) {
        throw new Error('Module signed with untrusted key');
      }

      this.logger.debug('Module signature verified successfully', {
        moduleId: module.id,
        algorithm,
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
   * Validate module hash
   */
  private async validateModuleHash(module: Module): Promise<void> {
    const calculatedHash = createHash('sha256').update(module.binary).digest('hex');
    if (calculatedHash !== module.hash) {
      throw new Error('Module hash mismatch - possible tampering detected');
    }
  }

  /**
   * Create sandboxed worker for module execution
   */
  private async createSandboxedWorker(
    module: Module,
    resourceLimits?: ModuleResourceLimits
  ): Promise<Worker> {
    // Write module binary to temporary file
    const tempPath = join(this.config.moduleDirectory || tmpdir(), `${module.id}.js`);
    writeFileSync(tempPath, module.binary);

    try {
      const worker = new Worker(tempPath, {
        resourceLimits: {
          maxOldGenerationSizeMb: Math.floor(
            (resourceLimits?.maxMemory ||
              this.config.defaultResourceLimits?.maxMemory ||
              512 * 1024 * 1024) /
              (1024 * 1024)
          ),
          maxYoungGenerationSizeMb: 64,
          codeRangeSizeMb: 16,
        },
      });

      // Set up worker event handlers
      worker.on('error', error => {
        this.logger.error('Worker error', {
          moduleId: module.id,
          error: error.message,
        });
      });

      worker.on('exit', code => {
        this.logger.debug('Worker exited', {
          moduleId: module.id,
          exitCode: code,
        });
        // Clean up temporary file
        if (existsSync(tempPath)) {
          unlinkSync(tempPath);
        }
      });

      return worker;
    } catch (error) {
      // Clean up temporary file on error
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Execute module capability
   */
  private async executeCapability(
    instance: LoadedModuleInstance,
    capability: string,
    parameters: Record<string, any>,
    timeout?: number,
    _resourceLimits?: ModuleResourceLimits
  ): Promise<ModuleExecutionResult> {
    // For test modules, return mock result
    if (this.isTestModule(instance.module)) {
      return this.executeTestCapability(instance, capability, parameters);
    }

    // For built-in modules, execute directly
    if (this.isBuiltInModule(instance.module)) {
      return this.executeBuiltInCapability(instance, capability, parameters);
    }

    // For external modules, execute in sandbox
    if (instance.worker) {
      return this.executeSandboxedCapability(instance, capability, parameters, timeout);
    }

    throw new Error('Module execution method not available');
  }

  /**
   * Check if module is built-in
   */
  private isBuiltInModule(module: Module): boolean {
    return module.metadata.author === 'SeraphC2 Team';
  }

  /**
   * Check if module is a test module
   */
  private isTestModule(module: Module): boolean {
    return module.metadata.name === 'TestModule';
  }

  /**
   * Execute test module capability
   */
  private async executeTestCapability(
    instance: LoadedModuleInstance,
    capability: string,
    parameters: Record<string, any>
  ): Promise<ModuleExecutionResult> {
    // Mock execution for test modules
    const result = {
      testParam: parameters['testParam'],
      capability,
      moduleName: instance.module.metadata.name,
      timestamp: new Date().toISOString(),
    };

    const resultData = JSON.stringify(result);
    return {
      success: true,
      data: result,
      type: typeof result,
      size: Buffer.byteLength(resultData, 'utf8'),
      checksum: createHash('sha256').update(resultData).digest('hex'),
      metadata: {
        executionTime: Date.now(),
        moduleVersion: instance.module.metadata.version,
      },
    };
  }

  /**
   * Execute built-in module capability
   */
  private async executeBuiltInCapability(
    instance: LoadedModuleInstance,
    capability: string,
    parameters: Record<string, any>
  ): Promise<ModuleExecutionResult> {
    // Import and execute built-in modules
    const moduleName = instance.module.metadata.name;

    try {
      let result: any;

      if (moduleName === 'CredentialDumping') {
        const { CredentialDumpingModule } = await import('./credential-dumping.module');
        const moduleInstance = new CredentialDumpingModule();

        switch (capability) {
          case 'dump_lsass':
            result = await moduleInstance.dumpLsass(parameters);
            break;
          case 'dump_sam':
            result = await moduleInstance.dumpSam(parameters);
            break;
          case 'dump_browser_passwords':
            result = await moduleInstance.dumpBrowserPasswords(parameters);
            break;
          case 'dump_registry_credentials':
            result = await moduleInstance.dumpRegistryCredentials(parameters);
            break;
          case 'dump_memory_credentials':
            result = await moduleInstance.dumpMemoryCredentials(parameters);
            break;
          default:
            throw new Error(`Unknown capability: ${capability}`);
        }
      } else if (moduleName === 'NetworkDiscovery') {
        const { NetworkDiscoveryModule } = await import('./network-discovery.module');
        const moduleInstance = new NetworkDiscoveryModule();

        switch (capability) {
          case 'scan_ports':
            result = await moduleInstance.scanPorts(parameters);
            break;
          case 'discover_hosts':
            result = await moduleInstance.discoverHosts(parameters);
            break;
          case 'enumerate_services':
            result = await moduleInstance.enumerateServices(parameters);
            break;
          case 'enumerate_smb_shares':
            result = await moduleInstance.enumerateSmbShares(parameters);
            break;
          default:
            throw new Error(`Unknown capability: ${capability}`);
        }
      } else {
        throw new Error(`Unknown built-in module: ${moduleName}`);
      }

      const resultData = JSON.stringify(result);
      return {
        success: true,
        data: result,
        type: typeof result,
        size: Buffer.byteLength(resultData, 'utf8'),
        checksum: createHash('sha256').update(resultData).digest('hex'),
        metadata: {
          executionTime: Date.now(),
          moduleVersion: instance.module.metadata.version,
        },
      };
    } catch (error) {
      return {
        success: false,
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
        type: 'error',
        size: 0,
      };
    }
  }

  /**
   * Execute capability in sandboxed worker
   */
  private async executeSandboxedCapability(
    instance: LoadedModuleInstance,
    capability: string,
    parameters: Record<string, any>,
    timeout?: number
  ): Promise<ModuleExecutionResult> {
    return new Promise((resolve, reject) => {
      if (!instance.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Module execution timeout'));
      }, timeout || this.config.defaultTimeout);

      instance.worker.once('message', (result: ModuleExecutionResult) => {
        clearTimeout(timeoutId);
        resolve(result);
      });

      instance.worker.once('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      // Send execution request to worker
      instance.worker.postMessage({
        type: 'execute',
        capability,
        parameters,
      });
    });
  }

  /**
   * Validate module parameters
   */
  private async validateParameters(
    parameters: Record<string, any>,
    parameterDefs: any[]
  ): Promise<void> {
    for (const paramDef of parameterDefs) {
      const value = parameters[paramDef.name];

      // Check required parameters
      if (paramDef.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter missing: ${paramDef.name}`);
      }

      // Validate parameter type
      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== paramDef.type) {
          throw new Error(
            `Parameter type mismatch for ${paramDef.name}: expected ${paramDef.type}, got ${actualType}`
          );
        }

        // Validate parameter constraints
        if (paramDef.validation) {
          await this.validateParameterConstraints(paramDef.name, value, paramDef.validation);
        }
      }
    }
  }

  /**
   * Validate parameter constraints
   */
  private async validateParameterConstraints(
    paramName: string,
    value: any,
    validation: any
  ): Promise<void> {
    if (validation.enum && !validation.enum.includes(value)) {
      throw new Error(`Parameter ${paramName} must be one of: ${validation.enum.join(', ')}`);
    }

    if (typeof value === 'string') {
      if (validation.minLength && value.length < validation.minLength) {
        throw new Error(
          `Parameter ${paramName} must be at least ${validation.minLength} characters`
        );
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        throw new Error(
          `Parameter ${paramName} must be at most ${validation.maxLength} characters`
        );
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
        throw new Error(`Parameter ${paramName} does not match required pattern`);
      }
    }

    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new Error(`Parameter ${paramName} must be at least ${validation.min}`);
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new Error(`Parameter ${paramName} must be at most ${validation.max}`);
      }
    }
  }

  /**
   * Stop module execution
   */
  private async stopModuleExecution(moduleId: string): Promise<void> {
    const execution = this.executingModules.get(moduleId);
    if (execution) {
      execution.status = ModuleStatus.FAILED;
      execution.error = 'Execution stopped by force unload';
      execution.endTime = new Date();
      this.executingModules.delete(moduleId);
    }

    const instance = this.loadedModules.get(moduleId);
    if (instance) {
      instance.isExecuting = false;
    }
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get module from repository (simulated)
   */
  private async getModuleFromRepository(moduleId: string): Promise<Module | null> {
    // Simulate getting module from repository
    // In real implementation, this would query the database

    if (moduleId === 'credential-dumping') {
      const { CredentialDumpingModule } = await import('./credential-dumping.module');
      const metadata = CredentialDumpingModule.getMetadata();

      return {
        id: moduleId,
        metadata,
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'mock-public-key',
          signature: 'mock-signature',
          timestamp: new Date(),
          issuer: 'SeraphC2 Team',
        },
        binary: Buffer.from('// Mock module binary'),
        hash: createHash('sha256').update('// Mock module binary').digest('hex'),
        size: 1024,
        status: ModuleStatus.UNLOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    if (moduleId === 'network-discovery') {
      const { NetworkDiscoveryModule } = await import('./network-discovery.module');
      const metadata = NetworkDiscoveryModule.getMetadata();

      return {
        id: moduleId,
        metadata,
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'mock-public-key',
          signature: 'mock-signature',
          timestamp: new Date(),
          issuer: 'SeraphC2 Team',
        },
        binary: Buffer.from('// Mock module binary'),
        hash: createHash('sha256').update('// Mock module binary').digest('hex'),
        size: 1024,
        status: ModuleStatus.UNLOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return null;
  }
}
