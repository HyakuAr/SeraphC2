/**
 * Integration tests for the Module System
 */

import { ModuleManagerService, ModuleManagerConfig } from '../module-manager.service';
import {
  ModuleCategory,
  ModuleStatus,
  ModuleExecutionMode,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
} from '../../../types/modules';

// Mock logger
jest.mock('../../../utils/logger');

describe('Module System Integration Tests', () => {
  let moduleManager: ModuleManagerService;
  let config: ModuleManagerConfig;

  beforeEach(() => {
    config = {
      moduleStoragePath: '/tmp/modules',
      enableBuiltinModules: true,
      autoLoadBuiltinModules: true,
      moduleLoaderConfig: {
        moduleDirectory: '/tmp/modules',
        sandboxDirectory: '/tmp/sandbox',
        trustedPublicKeys: ['builtin-key'],
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

    moduleManager = new ModuleManagerService(config);
  });

  afterEach(() => {
    moduleManager.stop();
  });

  describe('End-to-End Module Workflow', () => {
    it('should complete full credential dumping workflow', async () => {
      // 1. List available modules
      const modules = moduleManager.listModules();
      expect(modules.length).toBeGreaterThan(0);

      // 2. Find credential dumping module
      const credentialModule = modules.find(
        m => m.metadata.category === ModuleCategory.CREDENTIAL_HARVESTING
      );
      expect(credentialModule).toBeDefined();
      expect(credentialModule!.metadata.name).toBe('CredentialDumping');

      // 3. Load the module
      const loadRequest: ModuleLoadRequest = {
        moduleId: credentialModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        sandboxed: true,
      };

      const loadedModule = await moduleManager.loadModule(loadRequest);
      expect(loadedModule.status).toBe(ModuleStatus.LOADED);
      expect(loadedModule.loadedAt).toBeDefined();

      // 4. Verify module is in loaded modules list
      const loadedModules = moduleManager.getLoadedModules('test-implant-id');
      expect(loadedModules).toHaveLength(1);
      expect(loadedModules[0]?.id).toBe(credentialModule!.id);

      // 5. Execute LSASS dump capability
      const executeRequest: ModuleExecuteRequest = {
        moduleId: credentialModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'dump_lsass',
        parameters: {
          method: 'minidump',
          output_format: 'json',
        },
      };

      const execution = await moduleManager.executeModule(executeRequest);
      expect(execution.status).toBe(ModuleStatus.COMPLETED);
      expect(execution.result?.success).toBe(true);
      expect(execution.result?.data).toBeDefined();
      expect(execution.result?.data.type).toBe('lsass');
      expect(execution.result?.data.credentials).toBeDefined();
      expect(Array.isArray(execution.result?.data.credentials)).toBe(true);

      // 6. Execute SAM dump capability
      const samExecuteRequest: ModuleExecuteRequest = {
        moduleId: credentialModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'dump_sam',
        parameters: {
          include_history: true,
          output_format: 'json',
        },
      };

      const samExecution = await moduleManager.executeModule(samExecuteRequest);
      expect(samExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(samExecution.result?.success).toBe(true);
      expect(samExecution.result?.data.type).toBe('sam');

      // 7. Execute browser password dump
      const browserExecuteRequest: ModuleExecuteRequest = {
        moduleId: credentialModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'dump_browser_passwords',
        parameters: {
          browsers: ['chrome', 'firefox'],
          include_cookies: false,
        },
      };

      const browserExecution = await moduleManager.executeModule(browserExecuteRequest);
      expect(browserExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(browserExecution.result?.success).toBe(true);
      expect(browserExecution.result?.data.type).toBe('browser');

      // 8. Get execution history
      const executions = moduleManager.getModuleExecutions({
        moduleId: credentialModule!.id,
        implantId: 'test-implant-id',
      });
      expect(executions).toHaveLength(3);

      // 9. Unload the module
      const unloadRequest: ModuleUnloadRequest = {
        moduleId: credentialModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const unloadResult = await moduleManager.unloadModule(unloadRequest);
      expect(unloadResult).toBe(true);

      // 10. Verify module is no longer loaded
      const loadedModulesAfterUnload = moduleManager.getLoadedModules('test-implant-id');
      expect(loadedModulesAfterUnload).toHaveLength(0);
    });

    it('should complete full network discovery workflow', async () => {
      // 1. Find network discovery module
      const modules = moduleManager.listModules();
      const networkModule = modules.find(
        m => m.metadata.category === ModuleCategory.NETWORK_DISCOVERY
      );
      expect(networkModule).toBeDefined();
      expect(networkModule!.metadata.name).toBe('NetworkDiscovery');

      // 2. Load the module
      const loadRequest: ModuleLoadRequest = {
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const loadedModule = await moduleManager.loadModule(loadRequest);
      expect(loadedModule.status).toBe(ModuleStatus.LOADED);

      // 3. Execute port scan
      const portScanRequest: ModuleExecuteRequest = {
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'scan_ports',
        parameters: {
          targets: ['192.168.1.1', '192.168.1.100'],
          ports: ['22', '80', '443', '3389'],
          protocol: 'tcp',
          timeout: 3000,
        },
      };

      const portScanExecution = await moduleManager.executeModule(portScanRequest);
      expect(portScanExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(portScanExecution.result?.success).toBe(true);
      expect(portScanExecution.result?.data.type).toBe('port_scan');
      expect(portScanExecution.result?.data.hosts).toBeDefined();

      // 4. Execute host discovery
      const hostDiscoveryRequest: ModuleExecuteRequest = {
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'discover_hosts',
        parameters: {
          networks: ['192.168.1.0/24'],
          methods: ['ping', 'arp'],
          resolve_hostnames: true,
        },
      };

      const hostDiscoveryExecution = await moduleManager.executeModule(hostDiscoveryRequest);
      expect(hostDiscoveryExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(hostDiscoveryExecution.result?.success).toBe(true);
      expect(hostDiscoveryExecution.result?.data.type).toBe('host_discovery');

      // 5. Execute service enumeration
      const serviceEnumRequest: ModuleExecuteRequest = {
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'enumerate_services',
        parameters: {
          targets: ['192.168.1.1:80', '192.168.1.1:443'],
          service_detection: true,
          banner_grabbing: true,
          vulnerability_scan: true,
        },
      };

      const serviceEnumExecution = await moduleManager.executeModule(serviceEnumRequest);
      expect(serviceEnumExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(serviceEnumExecution.result?.success).toBe(true);
      expect(serviceEnumExecution.result?.data.type).toBe('service_enum');

      // 6. Execute SMB enumeration
      const smbEnumRequest: ModuleExecuteRequest = {
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'enumerate_smb_shares',
        parameters: {
          targets: ['192.168.1.10', '192.168.1.20'],
          null_session: true,
        },
      };

      const smbEnumExecution = await moduleManager.executeModule(smbEnumRequest);
      expect(smbEnumExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(smbEnumExecution.result?.success).toBe(true);

      // 7. Verify all executions
      const executions = moduleManager.getModuleExecutions({
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
      });
      expect(executions).toHaveLength(4);

      // 8. Unload module
      const unloadRequest: ModuleUnloadRequest = {
        moduleId: networkModule!.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const unloadResult = await moduleManager.unloadModule(unloadRequest);
      expect(unloadResult).toBe(true);
    });
  });

  describe('Module Management Operations', () => {
    it('should handle multiple modules loaded simultaneously', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(
        m => m.metadata.category === ModuleCategory.CREDENTIAL_HARVESTING
      )!;
      const networkModule = modules.find(
        m => m.metadata.category === ModuleCategory.NETWORK_DISCOVERY
      )!;

      // Load both modules
      const loadCredentialRequest: ModuleLoadRequest = {
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const loadNetworkRequest: ModuleLoadRequest = {
        moduleId: networkModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      await Promise.all([
        moduleManager.loadModule(loadCredentialRequest),
        moduleManager.loadModule(loadNetworkRequest),
      ]);

      // Verify both modules are loaded
      const loadedModules = moduleManager.getLoadedModules('test-implant-id');
      expect(loadedModules).toHaveLength(2);

      // Execute capabilities from both modules
      const credentialExecution = await moduleManager.executeModule({
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'dump_lsass',
        parameters: {},
      });

      const networkExecution = await moduleManager.executeModule({
        moduleId: networkModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'scan_ports',
        parameters: { targets: ['192.168.1.1'] },
      });

      expect(credentialExecution.status).toBe(ModuleStatus.COMPLETED);
      expect(networkExecution.status).toBe(ModuleStatus.COMPLETED);

      // Unload both modules
      await Promise.all([
        moduleManager.unloadModule({
          moduleId: credentialModule.id,
          implantId: 'test-implant-id',
          operatorId: 'test-operator-id',
        }),
        moduleManager.unloadModule({
          moduleId: networkModule.id,
          implantId: 'test-implant-id',
          operatorId: 'test-operator-id',
        }),
      ]);

      const loadedModulesAfterUnload = moduleManager.getLoadedModules('test-implant-id');
      expect(loadedModulesAfterUnload).toHaveLength(0);
    });

    it('should handle module installation and uninstallation', async () => {
      const initialModuleCount = moduleManager.listModules().length;

      // Install a new module
      const moduleData = Buffer.from('test module binary data');
      const metadata = {
        name: 'TestCustomModule',
        version: '1.0.0',
        description: 'Custom test module for integration testing',
        author: 'Integration Test',
        category: ModuleCategory.CUSTOM,
        tags: ['test', 'custom'],
        requirements: {
          minOSVersion: 'Windows 10',
          architecture: ['x64'],
        },
        capabilities: [
          {
            name: 'test_capability',
            description: 'Test capability for integration testing',
            parameters: [],
            returns: {
              type: 'object' as const,
              description: 'Test result',
            },
          },
        ],
        executionMode: ModuleExecutionMode.SYNCHRONOUS,
        timeout: 60000,
        networkAccess: false,
        fileSystemAccess: true,
      };

      const installedModule = await moduleManager.installModule(moduleData, metadata);
      expect(installedModule).toBeDefined();
      expect(installedModule.metadata.name).toBe('TestCustomModule');

      // Verify module is in the list
      const modulesAfterInstall = moduleManager.listModules();
      expect(modulesAfterInstall).toHaveLength(initialModuleCount + 1);

      const foundModule = modulesAfterInstall.find(m => m.id === installedModule.id);
      expect(foundModule).toBeDefined();

      // Search for the installed module
      const searchResults = moduleManager.searchModules('TestCustomModule');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0]?.id).toBe(installedModule.id);

      // Uninstall the module
      const uninstallResult = await moduleManager.uninstallModule(installedModule.id);
      expect(uninstallResult).toBe(true);

      // Verify module is removed
      const modulesAfterUninstall = moduleManager.listModules();
      expect(modulesAfterUninstall).toHaveLength(initialModuleCount);

      const moduleAfterUninstall = moduleManager.getModule(installedModule.id);
      expect(moduleAfterUninstall).toBeUndefined();
    });

    it('should handle filtering and searching operations', async () => {
      // Test category filtering
      const credentialModules = moduleManager.listModules({
        category: ModuleCategory.CREDENTIAL_HARVESTING,
      });
      expect(credentialModules).toHaveLength(1);
      expect(credentialModules[0]?.metadata.category).toBe(ModuleCategory.CREDENTIAL_HARVESTING);

      const networkModules = moduleManager.listModules({
        category: ModuleCategory.NETWORK_DISCOVERY,
      });
      expect(networkModules).toHaveLength(1);
      expect(networkModules[0]?.metadata.category).toBe(ModuleCategory.NETWORK_DISCOVERY);

      // Test author filtering
      const seraphModules = moduleManager.listModules({
        author: 'SeraphC2',
      });
      expect(seraphModules).toHaveLength(2);

      // Test tag filtering
      const credentialTagModules = moduleManager.listModules({
        tags: ['credentials'],
      });
      expect(credentialTagModules).toHaveLength(1);

      const networkTagModules = moduleManager.listModules({
        tags: ['network'],
      });
      expect(networkTagModules).toHaveLength(1);

      // Test name pattern filtering
      const credentialPatternModules = moduleManager.listModules({
        namePattern: 'Credential',
      });
      expect(credentialPatternModules).toHaveLength(1);

      // Test search functionality
      const lsassSearchResults = moduleManager.searchModules('lsass');
      expect(lsassSearchResults).toHaveLength(1);

      const scanningSearchResults = moduleManager.searchModules('scanning');
      expect(scanningSearchResults).toHaveLength(1);

      const nonExistentSearchResults = moduleManager.searchModules('nonexistent');
      expect(nonExistentSearchResults).toHaveLength(0);

      // Test get modules by category
      const credentialsByCategory = moduleManager.getModulesByCategory(
        ModuleCategory.CREDENTIAL_HARVESTING
      );
      expect(credentialsByCategory).toHaveLength(1);

      const networksByCategory = moduleManager.getModulesByCategory(
        ModuleCategory.NETWORK_DISCOVERY
      );
      expect(networksByCategory).toHaveLength(1);

      const customByCategory = moduleManager.getModulesByCategory(ModuleCategory.CUSTOM);
      expect(customByCategory).toHaveLength(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle execution of non-existent capability gracefully', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(
        m => m.metadata.category === ModuleCategory.CREDENTIAL_HARVESTING
      )!;

      // Load module first
      await moduleManager.loadModule({
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      });

      // Try to execute non-existent capability
      const execution = await moduleManager.executeModule({
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'non_existent_capability',
        parameters: {},
      });

      expect(execution.status).toBe(ModuleStatus.ERROR);
      expect(execution.error).toContain('Unknown capability');
    });

    it('should handle loading non-existent module', async () => {
      await expect(
        moduleManager.loadModule({
          moduleId: 'non-existent-module-id',
          implantId: 'test-implant-id',
          operatorId: 'test-operator-id',
        })
      ).rejects.toThrow('Module non-existent-module-id not found in registry');
    });

    it('should handle unloading non-loaded module', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(
        m => m.metadata.category === ModuleCategory.CREDENTIAL_HARVESTING
      )!;

      // Try to unload without loading first
      const result = await moduleManager.unloadModule({
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      });

      expect(result).toBe(true); // Built-in modules can always be "unloaded"
    });

    it('should prevent uninstalling built-in modules', async () => {
      const modules = moduleManager.listModules();
      const builtinModule = modules.find(
        m => m.metadata.category === ModuleCategory.CREDENTIAL_HARVESTING
      )!;

      await expect(moduleManager.uninstallModule(builtinModule.id)).rejects.toThrow(
        'Cannot uninstall built-in modules'
      );
    });
  });

  describe('Module Statistics and Tracking', () => {
    it('should track module execution statistics', async () => {
      const modules = moduleManager.listModules();
      const credentialModule = modules.find(
        m => m.metadata.category === ModuleCategory.CREDENTIAL_HARVESTING
      )!;

      // Load module
      await moduleManager.loadModule({
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      });

      // Execute multiple times
      for (let i = 0; i < 3; i++) {
        await moduleManager.executeModule({
          moduleId: credentialModule.id,
          implantId: 'test-implant-id',
          operatorId: 'test-operator-id',
          capability: 'dump_lsass',
          parameters: {},
        });
      }

      // Check updated module statistics
      const updatedModule = moduleManager.getModule(credentialModule.id)!;
      expect(updatedModule.executionCount).toBe(3);
      expect(updatedModule.successCount).toBe(3);
      expect(updatedModule.failureCount).toBe(0);
      expect(updatedModule.lastExecuted).toBeDefined();

      // Get execution history
      const executions = moduleManager.getModuleExecutions({
        moduleId: credentialModule.id,
        implantId: 'test-implant-id',
      });
      expect(executions).toHaveLength(3);

      // All executions should be completed successfully
      executions.forEach(execution => {
        expect(execution.status).toBe(ModuleStatus.COMPLETED);
        expect(execution.result?.success).toBe(true);
      });
    });
  });
});
