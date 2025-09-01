/**
 * CommandManager tests
 */

import { CommandManager } from '../command-manager';
import { CommandRouter } from '../command-router';
import { ImplantManager } from '../implant-manager';
import { CommandRepository } from '../../repositories/interfaces';
import {
  CommandType,
  CommandStatus,
  Command,
  Implant,
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
} from '../../../types/entities';

interface MockImplantSession {
  implantId: string;
  isActive: boolean;
  lastHeartbeat: Date;
  connectionInfo: {
    protocol: Protocol;
    remoteAddress: string;
  };
}

// Mock dependencies
jest.mock('../command-router');
jest.mock('../implant-manager');
jest.mock('../../repositories/command.repository');

describe('CommandManager', () => {
  let commandManager: CommandManager;
  let mockCommandRouter: jest.Mocked<CommandRouter>;
  let mockImplantManager: jest.Mocked<ImplantManager>;
  let mockCommandRepository: jest.Mocked<CommandRepository>;

  const mockImplant: Implant = {
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
      callbackInterval: 5000,
      jitter: 10,
      maxRetries: 3,
    },
    systemInfo: {
      hostname: 'test-host',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      processorInfo: 'Intel Core i7',
      memoryTotal: 16777216000,
      diskSpace: 1000000000000,
      networkInterfaces: ['192.168.1.100'],
      installedSoftware: [],
      runningProcesses: 150,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCommand: Command = {
    id: 'test-command-1',
    implantId: 'test-implant-1',
    operatorId: 'test-operator-1',
    type: CommandType.SHELL,
    payload: 'whoami',
    timestamp: new Date(),
    status: CommandStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSession: MockImplantSession = {
    implantId: 'test-implant-1',
    isActive: true,
    lastHeartbeat: new Date(),
    connectionInfo: {
      protocol: Protocol.HTTPS,
      remoteAddress: '192.168.1.100',
    },
  };

  beforeEach(() => {
    // Create mocks
    mockCommandRouter = {
      queueCommand: jest.fn(),
      startCommandExecution: jest.fn(),
      cancelCommand: jest.fn(),
      getPendingCommands: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    } as any;

    mockImplantManager = {
      getImplant: jest.fn(),
      getImplantSession: jest.fn(),
    } as any;

    mockCommandRepository = {
      findById: jest.fn(),
      getCommandHistory: jest.fn(),
      findByOperatorId: jest.fn(),
      findByStatus: jest.fn(),
      getCommandsByDateRange: jest.fn(),
      findAll: jest.fn(),
    } as any;

    commandManager = new CommandManager(
      mockCommandRouter,
      mockImplantManager,
      mockCommandRepository
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCommand', () => {
    it('should execute a command successfully', async () => {
      // Arrange
      const request = {
        implantId: 'test-implant-1',
        operatorId: 'test-operator-1',
        type: CommandType.SHELL,
        payload: 'whoami',
        timeout: 30000,
      };

      mockImplantManager.getImplant.mockResolvedValue(mockImplant);
      mockImplantManager.getImplantSession.mockReturnValue(mockSession);
      mockCommandRouter.queueCommand.mockResolvedValue(mockCommand);
      mockCommandRouter.startCommandExecution.mockResolvedValue(undefined);

      // Act
      const result = await commandManager.executeCommand(request);

      // Assert
      expect(result).toEqual(mockCommand);
      expect(mockImplantManager.getImplant).toHaveBeenCalledWith('test-implant-1');
      expect(mockImplantManager.getImplantSession).toHaveBeenCalledWith('test-implant-1');
      expect(mockCommandRouter.queueCommand).toHaveBeenCalledWith(
        'test-implant-1',
        'test-operator-1',
        CommandType.SHELL,
        'whoami',
        0
      );
      expect(mockCommandRouter.startCommandExecution).toHaveBeenCalledWith(mockCommand.id, 30000);
    });

    it('should throw error if implant not found', async () => {
      // Arrange
      const request = {
        implantId: 'non-existent-implant',
        operatorId: 'test-operator-1',
        type: CommandType.SHELL,
        payload: 'whoami',
      };

      mockImplantManager.getImplant.mockResolvedValue(null);

      // Act & Assert
      await expect(commandManager.executeCommand(request)).rejects.toThrow(
        'Implant non-existent-implant not found'
      );
    });

    it('should throw error if implant not connected', async () => {
      // Arrange
      const request = {
        implantId: 'test-implant-1',
        operatorId: 'test-operator-1',
        type: CommandType.SHELL,
        payload: 'whoami',
      };

      mockImplantManager.getImplant.mockResolvedValue(mockImplant);
      mockImplantManager.getImplantSession.mockReturnValue(null);

      // Act & Assert
      await expect(commandManager.executeCommand(request)).rejects.toThrow(
        'Implant test-implant-1 is not connected'
      );
    });
  });

  describe('cancelCommand', () => {
    it('should cancel a command successfully', async () => {
      // Arrange
      const commandId = 'test-command-1';
      const operatorId = 'test-operator-1';

      mockCommandRepository.findById.mockResolvedValue(mockCommand);
      mockCommandRouter.cancelCommand.mockResolvedValue(undefined);

      // Act
      await commandManager.cancelCommand(commandId, operatorId);

      // Assert
      expect(mockCommandRepository.findById).toHaveBeenCalledWith(commandId);
      expect(mockCommandRouter.cancelCommand).toHaveBeenCalledWith(commandId);
    });

    it('should throw error if command not found', async () => {
      // Arrange
      const commandId = 'non-existent-command';
      const operatorId = 'test-operator-1';

      mockCommandRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(commandManager.cancelCommand(commandId, operatorId)).rejects.toThrow(
        'Command non-existent-command not found'
      );
    });

    it('should throw error if operator does not own the command', async () => {
      // Arrange
      const commandId = 'test-command-1';
      const operatorId = 'different-operator';

      mockCommandRepository.findById.mockResolvedValue(mockCommand);

      // Act & Assert
      await expect(commandManager.cancelCommand(commandId, operatorId)).rejects.toThrow(
        'Insufficient permissions to cancel this command'
      );
    });
  });

  describe('executeShellCommand', () => {
    it('should execute a shell command', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const operatorId = 'test-operator-1';
      const command = 'dir';
      const timeout = 30000;

      mockImplantManager.getImplant.mockResolvedValue(mockImplant);
      mockImplantManager.getImplantSession.mockReturnValue(mockSession);
      mockCommandRouter.queueCommand.mockResolvedValue(mockCommand);
      mockCommandRouter.startCommandExecution.mockResolvedValue(undefined);

      // Act
      const result = await commandManager.executeShellCommand(
        implantId,
        operatorId,
        command,
        timeout
      );

      // Assert
      expect(result).toEqual(mockCommand);
      expect(mockCommandRouter.queueCommand).toHaveBeenCalledWith(
        implantId,
        operatorId,
        CommandType.SHELL,
        command,
        0
      );
    });
  });

  describe('executePowerShellCommand', () => {
    it('should execute a PowerShell command', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const operatorId = 'test-operator-1';
      const command = 'Get-Process';
      const timeout = 30000;

      mockImplantManager.getImplant.mockResolvedValue(mockImplant);
      mockImplantManager.getImplantSession.mockReturnValue(mockSession);
      mockCommandRouter.queueCommand.mockResolvedValue({
        ...mockCommand,
        type: CommandType.POWERSHELL,
        payload: command,
      });
      mockCommandRouter.startCommandExecution.mockResolvedValue(undefined);

      // Act
      await commandManager.executePowerShellCommand(implantId, operatorId, command, timeout);

      // Assert
      expect(mockCommandRouter.queueCommand).toHaveBeenCalledWith(
        implantId,
        operatorId,
        CommandType.POWERSHELL,
        command,
        0
      );
    });
  });

  describe('getCommandHistory', () => {
    it('should get command history for an implant', async () => {
      // Arrange
      const filter = {
        implantId: 'test-implant-1',
        limit: 50,
        offset: 0,
      };

      const mockCommands = [mockCommand];
      mockCommandRepository.getCommandHistory.mockResolvedValue(mockCommands);

      // Act
      const result = await commandManager.getCommandHistory(filter);

      // Assert
      expect(result).toEqual(mockCommands);
      expect(mockCommandRepository.getCommandHistory).toHaveBeenCalledWith('test-implant-1', 50, 0);
    });

    it('should get command history by operator', async () => {
      // Arrange
      const filter = {
        operatorId: 'test-operator-1',
        limit: 50,
      };

      const mockCommands = [mockCommand];
      mockCommandRepository.findByOperatorId.mockResolvedValue(mockCommands);

      // Act
      const result = await commandManager.getCommandHistory(filter);

      // Assert
      expect(result).toEqual(mockCommands);
      expect(mockCommandRepository.findByOperatorId).toHaveBeenCalledWith('test-operator-1', 50);
    });
  });

  describe('getPendingCommands', () => {
    it('should get pending commands for an implant', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const mockCommands = [mockCommand];
      mockCommandRouter.getPendingCommands.mockResolvedValue(mockCommands);

      // Act
      const result = await commandManager.getPendingCommands(implantId);

      // Assert
      expect(result).toEqual(mockCommands);
      expect(mockCommandRouter.getPendingCommands).toHaveBeenCalledWith(implantId);
    });
  });

  describe('getCommandStatus', () => {
    it('should get command status', async () => {
      // Arrange
      const commandId = 'test-command-1';
      mockCommandRepository.findById.mockResolvedValue(mockCommand);

      // Act
      const result = await commandManager.getCommandStatus(commandId);

      // Assert
      expect(result).toEqual(mockCommand);
      expect(mockCommandRepository.findById).toHaveBeenCalledWith(commandId);
    });
  });
});
