/**
 * Tests for Module Manager Service
 */

import { ModuleManagerService, ModuleManagerConfig } from '../module-manager.service';
import { ModuleLoaderService } from '../module-loader.service';
import {
  Module,
  ModuleStatus,
  ModuleCategory,
  ModuleExecutionMode,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
  ModuleListFilter,
} from '../../../types/modules';
import { CredentialDumpingModule } from '../../modules/credential-dumping.module';
import { NetworkDiscoveryModule } from '../../modules/network-discovery.module';

// Mock dependencies
jest.mock('../../../utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));
jest.mock('../module-loader.service');
jest.mock('../../modules/credential-dumping.module');
jest.mock('../../modules/network-discovery.module');

describe('ModuleManagerService', () => {
  let moduleManager: ModuleManagerService;
  let config: ModuleManagerConfig;
  let mockModuleLoader: jest.Mocked<ModuleLoaderService>;

  beforeEach(() => {
    config = {
      moduleStoragePath: '/tmp/modules',
      enableBuiltinModules: true,
      autoLoadBuiltinModules: true,
      moduleLoaderConfig: {
        moduleDirectory: '/tmp/modules',
        sandboxDirectory: '/tmp/sandbox',
        trustedPublicKeys: ['trusted-key'],
        defaultSandboxConfig: {
          enabled: true,
          isolateNetwork: true,
          isolateFileSystem: true,
          isolateRegistry: true,
          isolateProcesses: true,
          resourceLimits: {
            maxMemory: 256 * 1024 * 1024,
            maxExecutionTime: 300000,
          },
          timeoutMs: 300000,
        },
        maxConcurrentExecutions: 10,
        executionTimeoutMs: 300000,
        signatureVerificationRequired: false,
        allowUnsignedModules: true,
        moduleCleanupIntervalMs: 60000,
      },
    };

    // Mock built-in module metadata
    (CredentialDumpingModule.getMetadata as jest.Mock).mockReturnValue({
      name: 'CredentialDumping',
      version: '1.0.0',
      description: 'Built-in credential harvesting capabilities',
      author: 'SeraphC2 Team',
      category: ModuleCategory.CREDENTIAL_HARVESTING,
      tags: ['credentials', 'lsass', 'sam'],
      requirements: {},
      capabilities: [
        {
          name: 'dump_lsass',
          description: 'Dump LSASS credentials',
          parameters: [],
        },
      ],
      executionMode: ModuleExecutionMode.SYNCHRONOUS,
    });

    // Mock CredentialDumpingModule constructor and methods
    (
      CredentialDumpingModule as jest.MockedClass<typeof CredentialDumpingModule>
    ).mockImplementation(
      () =>
        ({
          dumpLsass: jest.fn().mockResolvedValue({
            type: 'lsass',
            credentials: [
              {
                username: 'testuser',
                domain: 'TESTDOMAIN',
                hash: 'testhash',
                hashType: 'NTLM',
                source: 'LSASS',
                confidence: 95,
              },
            ],
            source: 'LSASS Memory',
            timestamp: new Date(),
          }),
        }) as any
    );

    (NetworkDiscoveryModule.getMetadata as jest.Mock).mockReturnValue({
      name: 'NetworkDiscovery',
      version: '1.0.0',
      description: 'Built-in network discovery capabilities',
      author: 'SeraphC2 Team',
      category: ModuleCategory.NETWORK_DISCOVERY,
      tags: ['network', 'scanning'],
      requirements: {},
      capabilities: [
        {
          name: 'scan_ports',
          description: 'Scan network ports',
          parameters: [],
        },
      ],
      executionMode: ModuleExecutionMode.ASYNCHRONOUS,
    });

    // Mock NetworkDiscoveryModule constructor and methods
    (NetworkDiscoveryModule as jest.MockedClass<typeof NetworkDiscoveryModule>).mockImplementation(
      () =>
        ({
          scanPorts: jest.fn().mockResolvedValue({
            type: 'port_scan',
            hosts: [
              {
                ipAddress: '192.168.1.1',
                openPorts: [80, 443],
                services: [],
                isAlive: true,
                responseTime: 10,
                lastSeen: new Date(),
              },
            ],
            networks: [],
            services: [],
            timestamp: new Date(),
            scanDuration: 1000,
          }),
        }) as any
    );

    moduleManager = new ModuleManagerService(config);
    mockModuleLoader = (moduleManager as any).moduleLoader as jest.Mocked<ModuleLoaderService>;
  });

  afterEach(() => {
    moduleManager.stop();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize built-in modules when enabled', () => {
      const modules = moduleManager.listModules();

      expect(modules).toHaveLength(2);
      expect(modules.find(m => m.metadata.name === 'CredentialDumping')).toBeDefined();
      expect(modules.find(m => m.metadata.name === 'NetworkDiscovery')).toBeDefined();
    });

    it('should not initialize built-in modules when disabled', () => {
      const configWithoutBuiltins = {
        ...config,
        enableBuiltinModules: false,
      };

      const managerWithoutBuiltins = new ModuleManagerService(configWithoutBuiltins);
      const modules = managerWithoutBuiltins.listModules();

      expect(modules).toHaveLength(0);

      managerWithoutBuiltins.stop();
    });
  });

  describe('listModules', () => {
    it('should return all modules without filter', () => {
      const modules = moduleManager.listModules();
      expect(modules).toHaveLength(2);
    });

    it('should filter modules by category', () => {
      const filter: ModuleListFilter = {
        category: ModuleCategory.CREDENTIAL_HARVESTING,
      };

      const modules = moduleManager.listModules(filter);
      expect(modules).toHaveLength(1);
      expect(modules[0]?.metadata.name).toBe('CredentialDumping');
    });

    it('should filter modules by status', () => {
      const filter: ModuleListFilter = {
        status: ModuleStatus.UNLOADED,
      };

      const modules = moduleManager.listModules(filter);
      expect(modules).toHaveLength(2);
    });

    it('should filter modules by author', () => {
      const filter: ModuleListFilter = {
        author: 'SeraphC2',
      };

      const modules = moduleManager.listModules(filter);
      expect(modules).toHaveLength(2);
    });

    it('should filter modules by tags', () => {
      const filter: ModuleListFilter = {
        tags: ['credentials'],
      };

      const modules = moduleManager.listModules(filter);
      expect(modules).toHaveLength(1);
      expect(modules[0]?.metadata.name).toBe('CredentialDumping');
    });

    it('should filter modules by name pattern', () => {
      const filter: ModuleListFilter = {
        namePattern: 'Network',
      };

      const modules = moduleManager.listModules(filter);
      expect(modules).toHaveLength(1);
      expect(modules[0]?.metadata.name).toBe('NetworkDiscovery');
    });
  });

  describe('getModule', () => {
    it('should return module by ID', () => {
      const modules = moduleManager.listModules();
      const moduleId = modules[0]?.id;

      const module = moduleManager.getModule(moduleId!);
      expect(module).toBeDefined();
      expect(module?.id).toBe(moduleId);
    });

    it('should return undefined for non-existent module', () => {
      const module = moduleManager.getModule('non-existent-id');
      expect(module).toBeUndefined();
    });
  });

  describe('loadModule', () => {
    it('should load built-in module successfully', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      const request: ModuleLoadRequest = {
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const result = await moduleManager.loadModule(request);

      expect(result).toBeDefined();
      expect(result.status).toBe(ModuleStatus.LOADED);
      expect(result.loadedAt).toBeDefined();
    });

    it('should load external module through module loader', async () => {
      const externalModuleId = 'external-module-id';
      const mockExternalModule: Module = {
        id: externalModuleId,
        metadata: {
          name: 'ExternalModule',
          version: '1.0.0',
          description: 'External test module',
          author: 'External Author',
          category: ModuleCategory.CUSTOM,
          tags: ['external'],
          requirements: {},
          capabilities: [],
          executionMode: ModuleExecutionMode.SYNCHRONOUS,
        },
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'external-key',
          signature: 'external-signature',
          timestamp: new Date(),
          issuer: 'External Issuer',
        },
        binary: Buffer.from('external module'),
        hash: 'external-hash',
        size: 100,
        status: ModuleStatus.LOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Add external module to registry
      (moduleManager as any).moduleRegistry.set(externalModuleId, mockExternalModule);

      mockModuleLoader.loadModule.mockResolvedValue(mockExternalModule);

      const request: ModuleLoadRequest = {
        moduleId: externalModuleId,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const result = await moduleManager.loadModule(request);

      expect(result).toBe(mockExternalModule);
      expect(mockModuleLoader.loadModule).toHaveBeenCalledWith(request);
    });

    it('should throw error for non-existent module', async () => {
      const request: ModuleLoadRequest = {
        moduleId: 'non-existent-module',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      await expect(moduleManager.loadModule(request)).rejects.toThrow(
        'Module non-existent-module not found in registry'
      );
    });
  });

  describe('executeModule', () => {
    it('should execute built-in credential dumping module', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      const request: ModuleExecuteRequest = {
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'dump_lsass',
        parameters: { method: 'minidump' },
      };

      const result = await moduleManager.executeModule(request);

      expect(result).toBeDefined();
      expect(result.status).toBe(ModuleStatus.COMPLETED);
      expect(result.result?.success).toBe(true);
      expect(result.result?.data).toBeDefined();
    });

    it('should execute built-in network discovery module', async () => {
      const modules = moduleManager.listModules();
      const networkModule = modules.find(m => m.metadata.name === 'NetworkDiscovery')!;

      const request: ModuleExecuteRequest = {
        moduleId: networkModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'scan_ports',
        parameters: { targets: ['192.168.1.1'] },
      };

      const result = await moduleManager.executeModule(request);

      expect(result).toBeDefined();
      expect(result.status).toBe(ModuleStatus.COMPLETED);
      expect(result.result?.success).toBe(true);
      expect(result.result?.data).toBeDefined();
    });

    it('should handle execution errors gracefully', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      // Mock the credential dumping module to throw an error
      const mockCredentialModule = {
        dumpLsass: jest.fn().mockRejectedValue(new Error('Test execution error')),
      };
      (moduleManager as any).builtinModules.set(
        credentialModule.id,
        class {
          constructor() {
            return mockCredentialModule;
          }
        }
      );

      const request: ModuleExecuteRequest = {
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'dump_lsass',
        parameters: {},
      };

      const result = await moduleManager.executeModule(request);

      expect(result.status).toBe(ModuleStatus.ERROR);
      expect(result.error).toBe('Test execution error');
    });

    it('should throw error for unknown capability', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      const request: ModuleExecuteRequest = {
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'unknown_capability',
        parameters: {},
      };

      const result = await moduleManager.executeModule(request);

      expect(result.status).toBe(ModuleStatus.ERROR);
      expect(result.error).toContain('Unknown capability: unknown_capability');
    });

    it('should execute external module through module loader', async () => {
      const externalModuleId = 'external-module-id';
      const mockExecution = {
        id: 'execution-id',
        moduleId: externalModuleId,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'external_capability',
        parameters: {},
        startTime: new Date(),
        status: ModuleStatus.COMPLETED,
        logs: [],
      };

      mockModuleLoader.executeModule.mockResolvedValue(mockExecution);

      const request: ModuleExecuteRequest = {
        moduleId: externalModuleId,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'external_capability',
        parameters: {},
      };

      const result = await moduleManager.executeModule(request);

      expect(result).toBe(mockExecution);
      expect(mockModuleLoader.executeModule).toHaveBeenCalledWith(request);
    });
  });

  describe('unloadModule', () => {
    it('should unload built-in module', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      // First load the module
      credentialModule.status = ModuleStatus.LOADED;
      credentialModule.loadedAt = new Date();

      const request: ModuleUnloadRequest = {
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const result = await moduleManager.unloadModule(request);

      expect(result).toBe(true);
      expect(credentialModule.status).toBe(ModuleStatus.UNLOADED);
      expect(credentialModule.loadedAt).toBeUndefined();
    });

    it('should unload external module through module loader', async () => {
      const externalModuleId = 'external-module-id';
      mockModuleLoader.unloadModule.mockResolvedValue(true);

      const request: ModuleUnloadRequest = {
        moduleId: externalModuleId,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const result = await moduleManager.unloadModule(request);

      expect(result).toBe(true);
      expect(mockModuleLoader.unloadModule).toHaveBeenCalledWith(request);
    });
  });

  describe('installModule', () => {
    it('should install new module successfully', async () => {
      const moduleData = Buffer.from('new module binary');
      const metadata = {
        name: 'NewModule',
        version: '1.0.0',
        description: 'New test module',
        author: 'Test Author',
        category: ModuleCategory.CUSTOM,
        tags: ['new'],
        requirements: {},
        capabilities: [],
        executionMode: ModuleExecutionMode.SYNCHRONOUS,
      };

      const result = await moduleManager.installModule(moduleData, metadata);

      expect(result).toBeDefined();
      expect(result.metadata.name).toBe('NewModule');
      expect(result.binary).toBe(moduleData);
      expect(result.status).toBe(ModuleStatus.UNLOADED);

      // Verify module is in registry
      const installedModule = moduleManager.getModule(result.id);
      expect(installedModule).toBeDefined();
    });
  });

  describe('uninstallModule', () => {
    it('should uninstall module successfully', async () => {
      // First install a module
      const moduleData = Buffer.from('test module');
      const metadata = {
        name: 'TestModule',
        version: '1.0.0',
        description: 'Test module',
        author: 'Test Author',
        category: ModuleCategory.CUSTOM,
        tags: ['test'],
        requirements: {},
        capabilities: [],
        executionMode: ModuleExecutionMode.SYNCHRONOUS,
      };

      const installedModule = await moduleManager.installModule(moduleData, metadata);

      // Now uninstall it
      const result = await moduleManager.uninstallModule(installedModule.id);

      expect(result).toBe(true);

      // Verify module is removed from registry
      const removedModule = moduleManager.getModule(installedModule.id);
      expect(removedModule).toBeUndefined();
    });

    it('should not allow uninstalling built-in modules', async () => {
      const modules = moduleManager.listModules();
      const builtinModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      await expect(moduleManager.uninstallModule(builtinModule.id)).rejects.toThrow(
        'Cannot uninstall built-in modules'
      );
    });

    it('should return false for non-existent module', async () => {
      const result = await moduleManager.uninstallModule('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('getModuleCategories', () => {
    it('should return all module categories', () => {
      const categories = moduleManager.getModuleCategories();
      expect(categories).toContain(ModuleCategory.CREDENTIAL_HARVESTING);
      expect(categories).toContain(ModuleCategory.NETWORK_DISCOVERY);
      expect(categories).toContain(ModuleCategory.CUSTOM);
    });
  });

  describe('getModulesByCategory', () => {
    it('should return modules filtered by category', () => {
      const credentialModules = moduleManager.getModulesByCategory(
        ModuleCategory.CREDENTIAL_HARVESTING
      );
      expect(credentialModules).toHaveLength(1);
      expect(credentialModules[0]?.metadata.name).toBe('CredentialDumping');

      const networkModules = moduleManager.getModulesByCategory(ModuleCategory.NETWORK_DISCOVERY);
      expect(networkModules).toHaveLength(1);
      expect(networkModules[0]?.metadata.name).toBe('NetworkDiscovery');
    });
  });

  describe('searchModules', () => {
    it('should search modules by name', () => {
      const results = moduleManager.searchModules('Credential');
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata.name).toBe('CredentialDumping');
    });

    it('should search modules by description', () => {
      const results = moduleManager.searchModules('network discovery');
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata.name).toBe('NetworkDiscovery');
    });

    it('should search modules by tags', () => {
      const results = moduleManager.searchModules('lsass');
      expect(results).toHaveLength(1);
      expect(results[0]?.metadata.name).toBe('CredentialDumping');
    });

    it('should return empty array for no matches', () => {
      const results = moduleManager.searchModules('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('getLoadedModules', () => {
    it('should return loaded built-in modules', () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      // Mark as loaded
      credentialModule.status = ModuleStatus.LOADED;

      mockModuleLoader.getLoadedModules.mockReturnValue([]);

      const loadedModules = moduleManager.getLoadedModules('test-implant-id');
      expect(loadedModules).toHaveLength(1);
      expect(loadedModules[0]?.id).toBe(credentialModule.id);
    });

    it('should combine built-in and external loaded modules', () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(m => m.metadata.name === 'CredentialDumping')!;

      // Mark as loaded
      credentialModule.status = ModuleStatus.LOADED;

      const externalModule: Module = {
        id: 'external-id',
        metadata: {
          name: 'ExternalModule',
          version: '1.0.0',
          description: 'External module',
          author: 'External',
          category: ModuleCategory.CUSTOM,
          tags: [],
          requirements: {},
          capabilities: [],
          executionMode: ModuleExecutionMode.SYNCHRONOUS,
        },
        signature: {
          algorithm: 'RSA-SHA256',
          publicKey: 'key',
          signature: 'sig',
          timestamp: new Date(),
          issuer: 'issuer',
        },
        binary: Buffer.from('external'),
        hash: 'hash',
        size: 100,
        status: ModuleStatus.LOADED,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockModuleLoader.getLoadedModules.mockReturnValue([externalModule]);

      const loadedModules = moduleManager.getLoadedModules('test-implant-id');
      expect(loadedModules).toHaveLength(2);
    });
  });
});
