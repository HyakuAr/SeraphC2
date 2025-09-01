/**
 * Tests for screen monitoring service
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
 */

import { screenService } from '../screenService';
import { apiClient } from '../apiClient';

// Mock apiClient
jest.mock('../apiClient');
const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// Mock URL methods
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock atob
global.atob = jest.fn((str: string) => {
  return Buffer.from(str, 'base64').toString('binary');
});

describe('ScreenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  describe('getMonitors', () => {
    it('should get monitors successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            monitors: [
              {
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
              },
            ],
            totalCount: 1,
            timestamp: new Date(),
          },
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await screenService.getMonitors('implant-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/screen/implants/implant-1/monitors');
      expect(result.monitors).toHaveLength(1);
      expect(result.monitors[0].name).toBe('Monitor 0');
    });

    it('should handle get monitors error', async () => {
      mockApiClient.get.mockRejectedValue(new Error('API Error'));

      await expect(screenService.getMonitors('implant-1')).rejects.toThrow(
        'Failed to get monitor information'
      );
    });
  });

  describe('takeScreenshot', () => {
    it('should take screenshot successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            monitorId: 0,
            width: 1920,
            height: 1080,
            imageData: 'base64encodedimage',
            size: 123456,
            timestamp: new Date(),
            capturedMouseCursor: true,
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const request = {
        implantId: 'implant-1',
        monitorId: 0,
        quality: 75,
        captureMouseCursor: true,
      };

      const result = await screenService.takeScreenshot(request);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/screen/implants/implant-1/screenshot', {
        monitorId: 0,
        quality: 75,
        captureMouseCursor: true,
      });
      expect(result.monitorId).toBe(0);
      expect(result.imageData).toBe('base64encodedimage');
    });

    it('should handle take screenshot error', async () => {
      mockApiClient.post.mockRejectedValue(new Error('API Error'));

      await expect(screenService.takeScreenshot({ implantId: 'implant-1' })).rejects.toThrow(
        'Failed to take screenshot'
      );
    });
  });

  describe('startScreenStream', () => {
    it('should start screen stream successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Stream started',
          data: {
            streamId: 'stream-123',
            config: {
              quality: 75,
              frameRate: 10,
              captureMouseCursor: true,
            },
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const config = {
        quality: 75,
        frameRate: 10,
        captureMouseCursor: true,
      };

      const result = await screenService.startScreenStream('implant-1', config);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/screen/implants/implant-1/stream/start',
        config
      );
      expect(result.success).toBe(true);
      expect(result.streamId).toBe('stream-123');
    });

    it('should handle start stream error', async () => {
      mockApiClient.post.mockRejectedValue(new Error('API Error'));

      await expect(
        screenService.startScreenStream('implant-1', {
          quality: 75,
          frameRate: 10,
          captureMouseCursor: true,
        })
      ).rejects.toThrow('Failed to start screen stream');
    });
  });

  describe('stopScreenStream', () => {
    it('should stop screen stream successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Stream stopped',
          data: {
            streamId: 'stream-123',
            frameCount: 100,
            totalDataSent: 5000000,
          },
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await screenService.stopScreenStream('implant-1');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/screen/implants/implant-1/stream/stop');
      expect(result.success).toBe(true);
      expect(result.frameCount).toBe(100);
    });
  });

  describe('updateStreamConfig', () => {
    it('should update stream config successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Config updated',
        },
      };

      mockApiClient.put.mockResolvedValue(mockResponse);

      const config = { quality: 90 };

      const result = await screenService.updateStreamConfig('implant-1', config);

      expect(mockApiClient.put).toHaveBeenCalledWith(
        '/api/screen/implants/implant-1/stream/config',
        config
      );
      expect(result.success).toBe(true);
    });
  });

  describe('getStreamStatus', () => {
    it('should get stream status successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            isActive: true,
            monitorId: 0,
            config: {
              quality: 75,
              frameRate: 10,
              captureMouseCursor: true,
            },
            frameCount: 50,
            totalDataSent: 2500000,
            averageFrameSize: 50000,
            actualFrameRate: 9.8,
          },
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await screenService.getStreamStatus('implant-1');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/screen/implants/implant-1/stream/status'
      );
      expect(result?.isActive).toBe(true);
      expect(result?.frameCount).toBe(50);
    });
  });

  describe('getActiveStreams', () => {
    it('should get active streams successfully', async () => {
      const mockResponse = {
        data: {
          data: {
            streams: [
              {
                streamId: 'stream-123',
                implantId: 'implant-1',
                isActive: true,
                frameCount: 50,
              },
            ],
            totalCount: 1,
          },
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await screenService.getActiveStreams();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/screen/streams/active');
      expect(result.streams).toHaveLength(1);
      expect(result.totalCount).toBe(1);
    });
  });

  describe('createImageBlobUrl', () => {
    it('should create blob URL from base64 data', () => {
      const base64Data =
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A';

      const result = screenService.createImageBlobUrl(base64Data);

      expect(result).toBe('blob:mock-url');
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should handle base64 data without prefix', () => {
      const base64Data =
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A';

      const result = screenService.createImageBlobUrl(base64Data);

      expect(result).toBe('blob:mock-url');
      expect(mockCreateObjectURL).toHaveBeenCalled();
    });

    it('should handle create blob URL error', () => {
      mockCreateObjectURL.mockImplementation(() => {
        throw new Error('Blob creation failed');
      });

      expect(() => screenService.createImageBlobUrl('invalid')).toThrow(
        'Failed to process image data'
      );
    });
  });

  describe('revokeBlobUrl', () => {
    it('should revoke blob URL', () => {
      screenService.revokeBlobUrl('blob:mock-url');

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should handle revoke error gracefully', () => {
      mockRevokeObjectURL.mockImplementation(() => {
        throw new Error('Revoke failed');
      });

      // Should not throw
      expect(() => screenService.revokeBlobUrl('blob:mock-url')).not.toThrow();
    });
  });

  describe('downloadScreenshot', () => {
    it('should download screenshot', () => {
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      };

      const mockAppendChild = jest.fn();
      const mockRemoveChild = jest.fn();
      const mockCreateElement = jest.fn().mockReturnValue(mockLink);

      Object.defineProperty(document, 'createElement', {
        value: mockCreateElement,
      });
      Object.defineProperty(document.body, 'appendChild', {
        value: mockAppendChild,
      });
      Object.defineProperty(document.body, 'removeChild', {
        value: mockRemoveChild,
      });

      const screenshot = {
        monitorId: 0,
        width: 1920,
        height: 1080,
        imageData: 'base64encodedimage',
        size: 123456,
        timestamp: new Date(),
        capturedMouseCursor: true,
      };

      screenService.downloadScreenshot(screenshot);

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockLink.href).toBe('blob:mock-url');
      expect(mockLink.download).toMatch(/screenshot_0_.*\.jpg/);
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockAppendChild).toHaveBeenCalledWith(mockLink);
      expect(mockRemoveChild).toHaveBeenCalledWith(mockLink);
    });
  });

  describe('utility methods', () => {
    it('should format file size correctly', () => {
      expect(screenService.formatFileSize(0)).toBe('0 B');
      expect(screenService.formatFileSize(1024)).toBe('1 KB');
      expect(screenService.formatFileSize(1048576)).toBe('1 MB');
      expect(screenService.formatFileSize(1073741824)).toBe('1 GB');
    });

    it('should format frame rate correctly', () => {
      expect(screenService.formatFrameRate(5.5)).toBe('5.5 FPS');
      expect(screenService.formatFrameRate(10)).toBe('10.0 FPS');
    });

    it('should calculate bandwidth correctly', () => {
      expect(screenService.calculateBandwidth(0, 0)).toBe('0 B/s');
      expect(screenService.calculateBandwidth(1024, 1)).toBe('1 KB/s');
      expect(screenService.calculateBandwidth(2048, 2)).toBe('1 KB/s');
    });

    it('should validate stream config', () => {
      const validConfig = {
        quality: 75,
        frameRate: 10,
        captureMouseCursor: true,
      };

      expect(screenService.validateStreamConfig(validConfig)).toEqual([]);

      const invalidConfig = {
        quality: 150,
        frameRate: 50,
        width: -1,
        captureMouseCursor: true,
      };

      const errors = screenService.validateStreamConfig(invalidConfig);
      expect(errors).toContain('Quality must be between 1 and 100');
      expect(errors).toContain('Frame rate must be between 1 and 30 FPS');
      expect(errors).toContain('Width must be a positive number');
    });

    it('should get recommended quality based on frame rate', () => {
      expect(screenService.getRecommendedQuality(2)).toBe(90);
      expect(screenService.getRecommendedQuality(8)).toBe(80);
      expect(screenService.getRecommendedQuality(12)).toBe(70);
      expect(screenService.getRecommendedQuality(18)).toBe(60);
      expect(screenService.getRecommendedQuality(25)).toBe(50);
    });

    it('should get recommended frame rate based on use case', () => {
      expect(screenService.getRecommendedFrameRate('monitoring')).toBe(2);
      expect(screenService.getRecommendedFrameRate('interaction')).toBe(15);
      expect(screenService.getRecommendedFrameRate('recording')).toBe(10);
    });
  });
});
