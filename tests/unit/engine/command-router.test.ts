/**
 * Unit tests for CommandRouter
 */

import { CommandRouter } from '../../../src/core/engine/command-router';
// ImplantManager is used in type annotations
import { CommandRepository } from '../../../src/core/repositories/interfaces';
import {
  Command,
  CommandType,
  CommandStatus,
  CommandResult,
  CreateCommandData,
  UpdateCommandData,
  Implant,
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
} from '../../../src/types/entities';

// Mock command repository
class MockCommandRepository implements CommandRepository {
  private commands: Map<string, Command> = new Map();
  private idCounter = 1;

  async create(data: CreateCommandData): Promise<Command> {
    const command: Command = {
      id: `cmd-${this.idCounter++}`,
      ...data,
      timestamp: new Date(),
      status: CommandStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.commands.set(command.id, command);
    return command;
  }

  async findById(id: string): Promise<Command | null> {
    return this.commands.get(id) || null;
  }

  async findAll(): Promise<Command[]> {
    return Array.from(this.commands.values());
  }

  async update(id: string, data: UpdateCommandData): Promise<Command | null> {
    const command = this.commands.get(id);
    if (!command) return null;

    const updated = { ...command, ...data, updatedAt: new Date() };
    this.commands.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.commands.delete(id);
  }

  async findByImplantId(implantId: string, limit: number = 100): Promise<Command[]> {
    return Array.from(this.commands.values())
      .filter(c => c.implantId === implantId)
      .slice(0, limit);
  }

  async findByOperatorId(operatorId: string, limit: number = 100): Promise<Command[]> {
    return Array.from(this.commands.values())
      .filter(c => c.operatorId === operatorId)
      .slice(0, limit);
  }

  async findByStatus(status: CommandStatus): Promise<Command[]> {
    return Array.from(this.commands.values()).filter(c => c.status === status);
  }

  async findPendingCommands(implantId?: string): Promise<Command[]> {
    let commands = Array.from(this.commands.values()).filter(
      c => c.status === CommandStatus.PENDING
    );
    if (implantId) {
      commands = commands.filter(c => c.implantId === implantId);
    }
    return commands;
  }

  async updateCommandStatus(id: string, status: CommandStatus): Promise<void> {
    const command = this.commands.get(id);
    if (command) {
      command.status = status;
      command.updatedAt = new Date();
    }
  }

  async getCommandHistory(implantId: string, limit: number, offset: number): Promise<Command[]> {
    return Array.from(this.commands.values())
      .filter(c => c.implantId === implantId)
      .slice(offset, offset + limit);
  }

  async getCommandCount(): Promise<number> {
    return this.commands.size;
  }

  async getCommandsByDateRange(startDate: Date, endDate: Date): Promise<Command[]> {
    return Array.from(this.commands.values()).filter(
      c => c.timestamp >= startDate && c.timestamp <= endDate
    );
  }
}

// Mock implant manager
class MockImplantManager {
  private implants: Map<string, Implant> = new Map();

  async getImplant(implantId: string): Promise<Implant | null> {
    return this.implants.get(implantId) || null;
  }

  addMockImplant(implant: Implant): void {
    this.implants.set(implant.id, implant);
  }

