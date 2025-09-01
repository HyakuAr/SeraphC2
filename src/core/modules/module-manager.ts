/**
 * Module Manager for SeraphC2
 * Implements requirement 13.1 - Module management interface
 */

import { EventEmitter } from 'events';
import { ModuleLoader, ModuleLoaderConfig } from './module-loader';
import { createErrorWithContext } from '../../types/errors';
import {
  Module,
  ModuleExecution,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
  ModuleListFilter,
  ModuleExecutionFilter,
  ModuleExecutionResult,
  ModuleStatus,
  ModuleCategory,
} from '../../types/modules';
import { Logger } from '../../utils/logger';

export interface ModuleManagerConfig extends ModuleLoaderConfig {
  autoLoadBuiltInModules?: boolean;
  moduleRepositoryPath?: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  category: ModuleCategory;
  author: string;
  description: string;
  status: ModuleStatus;
  loadedAt?: Date | undefined;
  lastExecuted?: Date | undefined;
  executionCount: number;
  successCount: number;
  failureCount: number;
  capabilities: string[];
}

export class ModuleManager extends EventEmitter {
  private logger: Logger;
  private config: ModuleManagerConfig;
  private moduleLoader: ModuleLoader;
  private moduleRegistry: Map<string, Module>;

  constructor(config: ModuleManagerConfig = {}) {
    super();
    this.logger = Logger.getInstance();
    this.config = {
      autoLoadBuiltInModules: true,
      ...config,
    };

    this.moduleLoader = new ModuleLoader(config);
    this.moduleRegistry = new Map();

    this.setupEventHandlers();
    this.logger.info('ModuleManager initialized', {
      autoLoadBuiltInModules: this.config.autoLoadBuiltInModules,
    });
  }

  /**
   * Initialize the module manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing ModuleManager');

    try {
      // Register built-in modules
      await this.registerBuiltInModules();

      // Auto-load built-in modules if configured
      if (this.config.autoLoadBuiltInModules) {
        await this.loadBuiltInModules();
      }

      this.logger.info('ModuleManager initialized successfully', {
        registeredModules: this.moduleRegistry.size,
        loadedModules: this.moduleLoader.getLoadedModules().length,
      });
    } catch (error) {
      const errorWithContext = createErrorWithContext(error);
      this.logger.error('Failed to initialize ModuleManager', errorWithContext);
      throw error;
    }
  }

  /**
   * Load a module
   */
  async loadModule(request: ModuleLoadRequest): Promise<void> {
    this.logger.info('Loading module via manager', {
      moduleId: request.moduleId,
      implantId: request.implantId,
      operatorId: request.operatorId,
    });

    // Check if module is registered
    if (!this.moduleRegistry.has(request.moduleId)) {
      throw new Error(`Module not registered: ${request.moduleId}`);
    }

    await this.moduleLoader.loadModule(request);
  }

  /**
   * Execute a module capability
   */
  async executeModule(request: ModuleExecuteRequest): Promise<ModuleExecutionResult> {
    this.logger.info('Executing module capability via manager', {
      moduleId: request.moduleId,
      implantId: request.implantId,
      capability: request.capability,
    });

    return this.moduleLoader.executeModule(request);
  }

  /**
   * Unload a module
   */
  async unloadModule(request: ModuleUnloadRequest): Promise<void> {
    this.logger.info('Unloading module via manager', {
      moduleId: request.moduleId,
      implantId: request.implantId,
      operatorId: request.operatorId,
    });

    await this.moduleLoader.unloadModule(request);
  }

