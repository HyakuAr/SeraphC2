/**
 * CommandService tests
 */

import { CommandService } from '../commandService';
import { apiClient } from '../apiClient';

// Mock apiClient
jest.mock('../apiClient');

describe('CommandService', () => {
  const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

  const mockCommand = {
    id: 'test-command-1',
    implantId: 'test-implant-1',
    operatorId: 'test-operator-1',
    type: 'shell',
    payload: 'whoami',
    timestamp: '2023-01-01T00:00:00.000Z',
    status: 'completed',
    result: {
      stdout: 'test-user',
      stderr: '',
      exitCode: 0,
      executionTime: 1000,
    },
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  };

  const mockProgress = {
    commandId: 'test-command-1',
    status: 'executing',
    progress: 50,
    message: 'Command executing...',
    timestamp: '2023-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCommand', () => {
    it('should execute a generic command', async () => {
      // Arrange
      const request = {
        implantId: 'test-implant-1',
        type: 'shell',
        payload: 'whoami',
        timeout: 30000,
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: mockCommand },
      });

      // Act
      const result = await CommandService.executeCommand(request);

      // Assert
      expect(result).toEqual(mockCommand);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/commands/execute', request);
    });
  });

  describe('executeShellCommand', () => {
    it('should execute a shell command', async () => {
      // Arrange
      const request = {
        implantId: 'test-implant-1',
        command: 'dir',
        timeout: 30000,
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: mockCommand },
      });

      // Act
      const result = await CommandService.executeShellCommand(request);

      // Assert
      expect(result).toEqual(mockCommand);
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/commands/shell', request);
    });
  });

  describe('executePowerShellCommand', () => {
    it('should execute a PowerShell command', async () => {
      // Arrange
      const request = {
        implantId: 'test-implant-1',
        command: 'Get-Process',
        timeout: 30000,
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: { ...mockCommand, type: 'powershell' } },
      });

      // Act
      const result = await CommandService.executePowerShellCommand(request);

      // Assert
      expect(result).toEqual({ ...mockCommand, type: 'powershell' });
      expect(mockApiClient.post).toHaveBeenCalledWith('/api/commands/powershell', request);
    });
  });

  describe('cancelCommand', () => {
    it('should cancel a command', async () => {
      // Arrange
      const commandId = 'test-command-1';

      mockApiClient.post.mockResolvedValue({
        data: { success: true },
      });

      // Act
      await CommandService.cancelCommand(commandId);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(`/api/commands/${commandId}/cancel`);
    });
  });

  describe('getCommandStatus', () => {
    it('should get command status', async () => {
      // Arrange
      const commandId = 'test-command-1';

      mockApiClient.get.mockResolvedValue({
        data: { data: mockCommand },
      });

      // Act
      const result = await CommandService.getCommandStatus(commandId);

      // Assert
      expect(result).toEqual(mockCommand);
      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/commands/${commandId}`);
    });
  });

  describe('getCommandHistory', () => {
    it('should get command history with default parameters', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const mockCommands = [mockCommand];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockCommands },
      });

      // Act
      const result = await CommandService.getCommandHistory(implantId);

      // Assert
      expect(result).toEqual(mockCommands);
      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/commands/history/${implantId}?`);
    });

    it('should get command history with filter parameters', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const filter = {
        limit: 20,
        offset: 10,
        type: 'shell',
        status: 'completed',
      };
      const mockCommands = [mockCommand];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockCommands },
      });

      // Act
      const result = await CommandService.getCommandHistory(implantId, filter);

      // Assert
      expect(result).toEqual(mockCommands);
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/api/commands/history/${implantId}?limit=20&offset=10&type=shell&status=completed`
      );
    });
  });

  describe('getPendingCommands', () => {
    it('should get pending commands', async () => {
      // Arrange
      const implantId = 'test-implant-1';
      const mockCommands = [{ ...mockCommand, status: 'pending' }];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockCommands },
      });

      // Act
      const result = await CommandService.getPendingCommands(implantId);

      // Assert
      expect(result).toEqual(mockCommands);
      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/commands/pending/${implantId}`);
    });
  });

  describe('getActiveCommands', () => {
    it('should get active commands', async () => {
      // Arrange
      const mockActiveCommands = [mockProgress];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockActiveCommands },
      });

      // Act
      const result = await CommandService.getActiveCommands();

      // Assert
      expect(result).toEqual(mockActiveCommands);
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/commands/active');
    });
  });

  describe('getCommandProgress', () => {
    it('should get command progress', async () => {
      // Arrange
      const commandId = 'test-command-1';

      mockApiClient.get.mockResolvedValue({
        data: { data: mockProgress },
      });

      // Act
      const result = await CommandService.getCommandProgress(commandId);

      // Assert
      expect(result).toEqual(mockProgress);
      expect(mockApiClient.get).toHaveBeenCalledWith(`/api/commands/progress/${commandId}`);
    });
  });
});
