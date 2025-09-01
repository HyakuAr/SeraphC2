/**
 * Tests for RemoteDesktopService
 * Implements requirements 11.1, 11.2, 11.4 from the SeraphC2 specification
 */

import { RemoteDesktopService } from '../remote-desktop.service';
import { CommandManager } from '../../engine/command-manager';
import {
  MouseClickEvent,
  MouseMoveEvent,
  KeyboardEvent,
  RemoteDesktopConfig,
  CommandType,
  CommandStatus,
} from '../../../types/entities';

// Mock CommandManager
jest.mock('../../engine/command-manager');

describe('RemoteDesktopService', () => {
  let remoteDesktopService: RemoteDesktopService;
  let mockCommandManager: jest.Mocked<CommandManager>;

  const mockImplantId = 'test-implant-123';
  const mockOperatorId = 'test-operator-456';

  beforeEach(() => {
    // Create a mock command manager with required methods
    mockCommandManager = {
      executeCommand: jest.fn(),
      getCommandStatus: jest.fn(),
      stop: jest.fn(),
    } as any;

    remoteDesktopService = new RemoteDesktopService(mockCommandManager);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('sendMouseClick', () => {
    const mockMouseEvent: MouseClickEvent = {
      x: 100,
      y: 200,
      button: 'left',
      action: 'click',
      monitorId: 0,
    };

    it('should send mouse click command successfully', async () => {
      // Arrange
      const mockCommand = {
        id: 'cmd-123',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_CLICK,
        payload: JSON.stringify(mockMouseEvent),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Mouse click executed successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 100,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const result = await remoteDesktopService.sendMouseClick(
        mockImplantId,
        mockOperatorId,
        mockMouseEvent
      );

      // Assert
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_CLICK,
        payload: JSON.stringify(mockMouseEvent),
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Mouse click executed successfully');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle mouse click command failure', async () => {
      // Arrange
      const mockCommand = {
        id: 'cmd-123',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_CLICK,
        payload: JSON.stringify(mockMouseEvent),
        status: CommandStatus.FAILED,
        result: {
          stdout: '',
          stderr: 'Failed to execute mouse click',
          exitCode: 1,
          executionTime: 100,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const result = await remoteDesktopService.sendMouseClick(
        mockImplantId,
        mockOperatorId,
        mockMouseEvent
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to execute mouse click');
    });

    it('should validate mouse click event parameters', async () => {
      // Arrange
      const invalidMouseEvent: MouseClickEvent = {
        x: -10, // Invalid negative coordinate
        y: 200,
        button: 'left',
        action: 'click',
      };

      // Act & Assert
      await expect(
        remoteDesktopService.sendMouseClick(mockImplantId, mockOperatorId, invalidMouseEvent)
      ).rejects.toThrow('Mouse coordinates must be non-negative');
    });

    it('should validate mouse button parameter', async () => {
      // Arrange
      const invalidMouseEvent = {
        x: 100,
        y: 200,
        button: 'invalid' as any,
        action: 'click' as any,
      };

      // Act & Assert
      await expect(
        remoteDesktopService.sendMouseClick(mockImplantId, mockOperatorId, invalidMouseEvent)
      ).rejects.toThrow('Invalid mouse button. Must be left, right, or middle');
    });

    it('should validate mouse action parameter', async () => {
      // Arrange
      const invalidMouseEvent = {
        x: 100,
        y: 200,
        button: 'left' as any,
        action: 'invalid' as any,
      };

      // Act & Assert
      await expect(
        remoteDesktopService.sendMouseClick(mockImplantId, mockOperatorId, invalidMouseEvent)
      ).rejects.toThrow('Invalid mouse action. Must be down, up, click, or double_click');
    });
  });

  describe('sendMouseMove', () => {
    const mockMouseMoveEvent: MouseMoveEvent = {
      x: 150,
      y: 250,
      monitorId: 0,
    };

    it('should send mouse move command successfully', async () => {
      // Arrange
      const mockCommand = {
        id: 'cmd-124',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_MOVE,
        payload: JSON.stringify(mockMouseMoveEvent),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Mouse move executed successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 50,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const result = await remoteDesktopService.sendMouseMove(
        mockImplantId,
        mockOperatorId,
        mockMouseMoveEvent
      );

      // Assert
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_MOVE,
        payload: JSON.stringify(mockMouseMoveEvent),
        timeout: 3000,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Mouse move executed successfully');
    });

    it('should validate mouse move coordinates', async () => {
      // Arrange
      const invalidMouseMoveEvent: MouseMoveEvent = {
        x: 100,
        y: -50, // Invalid negative coordinate
      };

      // Act & Assert
      await expect(
        remoteDesktopService.sendMouseMove(mockImplantId, mockOperatorId, invalidMouseMoveEvent)
      ).rejects.toThrow('Mouse coordinates must be non-negative');
    });
  });

  describe('sendKeyboardInput', () => {
    const mockKeyboardEvent: KeyboardEvent = {
      key: 'Enter',
      action: 'press',
      modifiers: {
        ctrl: false,
        alt: false,
        shift: false,
        win: false,
      },
    };

    it('should send keyboard input command successfully', async () => {
      // Arrange
      const mockCommand = {
        id: 'cmd-125',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_KEY_INPUT,
        payload: JSON.stringify(mockKeyboardEvent),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Keyboard input executed successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 75,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const result = await remoteDesktopService.sendKeyboardInput(
        mockImplantId,
        mockOperatorId,
        mockKeyboardEvent
      );

      // Assert
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_KEY_INPUT,
        payload: JSON.stringify(mockKeyboardEvent),
        timeout: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Keyboard input executed successfully');
    });

    it('should validate keyboard event parameters', async () => {
      // Arrange
      const invalidKeyboardEvent: KeyboardEvent = {
        key: '', // Invalid empty key
        action: 'press',
      };

      // Act & Assert
      await expect(
        remoteDesktopService.sendKeyboardInput(mockImplantId, mockOperatorId, invalidKeyboardEvent)
      ).rejects.toThrow('Key must be specified');
    });

    it('should validate keyboard action parameter', async () => {
      // Arrange
      const invalidKeyboardEvent = {
        key: 'Enter',
        action: 'invalid' as any,
      };

      // Act & Assert
      await expect(
        remoteDesktopService.sendKeyboardInput(mockImplantId, mockOperatorId, invalidKeyboardEvent)
      ).rejects.toThrow('Invalid key action. Must be down, up, or press');
    });
  });

  describe('disableLocalInput', () => {
    it('should disable local input successfully', async () => {
      // Arrange
      const mockCommand = {
        id: 'cmd-126',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_DISABLE_INPUT,
        payload: '',
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Local input disabled successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 200,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const result = await remoteDesktopService.disableLocalInput(mockImplantId, mockOperatorId);

      // Assert
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_DISABLE_INPUT,
        payload: '',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local input disabled successfully');
    });
  });

  describe('enableLocalInput', () => {
    it('should enable local input successfully', async () => {
      // Arrange
      const mockCommand = {
        id: 'cmd-127',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_ENABLE_INPUT,
        payload: '',
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Local input enabled successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 150,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      // Act
      const result = await remoteDesktopService.enableLocalInput(mockImplantId, mockOperatorId);

      // Assert
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_ENABLE_INPUT,
        payload: '',
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Local input enabled successfully');
    });
  });

  describe('initializeRemoteDesktop', () => {
    const mockConfig: RemoteDesktopConfig = {
      enableMouseInput: true,
      enableKeyboardInput: true,
      disableLocalInput: false,
      mouseSensitivity: 1.0,
      keyboardLayout: 'en-US',
    };

    it('should initialize remote desktop session successfully', async () => {
      // Act
      const result = await remoteDesktopService.initializeRemoteDesktop(
        mockImplantId,
        mockOperatorId,
        mockConfig
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Remote desktop session initialized successfully');
      expect(result.config).toEqual(mockConfig);

      // Check that desktop status is tracked
      const status = remoteDesktopService.getRemoteDesktopStatus(mockImplantId);
      expect(status).toBeTruthy();
      expect(status?.isActive).toBe(true);
      expect(status?.config).toEqual(mockConfig);
    });

    it('should validate remote desktop configuration', async () => {
      // Arrange
      const invalidConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 3.0, // Invalid sensitivity > 2.0
      };

      // Act & Assert
      await expect(
        remoteDesktopService.initializeRemoteDesktop(mockImplantId, mockOperatorId, invalidConfig)
      ).rejects.toThrow('Mouse sensitivity must be between 0.1 and 2.0');
    });
  });

  describe('terminateRemoteDesktop', () => {
    it('should terminate remote desktop session successfully', async () => {
      // Arrange - Initialize a session first
      const mockConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 1.0,
      };

      await remoteDesktopService.initializeRemoteDesktop(mockImplantId, mockOperatorId, mockConfig);

      // Act
      const result = await remoteDesktopService.terminateRemoteDesktop(
        mockImplantId,
        mockOperatorId
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe('Remote desktop session terminated successfully');

      // Check that desktop status is removed
      const status = remoteDesktopService.getRemoteDesktopStatus(mockImplantId);
      expect(status).toBeNull();
    });
  });

  describe('getRemoteDesktopStatus', () => {
    it('should return null for non-existent session', () => {
      // Act
      const status = remoteDesktopService.getRemoteDesktopStatus('non-existent-implant');

      // Assert
      expect(status).toBeNull();
    });

    it('should return status for active session', async () => {
      // Arrange
      const mockConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 1.5,
      };

      await remoteDesktopService.initializeRemoteDesktop(mockImplantId, mockOperatorId, mockConfig);

      // Act
      const status = remoteDesktopService.getRemoteDesktopStatus(mockImplantId);

      // Assert
      expect(status).toBeTruthy();
      expect(status?.isActive).toBe(true);
      expect(status?.mouseInputEnabled).toBe(true);
      expect(status?.keyboardInputEnabled).toBe(true);
      expect(status?.localInputDisabled).toBe(false);
      expect(status?.config.mouseSensitivity).toBe(1.5);
      expect(status?.inputCount).toBe(0);
    });
  });

  describe('getAllActiveDesktops', () => {
    it('should return empty map when no sessions are active', () => {
      // Act
      const activeDesktops = remoteDesktopService.getAllActiveDesktops();

      // Assert
      expect(activeDesktops.size).toBe(0);
    });

    it('should return all active desktop sessions', async () => {
      // Arrange
      const mockConfig1: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 1.0,
      };

      const mockConfig2: RemoteDesktopConfig = {
        enableMouseInput: false,
        enableKeyboardInput: true,
        disableLocalInput: true,
        mouseSensitivity: 1.5,
      };

      const implantId1 = 'implant-1';
      const implantId2 = 'implant-2';

      await remoteDesktopService.initializeRemoteDesktop(implantId1, mockOperatorId, mockConfig1);
      await remoteDesktopService.initializeRemoteDesktop(implantId2, mockOperatorId, mockConfig2);

      // Act
      const activeDesktops = remoteDesktopService.getAllActiveDesktops();

      // Assert
      expect(activeDesktops.size).toBe(2);
      expect(activeDesktops.has(implantId1)).toBe(true);
      expect(activeDesktops.has(implantId2)).toBe(true);

      const status1 = activeDesktops.get(implantId1);
      const status2 = activeDesktops.get(implantId2);

      expect(status1?.config.mouseSensitivity).toBe(1.0);
      expect(status2?.config.mouseSensitivity).toBe(1.5);
      expect(status1?.mouseInputEnabled).toBe(true);
      expect(status2?.mouseInputEnabled).toBe(false);
    });
  });

  describe('event emission', () => {
    it('should emit mouseClick event on successful mouse click', async () => {
      // Arrange
      const mockMouseEvent: MouseClickEvent = {
        x: 100,
        y: 200,
        button: 'left',
        action: 'click',
      };

      const mockCommand = {
        id: 'cmd-123',
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_CLICK,
        payload: JSON.stringify(mockMouseEvent),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Mouse click executed successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 100,
        },
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const eventSpy = jest.fn();
      remoteDesktopService.on('mouseClick', eventSpy);

      // Act
      await remoteDesktopService.sendMouseClick(mockImplantId, mockOperatorId, mockMouseEvent);

      // Assert
      expect(eventSpy).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        mouseEvent: mockMouseEvent,
        success: true,
      });
    });

    it('should emit remoteDesktopInitialized event on initialization', async () => {
      // Arrange
      const mockConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 1.0,
      };

      const eventSpy = jest.fn();
      remoteDesktopService.on('remoteDesktopInitialized', eventSpy);

      // Act
      await remoteDesktopService.initializeRemoteDesktop(mockImplantId, mockOperatorId, mockConfig);

      // Assert
      expect(eventSpy).toHaveBeenCalledWith({
        implantId: mockImplantId,
        operatorId: mockOperatorId,
        config: mockConfig,
      });
    });
  });
});
