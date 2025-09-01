/**
 * Tests for RemoteDesktopService (client-side)
 * Implements requirements 11.1, 11.2, 11.4 from the SeraphC2 specification
 */

import remoteDesktopService, {
  MouseClickEvent,
  MouseMoveEvent,
  KeyboardEvent,
  RemoteDesktopConfig,
} from '../remoteDesktopService';
import { apiClient } from '../apiClient';

// Mock apiClient
jest.mock('../apiClient');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('RemoteDesktopService', () => {
  const mockImplantId = 'test-implant-123';

  beforeEach(() => {
    jest.clearAllMocks();
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
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Remote desktop session initialized successfully',
            config: mockConfig,
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.initializeRemoteDesktop(mockImplantId, mockConfig);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/initialize`,
        mockConfig
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Remote desktop session initialized successfully');
      expect(result.config).toEqual(mockConfig);
    });

    it('should handle initialization errors', async () => {
      // Arrange
      mockApiClient.post.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(
        remoteDesktopService.initializeRemoteDesktop(mockImplantId, mockConfig)
      ).rejects.toThrow('Failed to initialize remote desktop session');
    });
  });

  describe('terminateRemoteDesktop', () => {
    it('should terminate remote desktop session successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Remote desktop session terminated successfully',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.terminateRemoteDesktop(mockImplantId);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/terminate`
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Remote desktop session terminated successfully');
    });
  });

  describe('sendMouseClick', () => {
    const mockMouseEvent: MouseClickEvent = {
      x: 100,
      y: 200,
      button: 'left',
      action: 'click',
      monitorId: 0,
    };

    it('should send mouse click event successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Mouse click executed successfully',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.sendMouseClick(mockImplantId, mockMouseEvent);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/mouse/click`,
        mockMouseEvent
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Mouse click executed successfully');
    });

    it('should handle mouse click errors', async () => {
      // Arrange
      mockApiClient.post.mockRejectedValue(new Error('Command failed'));

      // Act & Assert
      await expect(
        remoteDesktopService.sendMouseClick(mockImplantId, mockMouseEvent)
      ).rejects.toThrow('Failed to send mouse click event');
    });
  });

  describe('sendMouseMove', () => {
    const mockMouseMoveEvent: MouseMoveEvent = {
      x: 150,
      y: 250,
      monitorId: 0,
    };

    it('should send mouse move event successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Mouse move executed successfully',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.sendMouseMove(mockImplantId, mockMouseMoveEvent);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/mouse/move`,
        mockMouseMoveEvent
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Mouse move executed successfully');
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

    it('should send keyboard input event successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Keyboard input executed successfully',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.sendKeyboardInput(mockImplantId, mockKeyboardEvent);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/keyboard/input`,
        mockKeyboardEvent
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Keyboard input executed successfully');
    });
  });

  describe('disableLocalInput', () => {
    it('should disable local input successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Local input disabled successfully',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.disableLocalInput(mockImplantId);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/input/disable`
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Local input disabled successfully');
    });
  });

  describe('enableLocalInput', () => {
    it('should enable local input successfully', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: {
            success: true,
            message: 'Local input enabled successfully',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.enableLocalInput(mockImplantId);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/input/enable`
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Local input enabled successfully');
    });
  });

  describe('getRemoteDesktopStatus', () => {
    it('should get remote desktop status successfully', async () => {
      // Arrange
      const mockStatus = {
        isActive: true,
        mouseInputEnabled: true,
        keyboardInputEnabled: true,
        localInputDisabled: false,
        config: {
          enableMouseInput: true,
          enableKeyboardInput: true,
          disableLocalInput: false,
          mouseSensitivity: 1.0,
        },
        inputCount: 5,
        lastInputTime: new Date().toISOString(),
      };

      const mockResponse = {
        data: {
          data: mockStatus,
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.getRemoteDesktopStatus(mockImplantId);

      // Assert
      expect(mockApiClient.get).toHaveBeenCalledWith(
        `/api/remote-desktop/implants/${mockImplantId}/status`
      );
      expect(result).toEqual(mockStatus);
    });

    it('should return null for non-existent session', async () => {
      // Arrange
      const mockResponse = {
        data: {
          data: null,
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.getRemoteDesktopStatus(mockImplantId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getActiveRemoteDesktopSessions', () => {
    it('should get all active sessions successfully', async () => {
      // Arrange
      const mockSessions = {
        sessions: [
          {
            implantId: 'implant-1',
            isActive: true,
            mouseInputEnabled: true,
            keyboardInputEnabled: true,
            localInputDisabled: false,
            config: {
              enableMouseInput: true,
              enableKeyboardInput: true,
              disableLocalInput: false,
              mouseSensitivity: 1.0,
            },
            inputCount: 3,
          },
          {
            implantId: 'implant-2',
            isActive: true,
            mouseInputEnabled: false,
            keyboardInputEnabled: true,
            localInputDisabled: true,
            config: {
              enableMouseInput: false,
              enableKeyboardInput: true,
              disableLocalInput: true,
              mouseSensitivity: 1.5,
            },
            inputCount: 7,
          },
        ],
        totalCount: 2,
      };

      const mockResponse = {
        data: {
          data: mockSessions,
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await remoteDesktopService.getActiveRemoteDesktopSessions();

      // Assert
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/remote-desktop/sessions/active');
      expect(result).toEqual(mockSessions);
      expect(result.sessions).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });
  });

  describe('convertDOMMouseEvent', () => {
    it('should convert DOM mouse event to remote desktop mouse event', () => {
      // Arrange
      const mockImageElement = {
        getBoundingClientRect: () => ({
          left: 10,
          top: 20,
          width: 400,
          height: 300,
        }),
        naturalWidth: 800,
        naturalHeight: 600,
      } as HTMLImageElement;

      const mockDOMEvent = {
        clientX: 110, // 10 + 100
        clientY: 120, // 20 + 100
        button: 0, // Left button
      } as React.MouseEvent;

      // Act
      const result = remoteDesktopService.convertDOMMouseEvent(
        mockDOMEvent,
        mockImageElement,
        'click',
        0
      );

      // Assert
      expect(result.x).toBe(200); // (110 - 10) * (800 / 400) = 200
      expect(result.y).toBe(200); // (120 - 20) * (600 / 300) = 200
      expect(result.button).toBe('left');
      expect(result.action).toBe('click');
      expect(result.monitorId).toBe(0);
    });

    it('should handle different mouse buttons', () => {
      // Arrange
      const mockImageElement = {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        naturalWidth: 100,
        naturalHeight: 100,
      } as HTMLImageElement;

      const rightClickEvent = {
        clientX: 50,
        clientY: 50,
        button: 2, // Right button
      } as React.MouseEvent;

      const middleClickEvent = {
        clientX: 50,
        clientY: 50,
        button: 1, // Middle button
      } as React.MouseEvent;

      // Act
      const rightResult = remoteDesktopService.convertDOMMouseEvent(
        rightClickEvent,
        mockImageElement
      );
      const middleResult = remoteDesktopService.convertDOMMouseEvent(
        middleClickEvent,
        mockImageElement
      );

      // Assert
      expect(rightResult.button).toBe('right');
      expect(middleResult.button).toBe('middle');
    });
  });

  describe('convertDOMMouseMoveEvent', () => {
    it('should convert DOM mouse move event to remote desktop mouse move event', () => {
      // Arrange
      const mockImageElement = {
        getBoundingClientRect: () => ({
          left: 5,
          top: 10,
          width: 200,
          height: 150,
        }),
        naturalWidth: 400,
        naturalHeight: 300,
      } as HTMLImageElement;

      const mockDOMEvent = {
        clientX: 55, // 5 + 50
        clientY: 60, // 10 + 50
      } as React.MouseEvent;

      // Act
      const result = remoteDesktopService.convertDOMMouseMoveEvent(
        mockDOMEvent,
        mockImageElement,
        1
      );

      // Assert
      expect(result.x).toBe(100); // (55 - 5) * (400 / 200) = 100
      expect(result.y).toBe(100); // (60 - 10) * (300 / 150) = 100
      expect(result.monitorId).toBe(1);
    });
  });

  describe('convertDOMKeyboardEvent', () => {
    it('should convert DOM keyboard event to remote desktop keyboard event', () => {
      // Arrange
      const mockDOMEvent = {
        key: 'Enter',
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      } as React.KeyboardEvent;

      // Act
      const result = remoteDesktopService.convertDOMKeyboardEvent(mockDOMEvent, 'press');

      // Assert
      expect(result.key).toBe('Enter');
      expect(result.action).toBe('press');
      expect(result.modifiers?.ctrl).toBe(true);
      expect(result.modifiers?.alt).toBe(false);
      expect(result.modifiers?.shift).toBe(true);
      expect(result.modifiers?.win).toBe(false);
    });
  });

  describe('validateRemoteDesktopConfig', () => {
    it('should return no errors for valid configuration', () => {
      // Arrange
      const validConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 1.0,
      };

      // Act
      const errors = remoteDesktopService.validateRemoteDesktopConfig(validConfig);

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return error for invalid mouse sensitivity', () => {
      // Arrange
      const invalidConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 3.0, // Invalid: > 2.0
      };

      // Act
      const errors = remoteDesktopService.validateRemoteDesktopConfig(invalidConfig);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe('Mouse sensitivity must be between 0.1 and 2.0');
    });

    it('should return error for mouse sensitivity too low', () => {
      // Arrange
      const invalidConfig: RemoteDesktopConfig = {
        enableMouseInput: true,
        enableKeyboardInput: true,
        disableLocalInput: false,
        mouseSensitivity: 0.05, // Invalid: < 0.1
      };

      // Act
      const errors = remoteDesktopService.validateRemoteDesktopConfig(invalidConfig);

      // Assert
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe('Mouse sensitivity must be between 0.1 and 2.0');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      // Act
      const config = remoteDesktopService.getDefaultConfig();

      // Assert
      expect(config.enableMouseInput).toBe(true);
      expect(config.enableKeyboardInput).toBe(true);
      expect(config.disableLocalInput).toBe(false);
      expect(config.mouseSensitivity).toBe(1.0);
      expect(config.keyboardLayout).toBe('en-US');
    });
  });

  describe('formatInputCount', () => {
    it('should format input counts correctly', () => {
      expect(remoteDesktopService.formatInputCount(0)).toBe('No inputs');
      expect(remoteDesktopService.formatInputCount(1)).toBe('1 input');
      expect(remoteDesktopService.formatInputCount(42)).toBe('42 inputs');
      expect(remoteDesktopService.formatInputCount(1500)).toBe('1.5K inputs');
      expect(remoteDesktopService.formatInputCount(1500000)).toBe('1.5M inputs');
    });
  });

  describe('formatLastInputTime', () => {
    it('should format last input time correctly', () => {
      expect(remoteDesktopService.formatLastInputTime()).toBe('Never');

      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);
      const twoMinutesAgo = new Date(now.getTime() - 120000);
      const threeHoursAgo = new Date(now.getTime() - 10800000);

      expect(remoteDesktopService.formatLastInputTime(fiveSecondsAgo)).toBe('5s ago');
      expect(remoteDesktopService.formatLastInputTime(twoMinutesAgo)).toBe('2m ago');
      expect(remoteDesktopService.formatLastInputTime(threeHoursAgo)).toBe('3h ago');
    });
  });

  describe('getQualitySettings', () => {
    it('should return correct settings for different use cases', () => {
      const lowLatency = remoteDesktopService.getQualitySettings('low_latency');
      expect(lowLatency.mouseSensitivity).toBe(1.2);
      expect(lowLatency.recommendedFrameRate).toBe(20);
      expect(lowLatency.recommendedQuality).toBe(60);

      const balanced = remoteDesktopService.getQualitySettings('balanced');
      expect(balanced.mouseSensitivity).toBe(1.0);
      expect(balanced.recommendedFrameRate).toBe(15);
      expect(balanced.recommendedQuality).toBe(75);

      const highQuality = remoteDesktopService.getQualitySettings('high_quality');
      expect(highQuality.mouseSensitivity).toBe(0.8);
      expect(highQuality.recommendedFrameRate).toBe(10);
      expect(highQuality.recommendedQuality).toBe(90);
    });
  });
});