  /**
   * List available modules
   */
  listModules(filter?: ModuleListFilter): ModuleInfo[] {
    let modules = Array.from(this.moduleRegistry.values());

    // Apply filters
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
        const loadedModuleIds = this.moduleLoader.getLoadedModules().map(m => m.id);
        modules = modules.filter(m => loadedModuleIds.includes(m.id));
      }
      if (filter.implantId) {
        // Filter modules compatible with specific implant
        // This would require implant capability checking in a real implementation
      }
    }

    return modules.map(module => ({
      id: module.id,
      name: module.metadata.name,
      version: module.metadata.version,
      category: module.metadata.category,
      author: module.metadata.author,
      description: module.metadata.description,
      status: module.status,
      loadedAt: module.loadedAt,
      lastExecuted: module.lastExecuted,
      executionCount: module.executionCount,
      successCount: module.successCount,
      failureCount: module.failureCount,
      capabilities: module.metadata.capabilities.map(c => c.name),
    }));
  }

  /**
   * Get module details
   */
  getModule(moduleId: string): Module | null {
    return this.moduleRegistry.get(moduleId) || null;
  }

  /**
   * Get loaded modules
   */
  getLoadedModules(): Module[] {
    return this.moduleLoader.getLoadedModules();
  }

  /**
   * Get module executions
   */
  getModuleExecutions(filter?: ModuleExecutionFilter): ModuleExecution[] {
    let executions = this.moduleLoader.getModuleExecutions();

    // Apply filters
    if (filter) {
      if (filter.moduleId) {
        executions = executions.filter(e => e.moduleId === filter.moduleId);
      }
      if (filter.implantId) {
        executions = executions.filter(e => e.implantId === filter.implantId);
      }
      if (filter.operatorId) {
        executions = executions.filter(e => e.operatorId === filter.operatorId);
      }
      if (filter.status) {
        executions = executions.filter(e => e.status === filter.status);
      }
      if (filter.capability) {
        executions = executions.filter(e => e.capability === filter.capability);
      }
      if (filter.startDate) {
        executions = executions.filter(e => e.startTime >= filter.startDate!);
      }
      if (filter.endDate) {
        executions = executions.filter(e => e.startTime <= filter.endDate!);
      }
    }

    return executions;
  }

  /**
   * Get module statistics
   */
  getModuleStats(): {
    totalModules: number;
    loadedModules: number;
    executingModules: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    modulesByCategory: Record<string, number>;
    modulesByStatus: Record<string, number>;
  } {
    const loaderStats = this.moduleLoader.getModuleStats();
    const modules = Array.from(this.moduleRegistry.values());

    const modulesByCategory: Record<string, number> = {};
    const modulesByStatus: Record<string, number> = {};

    modules.forEach(module => {
      const category = module.metadata.category;
      const status = module.status;

      modulesByCategory[category] = (modulesByCategory[category] || 0) + 1;
      modulesByStatus[status] = (modulesByStatus[status] || 0) + 1;
    });

    return {
      totalModules: modules.length,
      loadedModules: loaderStats.loadedModules,
      executingModules: loaderStats.executingModules,
      totalExecutions: loaderStats.totalExecutions,
      successfulExecutions: loaderStats.successfulExecutions,
      failedExecutions: loaderStats.failedExecutions,
      modulesByCategory,
      modulesByStatus,
    };
  }

  /**
   * Register a module
   */
  async registerModule(module: Module): Promise<void> {
    this.logger.info('Registering module', {
      moduleId: module.id,
      moduleName: module.metadata.name,
      version: module.metadata.version,
    });

    // Validate module
    await this.validateModule(module);

    // Store in registry
    this.moduleRegistry.set(module.id, module);

    this.emit('moduleRegistered', {
      moduleId: module.id,
      moduleName: module.metadata.name,
      category: module.metadata.category,
    });

    this.logger.info('Module registered successfully', {
      moduleId: module.id,
      moduleName: module.metadata.name,
    });
  }

  /**
   * Unregister a module
   */
  async unregisterModule(moduleId: string): Promise<void> {
    this.logger.info('Unregistering module', { moduleId });

    const module = this.moduleRegistry.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    // Unload module if loaded
    const loadedModules = this.moduleLoader.getLoadedModules();
    if (loadedModules.some(m => m.id === moduleId)) {
      await this.moduleLoader.unloadModule({
        moduleId,
        implantId: 'system',
        operatorId: 'system',
        force: true,
      });
    }

    // Remove from registry
    this.moduleRegistry.delete(moduleId);

    this.emit('moduleUnregistered', {
      moduleId,
      moduleName: module.metadata.name,
    });

    this.logger.info('Module unregistered successfully', { moduleId });
  }

  /**
   * Stop all modules
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down ModuleManager');

    try {
      await this.moduleLoader.stopAllModules();
      this.moduleRegistry.clear();

      this.logger.info('ModuleManager shutdown completed');
    } catch (error) {
      const errorWithContext = createErrorWithContext(error);
      this.logger.error('Error during ModuleManager shutdown', errorWithContext);
      throw error;
    }
  }

  /**
   * Register built-in modules
   */
  private async registerBuiltInModules(): Promise<void> {
    this.logger.info('Registering built-in modules');

    try {
      // Register credential dumping module
      const credentialModule = await this.createBuiltInModule('credential-dumping');
      await this.registerModule(credentialModule);

      // Register network discovery module
      const networkModule = await this.createBuiltInModule('network-discovery');
      await this.registerModule(networkModule);

      // Register lateral movement module
      const lateralModule = await this.createBuiltInModule('lateral-movement');
      await this.registerModule(lateralModule);

      this.logger.info('Built-in modules registered successfully');
    } catch (error) {
      const errorWithContext = createErrorWithContext(error);
      this.logger.error('Failed to register built-in modules', errorWithContext);
      throw error;
    }
  }

  /**
   * Load built-in modules
   */
  private async loadBuiltInModules(): Promise<void> {
    this.logger.info('Auto-loading built-in modules');

    const builtInModules = Array.from(this.moduleRegistry.values()).filter(
      m => m.metadata.author === 'SeraphC2 Team'
    );

    for (const module of builtInModules) {
      try {
        await this.moduleLoader.loadModule({
          moduleId: module.id,
          implantId: 'system',
          operatorId: 'system',
          verifySignature: false, // Skip signature verification for built-in modules
          sandboxed: false, // Built-in modules don't need sandboxing
        });
      } catch (error) {
        this.logger.warn('Failed to auto-load built-in module', {
          moduleId: module.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Built-in modules auto-loading completed');
  }

  /**
   * Create built-in module instance
   */
  private async createBuiltInModule(moduleId: string): Promise<Module> {
    const { createHash } = await import('crypto');

    if (moduleId === 'credential-dumping') {
      const { CredentialDumpingModule } = await import('./credential-dumping.module');
      const metadata = CredentialDumpingModule.getMetadata();
      const binary = Buffer.from('// Built-in credential dumping module');

      return {
        id: moduleId,
        metadata,
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'seraphc2-builtin-key',
          signature: 'builtin-signature',
          timestamp: new Date(),
          issuer: 'SeraphC2 Team',
        },
        binary,
        hash: createHash('sha256').update(binary).digest('hex'),
        size: binary.length,
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
      const binary = Buffer.from('// Built-in network discovery module');

      return {
        id: moduleId,
        metadata,
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'seraphc2-builtin-key',
          signature: 'builtin-signature',
          timestamp: new Date(),
          issuer: 'SeraphC2 Team',
        },
        binary,
        hash: createHash('sha256').update(binary).digest('hex'),
        size: binary.length,
        status: ModuleStatus.UNLOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    if (moduleId === 'lateral-movement') {
      const { LateralMovementModule } = await import('./lateral-movement.module');
      const metadata = LateralMovementModule.getMetadata();
      const binary = Buffer.from('// Built-in lateral movement module');

      return {
        id: moduleId,
        metadata,
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'seraphc2-builtin-key',
          signature: 'builtin-signature',
          timestamp: new Date(),
          issuer: 'SeraphC2 Team',
        },
        binary,
        hash: createHash('sha256').update(binary).digest('hex'),
        size: binary.length,
        status: ModuleStatus.UNLOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    throw new Error(`Unknown built-in module: ${moduleId}`);
  }

  /**
   * Validate module
   */
  private async validateModule(module: Module): Promise<void> {
    // Validate required fields
    if (!module.id || !module.metadata || !module.binary) {
      throw new Error('Invalid module: missing required fields');
    }

    // Validate metadata
    if (!module.metadata.name || !module.metadata.version || !module.metadata.author) {
      throw new Error('Invalid module metadata: missing required fields');
    }

    // Validate capabilities
    if (!module.metadata.capabilities || module.metadata.capabilities.length === 0) {
      throw new Error('Module must have at least one capability');
    }

    // Check for duplicate module ID
    if (this.moduleRegistry.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }

    this.logger.debug('Module validation passed', {
      moduleId: module.id,
      moduleName: module.metadata.name,
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Forward module loader events
    this.moduleLoader.on('moduleLoaded', event => {
      this.emit('moduleLoaded', event);
    });

    this.moduleLoader.on('moduleUnloaded', event => {
      this.emit('moduleUnloaded', event);
    });

    this.moduleLoader.on('moduleExecutionStarted', event => {
      this.emit('moduleExecutionStarted', event);
    });

    this.moduleLoader.on('moduleExecutionCompleted', event => {
      // Update module statistics
      const module = this.moduleRegistry.get(event.moduleId);
      if (module) {
        module.executionCount++;
        if (event.data.success) {
          module.successCount++;
        } else {
          module.failureCount++;
        }
        module.lastExecuted = new Date();
        module.updatedAt = new Date();
      }

      this.emit('moduleExecutionCompleted', event);
    });

    this.moduleLoader.on('moduleExecutionFailed', event => {
      // Update module statistics
      const module = this.moduleRegistry.get(event.moduleId);
      if (module) {
        module.executionCount++;
        module.failureCount++;
        module.lastExecuted = new Date();
        module.updatedAt = new Date();
      }

      this.emit('moduleExecutionFailed', event);
    });
  }
}
