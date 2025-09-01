/**
 * Tests for ModuleLoader
 * Implements requirement 13.1, 13.2 - Module loader system with sandboxed execution and digital signature verification
 */

import { ModuleLoader, ModuleLoaderConfig } from '../module-loader';
import {
  Module,
  ModuleStatus,
  ModuleCategory,
  ModuleExecutionMode,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
} from '../../../types/modules';
import { createHash } from 'crypto';

describe('ModuleLoader', () => {
  let moduleLoader: ModuleLoader;
  let mockModule: Module;

  beforeEach(() => {
    const config: ModuleLoaderConfig = {
      maxConcurrentModules: 5,
      defaultTimeout: 30000,
      enableSignatureVerification: false, // Disable for testing
      trustedPublicKeys: ['test-key'],
    };

    moduleLoader = new ModuleLoader(config);

    // Create mock module
    const binary = Buffer.from('// Mock module binary');
    mockModule = {
      id: 'test-module',
      metadata: {
        name: 'TestModule',
        version: '1.0.0',
        description: 'Test module for unit tests',
        author: 'SeraphC2 Team',
        category: ModuleCategory.CUSTOM,
        tags: ['test'],
        requirements: {
          minOSVersion: 'Windows 7',
          architecture: ['x64'],
        },
        capabilities: [
          {
            name: 'test_capability',
            description: 'Test capability',
            parameters: [
              {
                name: 'testParam',
                type: 'string',
                required: true,
                description: 'Test parameter',
              },
            ],
            returns: {
              type: 'object',
              description: 'Test result',
            },
          },
        ],
        executionMode: ModuleExecutionMode.SYNCHRONOUS,
        timeout: 30000,
        networkAccess: false,
        fileSystemAccess: false,
        registryAccess: false,
        processAccess: false,
      },
      signature: {
        algorithm: 'RSA-SHA256',
        publicKey: 'test-key',
        signature: 'test-signature',
        timestamp: new Date(),
        issuer: 'Test',
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
  });

  afterEach(async () => {
    await moduleLoader.stopAllModules();
  });

  describe('loadModule', () => {
    it('should load a module successfully', async () => {
      // Mock the getModuleFromRepository method
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(mockModule);

      const request: ModuleLoadRequest = {
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      };

      await expect(moduleLoader.loadModule(request)).resolves.not.toThrow();

      const loadedModules = moduleLoader.getLoadedModules();
      expect(loadedModules).toHaveLength(1);
      expect(loadedModules[0]?.id).toBe('test-module');
      expect(loadedModules[0]?.status).toBe(ModuleStatus.LOADED);
    });

    it('should reject loading the same module twice', async () => {
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(mockModule);

      const request: ModuleLoadRequest = {
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      };

      await moduleLoader.loadModule(request);

      // Try to load the same module again
      await expect(moduleLoader.loadModule(request)).resolves.not.toThrow();

      // Should still have only one loaded module
      const loadedModules = moduleLoader.getLoadedModules();
      expect(loadedModules).toHaveLength(1);
    });

    it('should reject loading non-existent module', async () => {
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(null);

      const request: ModuleLoadRequest = {
        moduleId: 'non-existent',
        implantId: 'test-implant',
        operatorId: 'test-operator',
      };

      await expect(moduleLoader.loadModule(request)).rejects.toThrow('Module not found');
    });

    it('should enforce concurrent module limit', async () => {
      const config: ModuleLoaderConfig = {
        maxConcurrentModules: 1,
        enableSignatureVerification: false,
      };
      const limitedLoader = new ModuleLoader(config);

      jest.spyOn(limitedLoader as any, 'getModuleFromRepository').mockImplementation((id: any) => {
        return Promise.resolve({
          ...mockModule,
          id,
        });
      });

      // Load first module
      await limitedLoader.loadModule({
        moduleId: 'module1',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      });

      // Try to load second module (should fail)
      await expect(
        limitedLoader.loadModule({
          moduleId: 'module2',
          implantId: 'test-implant',
          operatorId: 'test-operator',
          verifySignature: false,
          sandboxed: false,
        })
      ).rejects.toThrow('Maximum concurrent modules limit reached');

      await limitedLoader.stopAllModules();
    });
  });

  describe('executeModule', () => {
    beforeEach(async () => {
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(mockModule);

      await moduleLoader.loadModule({
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      });
    });

    it('should execute a module capability successfully', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        capability: 'test_capability',
        parameters: {
          testParam: 'test-value',
        },
      };

      const result = await moduleLoader.executeModule(request);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.size).toBeGreaterThan(0);
    });

    it('should reject execution of non-existent capability', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        capability: 'non-existent',
        parameters: {},
      };

      await expect(moduleLoader.executeModule(request)).rejects.toThrow('Capability not found');
    });

    it('should validate required parameters', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        capability: 'test_capability',
        parameters: {}, // Missing required parameter
      };

      await expect(moduleLoader.executeModule(request)).rejects.toThrow(
        'Required parameter missing'
      );
    });

    it('should reject execution on unloaded module', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'unloaded-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        capability: 'test_capability',
        parameters: {
          testParam: 'test-value',
        },
      };

      await expect(moduleLoader.executeModule(request)).rejects.toThrow('Module not loaded');
    });
  });

  describe('unloadModule', () => {
    beforeEach(async () => {
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(mockModule);

      await moduleLoader.loadModule({
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      });
    });

    it('should unload a module successfully', async () => {
      const request: ModuleUnloadRequest = {
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
      };

      await expect(moduleLoader.unloadModule(request)).resolves.not.toThrow();

      const loadedModules = moduleLoader.getLoadedModules();
      expect(loadedModules).toHaveLength(0);
    });

    it('should handle unloading non-existent module gracefully', async () => {
      const request: ModuleUnloadRequest = {
        moduleId: 'non-existent',
        implantId: 'test-implant',
        operatorId: 'test-operator',
      };

      await expect(moduleLoader.unloadModule(request)).resolves.not.toThrow();
    });
  });

  describe('getModuleStats', () => {
    it('should return correct statistics', async () => {
      const stats = moduleLoader.getModuleStats();

      expect(stats).toHaveProperty('loadedModules');
      expect(stats).toHaveProperty('executingModules');
      expect(stats).toHaveProperty('totalExecutions');
      expect(stats).toHaveProperty('successfulExecutions');
      expect(stats).toHaveProperty('failedExecutions');

      expect(typeof stats.loadedModules).toBe('number');
      expect(typeof stats.executingModules).toBe('number');
      expect(typeof stats.totalExecutions).toBe('number');
      expect(typeof stats.successfulExecutions).toBe('number');
      expect(typeof stats.failedExecutions).toBe('number');
    });
  });

  describe('event emission', () => {
    it('should emit moduleLoaded event when module is loaded', async () => {
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(mockModule);

      const eventPromise = new Promise(resolve => {
        moduleLoader.once('moduleLoaded', resolve);
      });

      await moduleLoader.loadModule({
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      });

      const event = await eventPromise;
      expect(event).toHaveProperty('type', 'module_loaded');
      expect(event).toHaveProperty('moduleId', 'test-module');
    });

    it('should emit moduleUnloaded event when module is unloaded', async () => {
      jest.spyOn(moduleLoader as any, 'getModuleFromRepository').mockResolvedValue(mockModule);

      await moduleLoader.loadModule({
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
        verifySignature: false,
        sandboxed: false,
      });

      const eventPromise = new Promise(resolve => {
        moduleLoader.once('moduleUnloaded', resolve);
      });

      await moduleLoader.unloadModule({
        moduleId: 'test-module',
        implantId: 'test-implant',
        operatorId: 'test-operator',
      });

      const event = await eventPromise;
      expect(event).toHaveProperty('type', 'module_unloaded');
      expect(event).toHaveProperty('moduleId', 'test-module');
    });
  });
});