  on(_event: string, _listener: (...args: any[]) => void): void {
    // Mock event emitter
  }
}

describe('CommandRouter', () => {
  let commandRouter: CommandRouter;
  let mockCommandRepository: MockCommandRepository;
  let mockImplantManager: MockImplantManager;
  let testImplant: Implant;

  beforeEach(() => {
    mockCommandRepository = new MockCommandRepository();
    mockImplantManager = new MockImplantManager();

    // Create test implant
    testImplant = {
      id: 'test-implant-1',
      hostname: 'test-host',
      username: 'test-user',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      privileges: PrivilegeLevel.USER,
      lastSeen: new Date(),
      status: ImplantStatus.ACTIVE,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockImplantManager.addMockImplant(testImplant);

    commandRouter = new CommandRouter(
      mockImplantManager as any,
      mockCommandRepository,
      5000, // 5 second timeout for testing
      2 // 2 max retries
    );
  });

  afterEach(() => {
    commandRouter.stop();
  });

  describe('queueCommand', () => {
    it('should queue a command successfully', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami',
        1
      );

      expect(command).toBeDefined();
      expect(command.implantId).toBe(testImplant.id);
      expect(command.operatorId).toBe('operator-1');
      expect(command.type).toBe(CommandType.SHELL);
      expect(command.payload).toBe('whoami');
      expect(command.status).toBe(CommandStatus.PENDING);
    });

    it('should throw error for non-existent implant', async () => {
      await expect(
        commandRouter.queueCommand(
          'non-existent-implant',
          'operator-1',
          CommandType.SHELL,
          'whoami'
        )
      ).rejects.toThrow('Implant non-existent-implant not found');
    });

    it('should emit commandQueued event', async () => {
      const eventPromise = new Promise(resolve => {
        commandRouter.once('commandQueued', resolve);
      });

      await commandRouter.queueCommand(testImplant.id, 'operator-1', CommandType.SHELL, 'whoami');

      const event = await eventPromise;
      expect(event).toBeDefined();
    });
  });

  describe('getPendingCommands', () => {
    it('should return pending commands for implant', async () => {
      // Queue multiple commands
      await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami',
        2
      );

      await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.POWERSHELL,
        'Get-Process',
        1
      );

      const pendingCommands = await commandRouter.getPendingCommands(testImplant.id);

      expect(pendingCommands).toHaveLength(2);
      // Should be sorted by priority (higher first)
      expect(pendingCommands[0]?.type).toBe(CommandType.SHELL); // Priority 2
      expect(pendingCommands[1]?.type).toBe(CommandType.POWERSHELL); // Priority 1
    });

    it('should return empty array for implant with no commands', async () => {
      const pendingCommands = await commandRouter.getPendingCommands(testImplant.id);
      expect(pendingCommands).toHaveLength(0);
    });
  });

  describe('command execution lifecycle', () => {
    let command: Command;

    beforeEach(async () => {
      command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );
    });

    it('should start command execution', async () => {
      await commandRouter.startCommandExecution(command.id);

      const updatedCommand = await commandRouter.getCommandStatus(command.id);
      expect(updatedCommand?.status).toBe(CommandStatus.EXECUTING);

      // Command should be removed from queue
      const pendingCommands = await commandRouter.getPendingCommands(testImplant.id);
      expect(pendingCommands).toHaveLength(0);
    });

    it('should complete command execution successfully', async () => {
      await commandRouter.startCommandExecution(command.id);

      const result: CommandResult = {
        stdout: 'test-user',
        stderr: '',
        exitCode: 0,
        executionTime: 1000,
      };

      await commandRouter.completeCommandExecution(command.id, result);

      const updatedCommand = await commandRouter.getCommandStatus(command.id);
      expect(updatedCommand?.status).toBe(CommandStatus.COMPLETED);
      expect(updatedCommand?.result).toEqual(result);
    });

    it('should fail command execution', async () => {
      await commandRouter.startCommandExecution(command.id);

      await commandRouter.failCommandExecution(command.id, 'Command not found');

      const updatedCommand = await commandRouter.getCommandStatus(command.id);
      expect(updatedCommand?.status).toBe(CommandStatus.FAILED);
      expect(updatedCommand?.result?.stderr).toBe('Command not found');
    });

    it('should emit execution events', async () => {
      const startedPromise = new Promise(resolve => {
        commandRouter.once('commandExecutionStarted', resolve);
      });

      const completedPromise = new Promise(resolve => {
        commandRouter.once('commandExecutionCompleted', resolve);
      });

      await commandRouter.startCommandExecution(command.id);
      await startedPromise;

      const result: CommandResult = {
        stdout: 'test-user',
        stderr: '',
        exitCode: 0,
        executionTime: 1000,
      };

      await commandRouter.completeCommandExecution(command.id, result);
      await completedPromise;

      // Both events should have been emitted
      expect(true).toBe(true); // Test passes if no errors thrown
    });
  });

  describe('command timeout', () => {
    it('should timeout long-running commands', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'sleep 10'
      );

      const timeoutPromise = new Promise(resolve => {
        commandRouter.once('commandTimeout', resolve);
      });

      await commandRouter.startCommandExecution(command.id, 100); // 100ms timeout

      await timeoutPromise;

      const updatedCommand = await commandRouter.getCommandStatus(command.id);
      expect(updatedCommand?.status).toBe(CommandStatus.TIMEOUT);
    });
  });

  describe('cancelCommand', () => {
    it('should cancel pending command', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );

      await commandRouter.cancelCommand(command.id);

      const updatedCommand = await commandRouter.getCommandStatus(command.id);
      expect(updatedCommand?.status).toBe(CommandStatus.FAILED);

      // Should be removed from queue
      const pendingCommands = await commandRouter.getPendingCommands(testImplant.id);
      expect(pendingCommands).toHaveLength(0);
    });

    it('should cancel executing command', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );

      await commandRouter.startCommandExecution(command.id);
      await commandRouter.cancelCommand(command.id);

      const updatedCommand = await commandRouter.getCommandStatus(command.id);
      expect(updatedCommand?.status).toBe(CommandStatus.FAILED);
    });

    it('should not cancel completed command', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );

      await commandRouter.startCommandExecution(command.id);

      const result: CommandResult = {
        stdout: 'test-user',
        stderr: '',
        exitCode: 0,
        executionTime: 1000,
      };

      await commandRouter.completeCommandExecution(command.id, result);

      await expect(commandRouter.cancelCommand(command.id)).rejects.toThrow(
        'Cannot cancel command with status: completed'
      );
    });

    it('should emit commandCancelled event', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );

      const eventPromise = new Promise(resolve => {
        commandRouter.once('commandCancelled', resolve);
      });

      await commandRouter.cancelCommand(command.id);
      const event = await eventPromise;

      expect(event).toBeDefined();
    });
  });

  describe('getCommandHistory', () => {
    it('should return command history for implant', async () => {
      // Create multiple commands
      const command1 = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );

      const command2 = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.POWERSHELL,
        'Get-Process'
      );

      const history = await commandRouter.getCommandHistory(testImplant.id, 10, 0);

      expect(history).toHaveLength(2);
      expect(history.map(c => c.id)).toContain(command1.id);
      expect(history.map(c => c.id)).toContain(command2.id);
    });

    it('should respect limit and offset parameters', async () => {
      // Create multiple commands
      for (let i = 0; i < 5; i++) {
        await commandRouter.queueCommand(
          testImplant.id,
          'operator-1',
          CommandType.SHELL,
          `command-${i}`
        );
      }

      const history = await commandRouter.getCommandHistory(testImplant.id, 2, 1);

      expect(history).toHaveLength(2);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      await commandRouter.queueCommand(testImplant.id, 'operator-1', CommandType.SHELL, 'whoami');

      await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.POWERSHELL,
        'Get-Process'
      );

      const stats = commandRouter.getQueueStats();

      expect(stats[testImplant.id]).toBe(2);
    });

    it('should return empty stats for no queued commands', () => {
      const stats = commandRouter.getQueueStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  describe('command retry logic', () => {
    it('should retry failed commands up to max retries', async () => {
      const command = await commandRouter.queueCommand(
        testImplant.id,
        'operator-1',
        CommandType.SHELL,
        'whoami'
      );

      await commandRouter.startCommandExecution(command.id);

      // Fail the command (should trigger retry)
      await commandRouter.failCommandExecution(command.id, 'Network error');

      // Command should be back in queue for retry
      const pendingCommands = await commandRouter.getPendingCommands(testImplant.id);
      expect(pendingCommands).toHaveLength(1);
    });
  });
});
