/**
 * Module Manager Service for SeraphC2
 * Implements module management interface and coordinates with module loader
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import {
  Module,
  ModuleExecution,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
  ModuleListFilter,
  ModuleExecutionFilter,
  ModuleStatus,
  ModuleCategory,
  ModuleMetadata,
  ModuleSignature,
} from '../../types/modules';
import { ModuleLoaderService, ModuleLoaderConfig } from './module-loader.service';
import { CredentialDumpingModule } from '../modules/credential-dumping.module';
import { NetworkDiscoveryModule } from '../modules/network-discovery.module';
import { Logger } from '../../utils/logger';

export interface ModuleManagerConfig {
  moduleStoragePath: string;
  enableBuiltinModules: boolean;
  autoLoadBuiltinModules: boolean;
  moduleLoaderConfig: ModuleLoaderConfig;
}

export class ModuleManagerService extends EventEmitter {
  private logger: Logger;
  private moduleLoader: ModuleLoaderService;
  private moduleRegistry: Map<string, Module> = new Map();
  private builtinModules: Map<string, any> = new Map();

  constructor(private config: ModuleManagerConfig) {
    super();
    this.logger = Logger.getInstance();
    this.moduleLoader = new ModuleLoaderService(config.moduleLoaderConfig);

    // Forward module loader events
    this.moduleLoader.on('moduleEvent', event => {
      this.emit('moduleEvent', event);
    });

    this.initializeBuiltinModules();
  }

  /**
   * Initialize built-in modules
   */
  private initializeBuiltinModules(): void {
    if (!this.config.enableBuiltinModules) {
      return;
    }

    try {
      // Register credential dumping module
      const credentialModule = this.createBuiltinModule(
        'credential-dumping',
        CredentialDumpingModule.getMetadata(),
        CredentialDumpingModule
      );
      this.moduleRegistry.set(credentialModule.id, credentialModule);
      this.builtinModules.set(credentialModule.id, CredentialDumpingModule);

      // Register network discovery module
      const networkModule = this.createBuiltinModule(
        'network-discovery',
        NetworkDiscoveryModule.getMetadata(),
        NetworkDiscoveryModule
      );
      this.moduleRegistry.set(networkModule.id, networkModule);
      this.builtinModules.set(networkModule.id, NetworkDiscoveryModule);

      this.logger.info('Built-in modules initialized', {
        credentialModuleId: credentialModule.id,
        networkModuleId: networkModule.id,
      });
    } catch (error) {
      this.logger.error('Failed to initialize built-in modules', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create a built-in module entry
   */
  private createBuiltinModule(name: string, metadata: ModuleMetadata, _moduleClass: any): Module {
    const moduleId = uuidv4();
    const binary = Buffer.from(`// Built-in module: ${name}`);
    const hash = createHash('sha256').update(binary).digest('hex');

    // Create a dummy signature for built-in modules
    const signature: ModuleSignature = {
      algorithm: 'RSA-SHA256',
      publicKey: 'builtin-key',
      signature: 'builtin-signature',
      timestamp: new Date(),
      issuer: 'SeraphC2 Team',
    };

    return {
      id: moduleId,
      metadata,
      signature,
      binary,
      hash,
      size: binary.length,
      status: ModuleStatus.UNLOADED,
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * List available modules
   */
  listModules(filter?: ModuleListFilter): Module[] {
    let modules = Array.from(this.moduleRegistry.values());

    if (filter) {
      if (filter.category) {
        modules = modules.filter(m => m.metadata.category === filter.category);
      }
      if (filter.status) {
        modules = modules.filter(m => m.status === filter.status);
      }
      if (filter.author) {
        modules = modules.filter(m =>
          m.metadata.author.toLowerCase().includes(filter.author!.toLowerCase())
        );
      }
      if (filter.tags && filter.tags.length > 0) {
        modules = modules.filter(m => filter.tags!.some(tag => m.metadata.tags.includes(tag)));
      }
      if (filter.namePattern) {
        const pattern = new RegExp(filter.namePattern, 'i');
        modules = modules.filter(m => pattern.test(m.metadata.name));
      }
      if (filter.loadedOnly) {
        const loadedModules = this.moduleLoader.getLoadedModules(filter.implantId);
        const loadedIds = loadedModules.map(m => m.id);
        modules = modules.filter(m => loadedIds.includes(m.id));
      }
    }

    return modules.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }

  /**
   * Get module by ID
   */
  getModule(moduleId: string): Module | undefined {
    return this.moduleRegistry.get(moduleId);
  }

  /**
   * Load a module
   */
  async loadModule(request: ModuleLoadRequest): Promise<Module> {
    try {
      this.logger.info('Loading module via manager', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        operatorId: request.operatorId,
      });

      // Check if module exists in registry
      const module = this.moduleRegistry.get(request.moduleId);
      if (!module) {
        throw new Error(`Module ${request.moduleId} not found in registry`);
      }

      // For built-in modules, handle loading differently
      if (this.builtinModules.has(request.moduleId)) {
        return await this.loadBuiltinModule(request, module);
      }

      // Load external module through module loader
      return await this.moduleLoader.loadModule(request);
    } catch (error) {
      this.logger.error('Failed to load module via manager', {
        moduleId: request.moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Load a built-in module
   */
  private async loadBuiltinModule(request: ModuleLoadRequest, module: Module): Promise<Module> {
    // For built-in modules, we don't need to load binaries
    // Just mark as loaded and return
    const loadedModule = { ...module };
    loadedModule.status = ModuleStatus.LOADED;
    loadedModule.loadedAt = new Date();

    this.logger.info('Built-in module loaded', {
      moduleId: request.moduleId,
      moduleName: module.metadata.name,
      implantId: request.implantId,
    });

    return loadedModule;
  }

  /**
   * Execute a module capability
   */
  async executeModule(request: ModuleExecuteRequest): Promise<ModuleExecution> {
    try {
      this.logger.info('Executing module via manager', {
        moduleId: request.moduleId,
        implantId: request.implantId,
        capability: request.capability,
      });

      // Check if it's a built-in module
      if (this.builtinModules.has(request.moduleId)) {
        return await this.executeBuiltinModule(request);
      }

      // Execute external module through module loader
      return await this.moduleLoader.executeModule(request);
    } catch (error) {
      this.logger.error('Failed to execute module via manager', {
        moduleId: request.moduleId,
        capability: request.capability,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute a built-in module capability
   */
  private async executeBuiltinModule(request: ModuleExecuteRequest): Promise<ModuleExecution> {
    const moduleClass = this.builtinModules.get(request.moduleId);
    if (!moduleClass) {
      throw new Error(`Built-in module ${request.moduleId} not found`);
    }

    const module = this.moduleRegistry.get(request.moduleId)!;
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

    try {
      // Create module instance
      const moduleInstance = new moduleClass();

      // Execute the capability
      let result: any;
      switch (request.capability) {
        // Credential dumping capabilities
        case 'dump_lsass':
          result = await moduleInstance.dumpLsass(request.parameters);
          break;
        case 'dump_sam':
          result = await moduleInstance.dumpSam(request.parameters);
          break;
        case 'dump_browser_passwords':
          result = await moduleInstance.dumpBrowserPasswords(request.parameters);
          break;
        case 'dump_registry_credentials':
          result = await moduleInstance.dumpRegistryCredentials(request.parameters);
          break;
        case 'dump_memory_credentials':
          result = await moduleInstance.dumpMemoryCredentials(request.parameters);
          break;

        // Network discovery capabilities
        case 'scan_ports':
          result = await moduleInstance.scanPorts(request.parameters);
          break;
        case 'discover_hosts':
          result = await moduleInstance.discoverHosts(request.parameters);
          break;
        case 'enumerate_services':
          result = await moduleInstance.enumerateServices(request.parameters);
          break;
        case 'enumerate_smb_shares':
          result = await moduleInstance.enumerateSmbShares(request.parameters);
          break;
        case 'enumerate_dns':
          result = await moduleInstance.enumerateDns(request.parameters);
          break;
        case 'scan_web_directories':
          result = await moduleInstance.scanWebDirectories(request.parameters);
          break;

        default:
          throw new Error(`Unknown capability: ${request.capability}`);
      }

      const endTime = new Date();
      const duration = endTime.getTime() - execution.startTime.getTime();

      // Update execution record
      execution.endTime = endTime;
      execution.status = ModuleStatus.COMPLETED;
      execution.result = {
        success: true,
        data: result,
        type: request.capability,
        size: JSON.stringify(result).length,
        checksum: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      };

      // Add execution log
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Built-in module execution completed in ${duration}ms`,
        data: { capability: request.capability, success: true },
      });

      // Update module statistics
      module.executionCount++;
      module.lastExecuted = new Date();
      module.successCount++;

      this.logger.info('Built-in module execution completed', {
        moduleId: request.moduleId,
        capability: request.capability,
        duration,
        resultSize: execution.result.size,
      });

      return execution;
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - execution.startTime.getTime();

      // Update execution record with error
      execution.endTime = endTime;
      execution.status = ModuleStatus.ERROR;
      execution.error = error instanceof Error ? error.message : String(error);

      // Add error log
      execution.logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `Built-in module execution failed: ${execution.error}`,
        data: { capability: request.capability, success: false },
      });

      // Update module statistics
      module.executionCount++;
      module.lastExecuted = new Date();
      module.failureCount++;

      this.logger.error('Built-in module execution failed', {
        moduleId: request.moduleId,
        capability: request.capability,
        duration,
        error: execution.error,
      });

      return execution;
    }
  }

  /**
   * Unload a module
   */
  async unloadModule(request: ModuleUnloadRequest): Promise<boolean> {
    try {
      this.logger.info('Unloading module via manager', {
        moduleId: request.moduleId,
        implantId: request.implantId,
      });

      // For built-in modules, just mark as unloaded
      if (this.builtinModules.has(request.moduleId)) {
        const module = this.moduleRegistry.get(request.moduleId);
        if (module) {
          module.status = ModuleStatus.UNLOADED;
          delete module.loadedAt;
        }

        this.logger.info('Built-in module unloaded', {
          moduleId: request.moduleId,
          implantId: request.implantId,
        });

        return true;
      }

      // Unload external module through module loader
      return await this.moduleLoader.unloadModule(request);
    } catch (error) {
      this.logger.error('Failed to unload module via manager', {
        moduleId: request.moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get loaded modules for an implant
   */
  getLoadedModules(implantId?: string): Module[] {
    if (implantId) {
      // For built-in modules, check status
      const builtinLoaded = Array.from(this.moduleRegistry.values()).filter(
        m => this.builtinModules.has(m.id) && m.status === ModuleStatus.LOADED
      );

      // Get external loaded modules
      const externalLoaded = this.moduleLoader.getLoadedModules(implantId);

      return [...builtinLoaded, ...externalLoaded];
    }

    return this.moduleLoader.getLoadedModules();
  }

  /**
   * Get module executions
   */
  getModuleExecutions(filter?: ModuleExecutionFilter): ModuleExecution[] {
    return this.moduleLoader.getModuleExecutions(filter?.moduleId, filter?.implantId);
  }

  /**
   * Stop a running execution
   */
  async stopExecution(executionId: string): Promise<boolean> {
    return await this.moduleLoader.stopExecution(executionId);
  }

  /**
   * Install a new module
   */
  async installModule(
    moduleData: Buffer,
    metadata: ModuleMetadata,
    signature?: ModuleSignature
  ): Promise<Module> {
    try {
      const moduleId = uuidv4();
      const hash = createHash('sha256').update(moduleData).digest('hex');

      // Create default signature if not provided
      const moduleSignature = signature || {
        algorithm: 'RSA-SHA256' as const,
        publicKey: 'unsigned',
        signature: 'unsigned',
        timestamp: new Date(),
        issuer: 'Unknown',
      };

      const module: Module = {
        id: moduleId,
        metadata,
        signature: moduleSignature,
        binary: moduleData,
        hash,
        size: moduleData.length,
        status: ModuleStatus.UNLOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Store in registry
      this.moduleRegistry.set(moduleId, module);

      // TODO: Persist to storage

      this.logger.info('Module installed', {
        moduleId,
        moduleName: metadata.name,
        size: moduleData.length,
        category: metadata.category,
      });

      return module;
    } catch (error) {
      this.logger.error('Failed to install module', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Uninstall a module
   */
  async uninstallModule(moduleId: string): Promise<boolean> {
    try {
      const module = this.moduleRegistry.get(moduleId);
      if (!module) {
        return false;
      }

      // Don't allow uninstalling built-in modules
      if (this.builtinModules.has(moduleId)) {
        throw new Error('Cannot uninstall built-in modules');
      }

      // Remove from registry
      this.moduleRegistry.delete(moduleId);

      // TODO: Remove from storage

      this.logger.info('Module uninstalled', {
        moduleId,
        moduleName: module.metadata.name,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to uninstall module', {
        moduleId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get module categories
   */
  getModuleCategories(): ModuleCategory[] {
    return Object.values(ModuleCategory);
  }

  /**
   * Get modules by category
   */
  getModulesByCategory(category: ModuleCategory): Module[] {
    return Array.from(this.moduleRegistry.values())
      .filter(m => m.metadata.category === category)
      .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  }

  /**
   * Search modules
   */
  searchModules(query: string): Module[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.moduleRegistry.values()).filter(
      module =>
        module.metadata.name.toLowerCase().includes(lowerQuery) ||
        module.metadata.description.toLowerCase().includes(lowerQuery) ||
        module.metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Stop the module manager service
   */
  stop(): void {
    this.moduleLoader.stop();
    this.removeAllListeners();
    this.moduleRegistry.clear();
    this.builtinModules.clear();
  }
}
