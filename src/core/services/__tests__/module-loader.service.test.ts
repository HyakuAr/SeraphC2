/**
 * Tests for Module Loader Service
 */

import { ModuleLoaderService, ModuleLoaderConfig } from '../module-loader.service';
import {
  Module,
  ModuleStatus,
  ModuleCategory,
  ModuleExecutionMode,
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
} from '../../../types/modules';
import * as fs from 'fs/promises';

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
jest.mock('fs/promises');
jest.mock('crypto');

describe('ModuleLoaderService', () => {
  let moduleLoader: ModuleLoaderService;
  let config: ModuleLoaderConfig;
  let mockModule: Module;

  beforeEach(() => {
    config = {
      moduleDirectory: '/tmp/modules',
      sandboxDirectory: '/tmp/sandbox',
      trustedPublicKeys: ['trusted-key-1', 'trusted-key-2'],
      defaultSandboxConfig: {
        enabled: true,
        isolateNetwork: true,
        isolateFileSystem: true,
        isolateRegistry: true,
        isolateProcesses: true,
        resourceLimits: {
          maxMemory: 256 * 1024 * 1024,
          maxCpuUsage: 50,
          maxExecutionTime: 300000,
        },
        timeoutMs: 300000,
      },
      maxConcurrentExecutions: 10,
      executionTimeoutMs: 300000,
      signatureVerificationRequired: true,
      allowUnsignedModules: false,
      moduleCleanupIntervalMs: 60000,
    };

    mockModule = {
      id: 'test-module-id',
      metadata: {
        name: 'TestModule',
        version: '1.0.0',
        description: 'Test module for unit tests',
        author: 'Test Author',
        category: ModuleCategory.CREDENTIAL_HARVESTING,
        tags: ['test', 'credential'],
        requirements: {
          minOSVersion: 'Windows 7',
          architecture: ['x64'],
          privileges: ['SeDebugPrivilege'],
        },
        capabilities: [
          {
            name: 'test_capability',
            description: 'Test capability',
            parameters: [
              {
                name: 'test_param',
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
        timeout: 60000,
        networkAccess: false,
        fileSystemAccess: true,
        registryAccess: false,
        processAccess: true,
      },
      signature: {
        algorithm: 'RSA-SHA256',
        publicKey: 'trusted-key-1',
        signature: 'test-signature',
        timestamp: new Date(),
        issuer: 'Test Issuer',
      },
      binary: Buffer.from('test module binary'),
      hash: 'test-hash',
      size: 100,
      status: ModuleStatus.UNLOADED,
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    moduleLoader = new ModuleLoaderService(config);

    // Mock fs operations
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.rm as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    moduleLoader.stop();
    jest.clearAllMocks();
  });

  describe('loadModule', () => {
    it('should load a module successfully', async () => {
      const request: ModuleLoadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        verifySignature: true,
        sandboxed: true,
      };

      // Mock getModuleFromStorage to return our test module
      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(mockModule);
      jest.spyOn(moduleLoader as any, 'verifyModuleSignature').mockResolvedValue(undefined);
      jest
        .spyOn(moduleLoader as any, 'prepareSandboxEnvironment')
        .mockResolvedValue('/tmp/sandbox/test');
      jest.spyOn(moduleLoader as any, 'loadModuleIntoMemory').mockResolvedValue({
        ...mockModule,
        status: ModuleStatus.LOADED,
        loadedAt: new Date(),
      });

      const result = await moduleLoader.loadModule(request);

      expect(result).toBeDefined();
      expect(result.status).toBe(ModuleStatus.LOADED);
      expect(result.loadedAt).toBeDefined();
    });

    it('should throw error if module not found', async () => {
      const request: ModuleLoadRequest = {
        moduleId: 'non-existent-module',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(null);

      await expect(moduleLoader.loadModule(request)).rejects.toThrow(
        'Module non-existent-module not found'
      );
    });

    it('should skip signature verification when disabled', async () => {
      const request: ModuleLoadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        verifySignature: false,
      };

      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(mockModule);
      const verifySpy = jest
        .spyOn(moduleLoader as any, 'verifyModuleSignature')
        .mockResolvedValue(undefined);
      jest
        .spyOn(moduleLoader as any, 'prepareSandboxEnvironment')
        .mockResolvedValue('/tmp/sandbox/test');
      jest.spyOn(moduleLoader as any, 'loadModuleIntoMemory').mockResolvedValue({
        ...mockModule,
        status: ModuleStatus.LOADED,
      });

      await moduleLoader.loadModule(request);

      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('should emit module loaded event', async () => {
      const request: ModuleLoadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(mockModule);
      jest.spyOn(moduleLoader as any, 'verifyModuleSignature').mockResolvedValue(undefined);
      jest
        .spyOn(moduleLoader as any, 'prepareSandboxEnvironment')
        .mockResolvedValue('/tmp/sandbox/test');
      jest.spyOn(moduleLoader as any, 'loadModuleIntoMemory').mockResolvedValue({
        ...mockModule,
        status: ModuleStatus.LOADED,
        loadedAt: new Date(),
      });

      const eventSpy = jest.fn();
      moduleLoader.on('moduleEvent', eventSpy);

      await moduleLoader.loadModule(request);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'module_loaded',
          moduleId: 'test-module-id',
          implantId: 'test-implant-id',
          operatorId: 'test-operator-id',
        })
      );
    });
  });

  describe('executeModule', () => {
    beforeEach(async () => {
      // Load module first
      const loadRequest: ModuleLoadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(mockModule);
      jest.spyOn(moduleLoader as any, 'verifyModuleSignature').mockResolvedValue(undefined);
      jest
        .spyOn(moduleLoader as any, 'prepareSandboxEnvironment')
        .mockResolvedValue('/tmp/sandbox/test');
      jest.spyOn(moduleLoader as any, 'loadModuleIntoMemory').mockResolvedValue({
        ...mockModule,
        status: ModuleStatus.LOADED,
        loadedAt: new Date(),
      });

      await moduleLoader.loadModule(loadRequest);
    });

    it('should execute a module capability successfully', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'test_capability',
        parameters: { test_param: 'test_value' },
      };

      jest.spyOn(moduleLoader as any, 'executeModuleInSandbox').mockResolvedValue({
        success: true,
        data: { result: 'test_result' },
        type: 'test_capability',
        size: 100,
        checksum: 'test-checksum',
      });

      const result = await moduleLoader.executeModule(request);

      expect(result).toBeDefined();
      expect(result.status).toBe(ModuleStatus.COMPLETED);
      expect(result.result?.success).toBe(true);
      expect(result.result?.data).toEqual({ result: 'test_result' });
    });

    it('should throw error if module not loaded', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'unloaded-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'test_capability',
        parameters: {},
      };

      await expect(moduleLoader.executeModule(request)).rejects.toThrow(
        'Module unloaded-module-id not loaded for implant test-implant-id'
      );
    });

    it('should throw error if capability not found', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'non_existent_capability',
        parameters: {},
      };

      await expect(moduleLoader.executeModule(request)).rejects.toThrow(
        'Capability non_existent_capability not found in module test-module-id'
      );
    });

    it('should validate required parameters', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'test_capability',
        parameters: {}, // Missing required test_param
      };

      await expect(moduleLoader.executeModule(request)).rejects.toThrow(
        "Required parameter 'test_param' is missing"
      );
    });

    it('should emit execution events', async () => {
      const request: ModuleExecuteRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
        capability: 'test_capability',
        parameters: { test_param: 'test_value' },
      };

      jest.spyOn(moduleLoader as any, 'executeModuleInSandbox').mockResolvedValue({
        success: true,
        data: { result: 'test_result' },
        type: 'test_capability',
        size: 100,
      });

      const eventSpy = jest.fn();
      moduleLoader.on('moduleEvent', eventSpy);

      await moduleLoader.executeModule(request);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'module_execution_started',
          moduleId: 'test-module-id',
        })
      );

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'module_execution_completed',
          moduleId: 'test-module-id',
        })
      );
    });
  });

  describe('unloadModule', () => {
    beforeEach(async () => {
      // Load module first
      const loadRequest: ModuleLoadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(mockModule);
      jest.spyOn(moduleLoader as any, 'verifyModuleSignature').mockResolvedValue(undefined);
      jest
        .spyOn(moduleLoader as any, 'prepareSandboxEnvironment')
        .mockResolvedValue('/tmp/sandbox/test');
      jest.spyOn(moduleLoader as any, 'loadModuleIntoMemory').mockResolvedValue({
        ...mockModule,
        status: ModuleStatus.LOADED,
        loadedAt: new Date(),
      });

      await moduleLoader.loadModule(loadRequest);
    });

    it('should unload a module successfully', async () => {
      const request: ModuleUnloadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'cleanupSandboxEnvironment').mockResolvedValue(undefined);

      const result = await moduleLoader.unloadModule(request);

      expect(result).toBe(true);
    });

    it('should return false if module not loaded', async () => {
      const request: ModuleUnloadRequest = {
        moduleId: 'unloaded-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      const result = await moduleLoader.unloadModule(request);

      expect(result).toBe(false);
    });

    it('should emit module unloaded event', async () => {
      const request: ModuleUnloadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'cleanupSandboxEnvironment').mockResolvedValue(undefined);

      const eventSpy = jest.fn();
      moduleLoader.on('moduleEvent', eventSpy);

      await moduleLoader.unloadModule(request);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'module_unloaded',
          moduleId: 'test-module-id',
          implantId: 'test-implant-id',
        })
      );
    });
  });

  describe('getLoadedModules', () => {
    it('should return empty array when no modules loaded', () => {
      const result = moduleLoader.getLoadedModules();
      expect(result).toEqual([]);
    });

    it('should return loaded modules for specific implant', async () => {
      // Load a module
      const loadRequest: ModuleLoadRequest = {
        moduleId: 'test-module-id',
        implantId: 'test-implant-id',
        operatorId: 'test-operator-id',
      };

      jest.spyOn(moduleLoader as any, 'getModuleFromStorage').mockResolvedValue(mockModule);
      jest.spyOn(moduleLoader as any, 'verifyModuleSignature').mockResolvedValue(undefined);
      jest
        .spyOn(moduleLoader as any, 'prepareSandboxEnvironment')
        .mockResolvedValue('/tmp/sandbox/test');
      jest.spyOn(moduleLoader as any, 'loadModuleIntoMemory').mockResolvedValue({
        ...mockModule,
        status: ModuleStatus.LOADED,
        loadedAt: new Date(),
      });

      await moduleLoader.loadModule(loadRequest);

      const result = moduleLoader.getLoadedModules('test-implant-id');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('test-module-id');
    });
  });

  describe('stopExecution', () => {
    it('should return false for non-existent execution', async () => {
      const result = await moduleLoader.stopExecution('non-existent-execution-id');
      expect(result).toBe(false);
    });
  });

  describe('verifyModuleSignature', () => {
    it('should verify signature with trusted key', async () => {
      const mockVerify = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(true),
      };

      const crypto = require('crypto');
      crypto.createVerify = jest.fn().mockReturnValue(mockVerify);
      crypto.createHash = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash'),
      });

      const moduleWithTrustedKey = {
        ...mockModule,
        signature: {
          ...mockModule.signature,
          publicKey: 'trusted-key-1',
        },
      };

      await expect(
        (moduleLoader as any).verifyModuleSignature(moduleWithTrustedKey)
      ).resolves.not.toThrow();
    });

    it('should throw error for untrusted key when not allowed', async () => {
      const moduleWithUntrustedKey = {
        ...mockModule,
        signature: {
          ...mockModule.signature,
          publicKey: 'untrusted-key',
        },
      };

      await expect(
        (moduleLoader as any).verifyModuleSignature(moduleWithUntrustedKey)
      ).rejects.toThrow('Module signed with untrusted key');
    });

    it('should throw error for invalid signature', async () => {
      const mockVerify = {
        update: jest.fn().mockReturnThis(),
        verify: jest.fn().mockReturnValue(false),
      };

      const crypto = require('crypto');
      crypto.createVerify = jest.fn().mockReturnValue(mockVerify);
      crypto.createHash = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('test-hash'),
      });

      await expect((moduleLoader as any).verifyModuleSignature(mockModule)).rejects.toThrow(
        'Invalid module signature'
      );
    });
  });

  describe('validateModuleParameters', () => {
    it('should validate required parameters', () => {
      const parameterDefs = [
        {
          name: 'required_param',
          type: 'string',
          required: true,
          description: 'Required parameter',
        },
      ];

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {});
      }).toThrow("Required parameter 'required_param' is missing");
    });

    it('should validate parameter patterns', () => {
      const parameterDefs = [
        {
          name: 'email_param',
          type: 'string',
          required: true,
          description: 'Email parameter',
          validation: {
            pattern: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
          },
        },
      ];

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {
          email_param: 'invalid-email',
        });
      }).toThrow("Parameter 'email_param' does not match pattern");
    });

    it('should validate enum values', () => {
      const parameterDefs = [
        {
          name: 'choice_param',
          type: 'string',
          required: true,
          description: 'Choice parameter',
          validation: {
            enum: ['option1', 'option2', 'option3'],
          },
        },
      ];

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {
          choice_param: 'invalid_option',
        });
      }).toThrow("Parameter 'choice_param' must be one of: option1, option2, option3");
    });

    it('should validate string length', () => {
      const parameterDefs = [
        {
          name: 'length_param',
          type: 'string',
          required: true,
          description: 'Length parameter',
          validation: {
            minLength: 5,
            maxLength: 10,
          },
        },
      ];

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {
          length_param: 'abc',
        });
      }).toThrow("Parameter 'length_param' is too short");

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {
          length_param: 'this_is_too_long',
        });
      }).toThrow("Parameter 'length_param' is too long");
    });

    it('should validate number ranges', () => {
      const parameterDefs = [
        {
          name: 'number_param',
          type: 'number',
          required: true,
          description: 'Number parameter',
          validation: {
            min: 1,
            max: 100,
          },
        },
      ];

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {
          number_param: 0,
        });
      }).toThrow("Parameter 'number_param' is below minimum value");

      expect(() => {
        (moduleLoader as any).validateModuleParameters(parameterDefs, {
          number_param: 101,
        });
      }).toThrow("Parameter 'number_param' is above maximum value");
    });
  });
});
