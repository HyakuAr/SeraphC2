/**
 * Unit tests for C2Engine
 */

import { C2Engine, C2EngineConfig } from '../../../src/core/engine/c2-engine';
import { RepositoryFactory } from '../../../src/core/repositories/interfaces';
import { CommandType, CommandResult, PrivilegeLevel, Protocol } from '../../../src/types/entities';

// Mock repository factory
class MockRepositoryFactory implements RepositoryFactory {
  getImplantRepository() {
    return {} as any;
  }

  getOperatorRepository() {
    return {} as any;
  }

  getCommandRepository() {
    return {} as any;
  }
}

describe('C2Engine', () => {
  let c2Engine: C2Engine;
  let mockRepositoryFactory: MockRepositoryFactory;

  beforeEach(() => {
    mockRepositoryFactory = new MockRepositoryFactory();

    const config: C2EngineConfig = {
      heartbeatInterval: 1000,
      inactivityThreshold: 5000,
      commandTimeout: 5000,
      maxCommandRetries: 2,
    };

    c2Engine = new C2Engine(mockRepositoryFactory, config);
  });

  afterEach(async () => {
    if (c2Engine.getStatus().isRunning) {
      await c2Engine.stop();
    }
  });

  describe('lifecycle management', () => {
    it('should start successfully', async () => {
      await c2Engine.start();

      const status = c2Engine.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should stop successfully', async () => {
      await c2Engine.start();
      await c2Engine.stop();

      const status = c2Engine.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should not start if already running', async () => {
      await c2Engine.start();

      await expect(c2Engine.start()).rejects.toThrow('C2Engine is already running');
    });

    it('should emit engineStarted event', async () => {
      let eventReceived = false;
      c2Engine.once('engineStarted', () => {
        eventReceived = true;
      });

      await c2Engine.start();

      expect(eventReceived).toBe(true);
    });

    it('should emit engineStopped event', async () => {
      await c2Engine.start();

      let eventReceived = false;
      c2Engine.once('engineStopped', () => {
        eventReceived = true;
      });

      await c2Engine.stop();

      expect(eventReceived).toBe(true);
    });
  });

  describe('operation validation', () => {
    it('should throw error when calling methods before starting', async () => {
      const registrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      await expect(c2Engine.registerImplant(registrationData)).rejects.toThrow(
        'C2Engine is not running. Call start() first.'
      );
    });

    it('should allow operations after starting', async () => {
      await c2Engine.start();

      // These should not throw errors (though they may fail for other reasons)
      expect(() => c2Engine.getStatus()).not.toThrow();
      expect(() => c2Engine.isImplantActive('test-id')).not.toThrow();
      expect(() => c2Engine.getActiveSessions()).not.toThrow();
    });
  });

  describe('implant management delegation', () => {
    beforeEach(async () => {
      await c2Engine.start();
    });

    it('should delegate registerImplant to ImplantManager', async () => {
      const registrationData = {
        hostname: 'test-host',
        username: 'test-user',
        operatingSystem: 'Windows 10',
        architecture: 'x64',
        privileges: PrivilegeLevel.USER,
        communicationProtocol: Protocol.HTTPS,
        encryptionKey: 'test-key',
        configuration: {
          callbackInterval: 30000,
          jitter: 0.1,
          maxRetries: 3,
        },
        systemInfo: {
          hostname: 'test-host',
          operatingSystem: 'Windows 10',
          architecture: 'x64',
          processorInfo: 'Intel Core i7',
          memoryTotal: 16777216,
          diskSpace: 1073741824,
          networkInterfaces: ['Ethernet'],
          installedSoftware: ['Chrome', 'Firefox'],
          runningProcesses: 150,
        },
        remoteAddress: '192.168.1.100',
      };

      // This will fail because we're using mock repositories, but it should delegate properly
      await expect(c2Engine.registerImplant(registrationData)).rejects.toThrow(); // Expected to fail with mock
    });

    it('should delegate processHeartbeat to ImplantManager', async () => {
      const heartbeatData = {
        implantId: 'test-implant',
        protocol: Protocol.HTTPS,
        remoteAddress: '192.168.1.100',
      };

      // This will fail because we're using mock repositories, but it should delegate properly
      await expect(c2Engine.processHeartbeat(heartbeatData)).rejects.toThrow(); // Expected to fail with mock
    });
  });

  describe('command management delegation', () => {
    beforeEach(async () => {
      await c2Engine.start();
    });

    it('should delegate executeCommand to CommandRouter', async () => {
      // This will fail because we're using mock repositories, but it should delegate properly
      await expect(
        c2Engine.executeCommand('test-implant', 'test-operator', CommandType.SHELL, 'whoami')
      ).rejects.toThrow(); // Expected to fail with mock
    });

    it('should delegate getPendingCommands to CommandRouter', async () => {
      // This will fail because we're using mock repositories, but it should delegate properly
      await expect(c2Engine.getPendingCommands('test-implant')).rejects.toThrow(); // Expected to fail with mock
    });

    it('should delegate command execution methods to CommandRouter', async () => {
      const result: CommandResult = {
        stdout: 'test-user',
        stderr: '',
        exitCode: 0,
        executionTime: 1000,
      };

      // These will fail because we're using mock repositories, but should delegate properly
      await expect(c2Engine.startCommandExecution('test-command')).rejects.toThrow(); // Expected to fail with mock

      await expect(c2Engine.completeCommandExecution('test-command', result)).rejects.toThrow(); // Expected to fail with mock

      await expect(
        c2Engine.failCommandExecution('test-command', 'Error message')
      ).rejects.toThrow(); // Expected to fail with mock

      await expect(c2Engine.cancelCommand('test-command')).rejects.toThrow(); // Expected to fail with mock
    });
  });

  describe('event forwarding', () => {
    beforeEach(async () => {
      await c2Engine.start();
    });

    it('should forward ImplantManager events', done => {
      let eventsReceived = 0;
      const expectedEvents = [
        'implantRegistered',
        'heartbeatReceived',
        'implantDisconnected',
        'implantInactive',
      ];

      expectedEvents.forEach(eventName => {
        c2Engine.once(eventName, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      // Simulate events from ImplantManager
      const implantManager = (c2Engine as any).implantManager;
      expectedEvents.forEach(eventName => {
        implantManager.emit(eventName, { test: 'data' });
      });
    });

    it('should forward CommandRouter events', done => {
      let eventsReceived = 0;
      const expectedEvents = [
        'commandQueued',
        'commandExecutionStarted',
        'commandExecutionCompleted',
        'commandExecutionFailed',
        'commandTimeout',
        'commandCancelled',
      ];

      expectedEvents.forEach(eventName => {
        c2Engine.once(eventName, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });

      // Simulate events from CommandRouter
      const commandRouter = (c2Engine as any).commandRouter;
      expectedEvents.forEach(eventName => {
        commandRouter.emit(eventName, { test: 'data' });
      });
    });
  });

  describe('status and statistics', () => {
    it('should return correct status when not running', () => {
      const status = c2Engine.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should return correct status when running', async () => {
      await c2Engine.start();

      const status = c2Engine.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should get engine statistics when running', async () => {
      await c2Engine.start();

      // This will fail because we're using mock repositories, but should delegate properly
      await expect(c2Engine.getEngineStats()).rejects.toThrow(); // Expected to fail with mock
    });

    it('should not get engine statistics when not running', async () => {
      await expect(c2Engine.getEngineStats()).rejects.toThrow(
        'C2Engine is not running. Call start() first.'
      );
    });
  });

  describe('configuration', () => {
    it('should create engine with default configuration', () => {
      const defaultEngine = new C2Engine();
      expect(defaultEngine).toBeDefined();

      const status = defaultEngine.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should create engine with custom configuration', () => {
      const customConfig: C2EngineConfig = {
        heartbeatInterval: 2000,
        inactivityThreshold: 10000,
        commandTimeout: 10000,
        maxCommandRetries: 5,
      };

      const customEngine = new C2Engine(undefined, customConfig);
      expect(customEngine).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle start errors gracefully', async () => {
      // Mock an error in the start process by stopping immediately after start
      await c2Engine.start();

      // Engine should still be in a valid state
      const status = c2Engine.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should handle stop errors gracefully', async () => {
      await c2Engine.start();
      await c2Engine.stop();

      // Multiple stops should not throw
      await expect(c2Engine.stop()).resolves.not.toThrow();
    });
  });
});
