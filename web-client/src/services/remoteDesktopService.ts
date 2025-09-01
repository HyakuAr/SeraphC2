/**
 * Remote Desktop service for SeraphC2 web client
 * Implements requirements 11.1, 11.2, 11.4 from the SeraphC2 specification
 */

import { apiClient } from './apiClient';

export interface MouseClickEvent {
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
  action: 'down' | 'up' | 'click' | 'double_click';
  monitorId?: number;
}

export interface MouseMoveEvent {
  x: number;
  y: number;
  monitorId?: number;
}

export interface KeyboardEvent {
  key: string;
  action: 'down' | 'up' | 'press';
  modifiers?: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    win?: boolean;
  };
}

export interface RemoteDesktopConfig {
  enableMouseInput: boolean;
  enableKeyboardInput: boolean;
  disableLocalInput: boolean;
  mouseSensitivity: number; // 0.1 to 2.0
  keyboardLayout?: string;
}

export interface RemoteDesktopStatus {
  isActive: boolean;
  mouseInputEnabled: boolean;
  keyboardInputEnabled: boolean;
  localInputDisabled: boolean;
  config: RemoteDesktopConfig;
  lastInputTime?: Date;
  inputCount: number;
}

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

export interface ActiveRemoteDesktopSession {
  implantId: string;
  isActive: boolean;
  mouseInputEnabled: boolean;
  keyboardInputEnabled: boolean;
  localInputDisabled: boolean;
  config: RemoteDesktopConfig;
  lastInputTime?: Date;
  inputCount: number;
}

export interface ActiveSessionsResponse {
  sessions: ActiveRemoteDesktopSession[];
  totalCount: number;
}

