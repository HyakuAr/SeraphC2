/**
 * Tests for ScreenService
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
 */

import { ScreenService } from '../screen.service';
import { CommandManager } from '../../engine/command-manager';
import { Command, CommandType, CommandStatus, ScreenStreamConfig } from '../../../types/entities';

// Mock CommandManager
const mockCommandManager = {
  executeCommand: jest.fn(),
  getCommandStatus: jest.fn(),
} as unknown as jest.Mocked<CommandManager>;

describe('ScreenService', () => {
  let screenService: ScreenService;

  beforeEach(() => {
    jest.clearAllMocks();
    screenService = new ScreenService(mockCommandManager);
  });

  describe('getMonitors', () => {
    it('should get monitor list successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_MONITORS,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: JSON.stringify([
            {
              Id: 0,
              Name: 'Monitor 0',
              IsPrimary: true,
              Width: 1920,
              Height: 1080,
              X: 0,
              Y: 0,
              WorkingAreaWidth: 1920,
              WorkingAreaHeight: 1040,
              WorkingAreaX: 0,
              WorkingAreaY: 40,
              BitsPerPixel: 32,
            },
            {
              Id: 1,
              Name: 'Monitor 1',
              IsPrimary: false,
              Width: 1280,
              Height: 1024,
              X: 1920,
              Y: 0,
              WorkingAreaWidth: 1280,
              WorkingAreaHeight: 984,
              WorkingAreaX: 1920,
              WorkingAreaY: 40,
              BitsPerPixel: 32,
            },
          ]),
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await screenService.getMonitors('implant-1', 'operator-1');

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_MONITORS,
        payload: '',
        timeout: 15000,
      });

      expect(result.monitors).toHaveLength(2);
      expect(result.monitors[0]).toEqual({
        id: 0,
        name: 'Monitor 0',
        isPrimary: true,
        width: 1920,
        height: 1080,
        x: 0,
        y: 0,
        workingAreaWidth: 1920,
        workingAreaHeight: 1040,
        workingAreaX: 0,
        workingAreaY: 40,
        bitsPerPixel: 32,
      });
      expect(result.totalCount).toBe(2);
    });

    it('should handle monitor list failure', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_MONITORS,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.FAILED,
        result: {
          stdout: '',
          stderr: 'Failed to get monitors',
          exitCode: 1,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      await expect(screenService.getMonitors('implant-1', 'operator-1')).rejects.toThrow(
        'Failed to get monitor information from implant'
      );
    });
  });

  describe('takeScreenshot', () => {
    it('should take screenshot successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREENSHOT,
        payload: JSON.stringify({
          monitorId: 0,
          quality: 75,
          captureMouseCursor: true,
        }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: JSON.stringify({
            monitorId: 0,
            width: 1920,
            height: 1080,
            imageData: 'base64encodedimage',
            size: 123456,
            timestamp: new Date().toISOString(),
            capturedMouseCursor: true,
          }),
          stderr: '',
          exitCode: 0,
          executionTime: 2000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await screenService.takeScreenshot('implant-1', 'operator-1', {
        implantId: 'implant-1',
        monitorId: 0,
        quality: 75,
        captureMouseCursor: true,
      });

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREENSHOT,
        payload: JSON.stringify({
          monitorId: 0,
          quality: 75,
          width: undefined,
          height: undefined,
          captureMouseCursor: true,
        }),
        timeout: 30000,
      });

      expect(result.monitorId).toBe(0);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.imageData).toBe('base64encodedimage');
      expect(result.size).toBe(123456);
      expect(result.capturedMouseCursor).toBe(true);
    });

    it('should handle screenshot failure', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREENSHOT,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.FAILED,
        result: {
          stdout: '',
          stderr: 'Screenshot failed',
          exitCode: 1,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      await expect(
        screenService.takeScreenshot('implant-1', 'operator-1', {
          implantId: 'implant-1',
        })
      ).rejects.toThrow('Failed to take screenshot from implant');
    });
  });

  describe('startScreenStream', () => {
    it('should start screen stream successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_START,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Screen stream started successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const config: ScreenStreamConfig = {
        monitorId: 0,
        quality: 75,
        frameRate: 10,
        captureMouseCursor: true,
      };

      const result = await screenService.startScreenStream('implant-1', 'operator-1', config);

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_START,
        payload: JSON.stringify(config),
        timeout: 15000,
      });

      expect(result.success).toBe(true);
      expect(result.streamId).toBeDefined();
      expect(result.config).toEqual(config);
    });

    it('should validate stream config', async () => {
      const invalidConfig: ScreenStreamConfig = {
        quality: 150, // Invalid quality
        frameRate: 50, // Invalid frame rate
        captureMouseCursor: true,
      };

      await expect(
        screenService.startScreenStream('implant-1', 'operator-1', invalidConfig)
      ).rejects.toThrow('Quality must be between 1 and 100');
    });

    it('should validate frame rate', async () => {
      const invalidConfig: ScreenStreamConfig = {
        quality: 75,
        frameRate: 50, // Invalid frame rate
        captureMouseCursor: true,
      };

      await expect(
        screenService.startScreenStream('implant-1', 'operator-1', invalidConfig)
      ).rejects.toThrow('Frame rate must be between 1 and 30 FPS');
    });
  });

  describe('stopScreenStream', () => {
    it('should stop screen stream successfully', async () => {
      // First start a stream
      const startCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_START,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Screen stream started successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const stopCommand: Command = {
        id: 'cmd-2',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_STOP,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Screen stream stopped successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand
        .mockResolvedValueOnce(startCommand)
        .mockResolvedValueOnce(stopCommand);
      mockCommandManager.getCommandStatus
        .mockResolvedValueOnce(startCommand)
        .mockResolvedValueOnce(stopCommand);

      // Start stream first
      await screenService.startScreenStream('implant-1', 'operator-1', {
        quality: 75,
        frameRate: 5,
        captureMouseCursor: true,
      });

      // Then stop it
      const result = await screenService.stopScreenStream('implant-1', 'operator-1');

      expect(result.success).toBe(true);
      expect(result.streamId).toBeDefined();
    });
  });

  describe('updateStreamConfig', () => {
    it('should update stream config successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_CONFIG,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Screen stream configuration updated successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const configUpdate = { quality: 90, frameRate: 15 };

      const result = await screenService.updateStreamConfig(
        'implant-1',
        'operator-1',
        configUpdate
      );

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_CONFIG,
        payload: JSON.stringify(configUpdate),
        timeout: 15000,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getStreamStatus', () => {
    it('should return null for non-existent stream', () => {
      const status = screenService.getStreamStatus('non-existent-implant');
      expect(status).toBeNull();
    });

    it('should return stream status for active stream', async () => {
      // Start a stream first
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_START,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Screen stream started successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      await screenService.startScreenStream('implant-1', 'operator-1', {
        quality: 75,
        frameRate: 5,
        captureMouseCursor: true,
      });

      const status = screenService.getStreamStatus('implant-1');
      expect(status).toBeDefined();
      expect(status?.isActive).toBe(true);
      expect(status?.config.quality).toBe(75);
    });
  });

  describe('processScreenFrame', () => {
    it('should process screen frame and update statistics', async () => {
      // Start a stream first
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SCREEN_STREAM_START,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Screen stream started successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      await screenService.startScreenStream('implant-1', 'operator-1', {
        quality: 75,
        frameRate: 5,
        captureMouseCursor: true,
      });

      const frameData = {
        frameId: 1,
        timestamp: new Date(),
        monitorId: 0,
        width: 1920,
        height: 1080,
        imageData: 'base64encodedimage',
        size: 50000,
      };

      const eventSpy = jest.fn();
      screenService.on('screenFrame', eventSpy);

      screenService.processScreenFrame('implant-1', frameData);

      expect(eventSpy).toHaveBeenCalledWith({
        implantId: 'implant-1',
        frameData,
      });

      const status = screenService.getStreamStatus('implant-1');
      expect(status?.frameCount).toBe(1);
      expect(status?.totalDataSent).toBe(50000);
      expect(status?.averageFrameSize).toBe(50000);
    });
  });
});
