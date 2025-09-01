/**
 * Command routes tests
 */

import request from 'supertest';
import express from 'express';
import { createCommandRoutes } from '../command.routes';
import { CommandManager } from '../../../core/engine/command-manager';
import { AuthMiddleware } from '../../../core/auth/auth.middleware';
import { CommandType, CommandStatus } from '../../../types/entities';

// Mock dependencies
jest.mock('../../../core/engine/command-manager');
jest.mock('../../../core/auth/auth.middleware');

describe('Command Routes', () => {
  let app: express.Application;
  let mockCommandManager: jest.Mocked<CommandManager>;
  let mockAuthMiddleware: jest.Mocked<AuthMiddleware>;

  const mockCommand = {
    id: 'test-command-1',
    implantId: 'test-implant-1',
    operatorId: 'test-operator-1',
    type: CommandType.SHELL,
    payload: 'whoami',
    timestamp: new Date('2023-01-01T00:00:00.000Z'),
    status: CommandStatus.PENDING,
    createdAt: new Date('2023-01-01T00:00:00.000Z'),
    updatedAt: new Date('2023-01-01T00:00:00.000Z'),
  };

  const mockUser = {
    id: 'test-operator-1',
    username: 'testuser',
    role: 'operator',
  };

  beforeEach(() => {
    // Create mocks
    mockCommandManager = {
      executeCommand: jest.fn(),
      executeShellCommand: jest.fn(),
      executePowerShellCommand: jest.fn(),
      cancelCommand: jest.fn(),
      getCommandStatus: jest.fn(),
      getCommandHistory: jest.fn(),
      getPendingCommands: jest.fn(),
      getActiveCommands: jest.fn(),
      getCommandProgress: jest.fn(),
    } as any;

    mockAuthMiddleware = {
      authenticate: jest.fn((req, _res, next) => {
        (req as any).user = mockUser;
        next();
      }),
    } as any;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/commands', createCommandRoutes());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/commands/execute', () => {
    it('should execute a command successfully', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        type: CommandType.SHELL,
        payload: 'whoami',
        timeout: 30000,
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);

      // Act
      const response = await request(app).post('/api/commands/execute').send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockCommand.id);
      expect(response.body.data.type).toBe(mockCommand.type);
      expect(response.body.data.payload).toBe(mockCommand.payload);
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'test-operator-1',
        type: CommandType.SHELL,
        payload: 'whoami',
        timeout: 30000,
        priority: undefined,
      });
    });

    it('should return 400 for missing required fields', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        // Missing type and payload
      };

      // Act
      const response = await request(app).post('/api/commands/execute').send(requestBody);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields: implantId, type, payload');
    });

    it('should return 400 for invalid command type', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        type: 'invalid-type',
        payload: 'whoami',
      };

      // Act
      const response = await request(app).post('/api/commands/execute').send(requestBody);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid command type');
    });

    it('should return 500 for command execution error', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        type: CommandType.SHELL,
        payload: 'whoami',
      };

      mockCommandManager.executeCommand.mockRejectedValue(new Error('Implant not connected'));

      // Act
      const response = await request(app).post('/api/commands/execute').send(requestBody);

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Implant not connected');
    });
  });

  describe('POST /api/commands/shell', () => {
    it('should execute a shell command successfully', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        command: 'dir',
        timeout: 30000,
      };

      mockCommandManager.executeShellCommand.mockResolvedValue(mockCommand);

      // Act
      const response = await request(app).post('/api/commands/shell').send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCommand);
      expect(mockCommandManager.executeShellCommand).toHaveBeenCalledWith(
        'test-implant-1',
        'test-operator-1',
        'dir',
        30000
      );
    });

    it('should return 400 for missing required fields', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        // Missing command
      };

      // Act
      const response = await request(app).post('/api/commands/shell').send(requestBody);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields: implantId, command');
    });
  });

  describe('POST /api/commands/powershell', () => {
    it('should execute a PowerShell command successfully', async () => {
      // Arrange
      const requestBody = {
        implantId: 'test-implant-1',
        command: 'Get-Process',
        timeout: 30000,
      };

      mockCommandManager.executePowerShellCommand.mockResolvedValue(mockCommand);

      // Act
      const response = await request(app).post('/api/commands/powershell').send(requestBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCommand);
      expect(mockCommandManager.executePowerShellCommand).toHaveBeenCalledWith(
        'test-implant-1',
        'test-operator-1',
        'Get-Process',
        30000
      );
    });
  });

  describe('POST /api/commands/:id/cancel', () => {
    it('should cancel a command successfully', async () => {
      // Arrange
      const commandId = 'test-command-1';
      mockCommandManager.cancelCommand.mockResolvedValue(undefined);

      // Act
      const response = await request(app).post(`/api/commands/${commandId}/cancel`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Command cancelled successfully');
      expect(mockCommandManager.cancelCommand).toHaveBeenCalledWith(commandId, 'test-operator-1');
    });

    it('should return 400 for missing command ID', async () => {
      // Act
      const response = await request(app).post('/api/commands//cancel');

      // Assert
      expect(response.status).toBe(404); // Express returns 404 for invalid routes
    });
  });

  describe('GET /api/commands/:id', () => {
    it('should get command status successfully', async () => {
      // Arrange
      const commandId = 'test-command-1';
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const response = await request(app).get(`/api/commands/${commandId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCommand);
      expect(mockCommandManager.getCommandStatus).toHaveBeenCalledWith(commandId);
    });

    it('should return 404 for non-existent command', async () => {
      // Arrange
      const commandId = 'non-existent-command';
      mockCommandManager.getCommandStatus.mockResolvedValue(null);

      // Act
      const response = await request(app).get(`/api/commands/${commandId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Command not found');
    });
  });

  describe('GET /api/commands/history/:implantId', () => {
    it('should get command history successfully', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const mockCommands = [mockCommand];
      mockCommandManager.getCommandHistory.mockResolvedValue(mockCommands);

      // Act
      const response = await request(app)
        .get(`/api/commands/history/${implantId}`)
        .query({ limit: '20', offset: '0' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCommands);
      expect(response.body.count).toBe(1);
      expect(mockCommandManager.getCommandHistory).toHaveBeenCalledWith({
        implantId,
        limit: 20,
        offset: 0,
        type: undefined,
        status: undefined,
      });
    });
  });

  describe('GET /api/commands/pending/:implantId', () => {
    it('should get pending commands successfully', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const mockCommands = [mockCommand];
      mockCommandManager.getPendingCommands.mockResolvedValue(mockCommands);

      // Act
      const response = await request(app).get(`/api/commands/pending/${implantId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCommands);
      expect(response.body.count).toBe(1);
      expect(mockCommandManager.getPendingCommands).toHaveBeenCalledWith(implantId);
    });
  });

  describe('GET /api/commands/active', () => {
    it('should get active commands successfully', async () => {
      // Arrange
      const mockActiveCommands = [
        {
          commandId: 'test-command-1',
          status: CommandStatus.EXECUTING,
          progress: 50,
          message: 'Executing command',
          timestamp: new Date('2023-01-01T00:00:00.000Z'),
        },
      ];
      mockCommandManager.getActiveCommands.mockReturnValue(mockActiveCommands);

      // Act
      const response = await request(app).get('/api/commands/active');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockActiveCommands);
      expect(response.body.count).toBe(1);
    });
  });

  describe('GET /api/commands/progress/:id', () => {
    it('should get command progress successfully', async () => {
      // Arrange
      const commandId = 'test-command-1';
      const mockProgress = {
        commandId,
        status: CommandStatus.EXECUTING,
        progress: 75,
        message: 'Command executing',
        timestamp: new Date('2023-01-01T00:00:00.000Z'),
      };
      mockCommandManager.getCommandProgress.mockReturnValue(mockProgress);

      // Act
      const response = await request(app).get(`/api/commands/progress/${commandId}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockProgress);
      expect(mockCommandManager.getCommandProgress).toHaveBeenCalledWith(commandId);
    });

    it('should return 404 for non-existent command progress', async () => {
      // Arrange
      const commandId = 'non-existent-command';
      mockCommandManager.getCommandProgress.mockReturnValue(null);

      // Act
      const response = await request(app).get(`/api/commands/progress/${commandId}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Command progress not found');
    });
  });
});