class RemoteDesktopService {
  /**
   * Initialize remote desktop session
   */
  async initializeRemoteDesktop(
    implantId: string,
    config: RemoteDesktopConfig
  ): Promise<RemoteDesktopConfigResult> {
    try {
      const response = await apiClient.post(
        `/api/remote-desktop/implants/${implantId}/initialize`,
        config
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to initialize remote desktop:', error);
      throw new Error('Failed to initialize remote desktop session');
    }
  }

  /**
   * Terminate remote desktop session
   */
  async terminateRemoteDesktop(implantId: string): Promise<RemoteDesktopInteractionResult> {
    try {
      const response = await apiClient.post(`/api/remote-desktop/implants/${implantId}/terminate`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to terminate remote desktop:', error);
      throw new Error('Failed to terminate remote desktop session');
    }
  }

  /**
   * Send mouse click event
   */
  async sendMouseClick(
    implantId: string,
    mouseEvent: MouseClickEvent
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      const response = await apiClient.post(
        `/api/remote-desktop/implants/${implantId}/mouse/click`,
        mouseEvent
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to send mouse click:', error);
      throw new Error('Failed to send mouse click event');
    }
  }

  /**
   * Send mouse move event
   */
  async sendMouseMove(
    implantId: string,
    mouseEvent: MouseMoveEvent
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      const response = await apiClient.post(
        `/api/remote-desktop/implants/${implantId}/mouse/move`,
        mouseEvent
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to send mouse move:', error);
      throw new Error('Failed to send mouse move event');
    }
  }

  /**
   * Send keyboard input event
   */
  async sendKeyboardInput(
    implantId: string,
    keyEvent: KeyboardEvent
  ): Promise<RemoteDesktopInteractionResult> {
    try {
      const response = await apiClient.post(
        `/api/remote-desktop/implants/${implantId}/keyboard/input`,
        keyEvent
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to send keyboard input:', error);
      throw new Error('Failed to send keyboard input event');
    }
  }

  /**
   * Disable local input on target system
   */
  async disableLocalInput(implantId: string): Promise<RemoteDesktopInteractionResult> {
    try {
      const response = await apiClient.post(
        `/api/remote-desktop/implants/${implantId}/input/disable`
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to disable local input:', error);
      throw new Error('Failed to disable local input');
    }
  }

  /**
   * Enable local input on target system
   */
  async enableLocalInput(implantId: string): Promise<RemoteDesktopInteractionResult> {
    try {
      const response = await apiClient.post(
        `/api/remote-desktop/implants/${implantId}/input/enable`
      );
      return response.data.data;
    } catch (error) {
      console.error('Failed to enable local input:', error);
      throw new Error('Failed to enable local input');
    }
  }

  /**
   * Get remote desktop status
   */
  async getRemoteDesktopStatus(implantId: string): Promise<RemoteDesktopStatus | null> {
    try {
      const response = await apiClient.get(`/api/remote-desktop/implants/${implantId}/status`);
      return response.data.data;
    } catch (error) {
      console.error('Failed to get remote desktop status:', error);
      throw new Error('Failed to get remote desktop status');
    }
  }

  /**
   * Get all active remote desktop sessions
   */
  async getActiveRemoteDesktopSessions(): Promise<ActiveSessionsResponse> {
    try {
      const response = await apiClient.get('/api/remote-desktop/sessions/active');
      return response.data.data;
    } catch (error) {
      console.error('Failed to get active remote desktop sessions:', error);
      throw new Error('Failed to get active remote desktop sessions');
    }
  }

  /**
   * Convert DOM mouse event to remote desktop mouse event
   */
  convertDOMMouseEvent(
    domEvent: React.MouseEvent,
    imageElement: HTMLImageElement,
    action: 'down' | 'up' | 'click' | 'double_click' = 'click',
    monitorId?: number
  ): MouseClickEvent {
    const rect = imageElement.getBoundingClientRect();
    const scaleX = imageElement.naturalWidth / rect.width;
    const scaleY = imageElement.naturalHeight / rect.height;

    const x = Math.round((domEvent.clientX - rect.left) * scaleX);
    const y = Math.round((domEvent.clientY - rect.top) * scaleY);

    let button: 'left' | 'right' | 'middle';
    switch (domEvent.button) {
      case 0:
        button = 'left';
        break;
      case 1:
        button = 'middle';
        break;
      case 2:
        button = 'right';
        break;
      default:
        button = 'left';
    }

    return {
      x,
      y,
      button,
      action,
      monitorId,
    };
  }

  /**
   * Convert DOM mouse move event to remote desktop mouse move event
   */
  convertDOMMouseMoveEvent(
    domEvent: React.MouseEvent,
    imageElement: HTMLImageElement,
    monitorId?: number
  ): MouseMoveEvent {
    const rect = imageElement.getBoundingClientRect();
    const scaleX = imageElement.naturalWidth / rect.width;
    const scaleY = imageElement.naturalHeight / rect.height;

    const x = Math.round((domEvent.clientX - rect.left) * scaleX);
    const y = Math.round((domEvent.clientY - rect.top) * scaleY);

    return {
      x,
      y,
      monitorId,
    };
  }

  /**
   * Convert DOM keyboard event to remote desktop keyboard event
   */
  convertDOMKeyboardEvent(
    domEvent: React.KeyboardEvent,
    action: 'down' | 'up' | 'press' = 'press'
  ): KeyboardEvent {
    return {
      key: domEvent.key,
      action,
      modifiers: {
        ctrl: domEvent.ctrlKey,
        alt: domEvent.altKey,
        shift: domEvent.shiftKey,
        win: domEvent.metaKey,
      },
    };
  }

  /**
   * Validate remote desktop configuration
   */
  validateRemoteDesktopConfig(config: RemoteDesktopConfig): string[] {
    const errors: string[] = [];

    if (config.mouseSensitivity < 0.1 || config.mouseSensitivity > 2.0) {
      errors.push('Mouse sensitivity must be between 0.1 and 2.0');
    }

    return errors;
  }

  /**
   * Get default remote desktop configuration
   */
  getDefaultConfig(): RemoteDesktopConfig {
    return {
      enableMouseInput: true,
      enableKeyboardInput: true,
      disableLocalInput: false,
      mouseSensitivity: 1.0,
      keyboardLayout: 'en-US',
    };
  }

  /**
   * Format input count for display
   */
  formatInputCount(count: number): string {
    if (count === 0) return 'No inputs';
    if (count === 1) return '1 input';
    if (count < 1000) return `${count} inputs`;
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K inputs`;
    return `${(count / 1000000).toFixed(1)}M inputs`;
  }

  /**
   * Format last input time for display
   */
  formatLastInputTime(lastInputTime?: Date): string {
    if (!lastInputTime) return 'Never';

    const now = new Date();
    const diff = now.getTime() - lastInputTime.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return lastInputTime.toLocaleDateString();
  }

  /**
   * Get quality settings based on use case
   */
  getQualitySettings(useCase: 'low_latency' | 'balanced' | 'high_quality'): {
    mouseSensitivity: number;
    recommendedFrameRate: number;
    recommendedQuality: number;
  } {
    switch (useCase) {
      case 'low_latency':
        return {
          mouseSensitivity: 1.2,
          recommendedFrameRate: 20,
          recommendedQuality: 60,
        };
      case 'balanced':
        return {
          mouseSensitivity: 1.0,
          recommendedFrameRate: 15,
          recommendedQuality: 75,
        };
      case 'high_quality':
        return {
          mouseSensitivity: 0.8,
          recommendedFrameRate: 10,
          recommendedQuality: 90,
        };
      default:
        return {
          mouseSensitivity: 1.0,
          recommendedFrameRate: 15,
          recommendedQuality: 75,
        };
    }
  }
}

export const remoteDesktopService = new RemoteDesktopService();
export default remoteDesktopService;
