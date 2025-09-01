/**
 * WebSocket service for real-time communication with SeraphC2 server
 */

import io, { Socket } from 'socket.io-client';

export interface ImplantStats {
  total: number;
  active: number;
  inactive: number;
  disconnected: number;
  connected: number;
  timestamp: Date;
}

export interface EnhancedImplant {
  id: string;
  hostname: string;
  username: string;
  operatingSystem: string;
  architecture: string;
  privileges: string;
  lastSeen: Date;
  status: string;
  communicationProtocol: string;
  systemInfo: any;
  isConnected: boolean;
  lastHeartbeat?: Date;
  connectionInfo?: {
    protocol: string;
    remoteAddress: string;
    userAgent?: string;
  };
}

export interface WebSocketEvents {
  // Server to client events
  implantStats: (data: ImplantStats) => void;
  implantList: (data: { implants: EnhancedImplant[]; timestamp: Date }) => void;
  implantDetails: (data: { implant: EnhancedImplant; timestamp: Date }) => void;
  implantRegistered: (data: { implant: EnhancedImplant; timestamp: Date }) => void;
  implantDisconnected: (data: { implantId: string; reason: string; timestamp: Date }) => void;
  implantHeartbeat: (data: {
    implantId: string;
    timestamp: Date;
    protocol: string;
    remoteAddress: string;
  }) => void;
  implantStatusChanged: (data: { implantId: string; status: string; timestamp: Date }) => void;
  error: (data: { message: string; implantId?: string }) => void;

  // Command events
  commandProgress: (data: any) => void;
  commandCompleted: (data: any) => void;
  commandFailed: (data: any) => void;
  commandTimeout: (data: any) => void;
  commandCancelled: (data: any) => void;
  commandHistory: (data: any) => void;
  activeCommands: (data: any) => void;

  // Client to server events
  requestImplantStats: () => void;
  requestImplantList: () => void;
  requestImplantDetails: (implantId: string) => void;
  requestCommandHistory: (data: { implantId: string; limit?: number; offset?: number }) => void;
  requestActiveCommands: () => void;
}

export class WebSocketService {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  /**
   * Connect to WebSocket server
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.token = token;

      this.socket = io({
        auth: {
          token: this.token,
        },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', error => {
        console.error('WebSocket connection error:', error);

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
            this.socket?.connect();
          }, this.reconnectDelay * this.reconnectAttempts);
        } else {
          reject(error);
        }
      });

      this.socket.on('disconnect', reason => {
        console.log('WebSocket disconnected:', reason);

        // Auto-reconnect for certain disconnect reasons
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't reconnect
          return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
            this.socket?.connect();
          }, this.reconnectDelay * this.reconnectAttempts);
        }
      });
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.token = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get the socket instance
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Subscribe to implant statistics updates
   */
  onImplantStats(callback: (stats: ImplantStats) => void): void {
    this.socket?.on('implantStats', callback);
  }

  /**
   * Subscribe to implant list updates
   */
  onImplantList(callback: (data: { implants: EnhancedImplant[]; timestamp: Date }) => void): void {
    this.socket?.on('implantList', callback);
  }

  /**
   * Subscribe to implant details updates
   */
  onImplantDetails(callback: (data: { implant: EnhancedImplant; timestamp: Date }) => void): void {
    this.socket?.on('implantDetails', callback);
  }

  /**
   * Subscribe to implant registration events
   */
  onImplantRegistered(
    callback: (data: { implant: EnhancedImplant; timestamp: Date }) => void
  ): void {
    this.socket?.on('implantRegistered', callback);
  }

  /**
   * Subscribe to implant disconnection events
   */
  onImplantDisconnected(
    callback: (data: { implantId: string; reason: string; timestamp: Date }) => void
  ): void {
    this.socket?.on('implantDisconnected', callback);
  }

  /**
   * Subscribe to implant heartbeat events
   */
  onImplantHeartbeat(
    callback: (data: {
      implantId: string;
      timestamp: Date;
      protocol: string;
      remoteAddress: string;
    }) => void
  ): void {
    this.socket?.on('implantHeartbeat', callback);
  }

  /**
   * Subscribe to implant status change events
   */
  onImplantStatusChanged(
    callback: (data: { implantId: string; status: string; timestamp: Date }) => void
  ): void {
    this.socket?.on('implantStatusChanged', callback);
  }

  /**
   * Subscribe to error events
   */
  onError(callback: (data: { message: string; implantId?: string }) => void): void {
    this.socket?.on('error', callback);
  }

  /**
   * Request implant statistics
   */
  requestImplantStats(): void {
    this.socket?.emit('requestImplantStats');
  }

  /**
   * Request implant list
   */
  requestImplantList(): void {
    this.socket?.emit('requestImplantList');
  }

  /**
   * Request implant details
   */
  requestImplantDetails(implantId: string): void {
    this.socket?.emit('requestImplantDetails', implantId);
  }

  /**
   * Subscribe to command progress events
   */
  onCommandProgress(callback: (data: any) => void): void {
    this.socket?.on('commandProgress', callback);
  }

  /**
   * Subscribe to command completion events
   */
  onCommandCompleted(callback: (data: any) => void): void {
    this.socket?.on('commandCompleted', callback);
  }

  /**
   * Subscribe to command failure events
   */
  onCommandFailed(callback: (data: any) => void): void {
    this.socket?.on('commandFailed', callback);
  }

  /**
   * Subscribe to command timeout events
   */
  onCommandTimeout(callback: (data: any) => void): void {
    this.socket?.on('commandTimeout', callback);
  }

  /**
   * Subscribe to command cancellation events
   */
  onCommandCancelled(callback: (data: any) => void): void {
    this.socket?.on('commandCancelled', callback);
  }

  /**
   * Subscribe to command history events
   */
  onCommandHistory(callback: (data: any) => void): void {
    this.socket?.on('commandHistory', callback);
  }

  /**
   * Subscribe to active commands events
   */
  onActiveCommands(callback: (data: any) => void): void {
    this.socket?.on('activeCommands', callback);
  }

  /**
   * Request command history
   */
  requestCommandHistory(implantId: string, limit?: number, offset?: number): void {
    this.socket?.emit('requestCommandHistory', { implantId, limit, offset });
  }

  /**
   * Request active commands
   */
  requestActiveCommands(): void {
    this.socket?.emit('requestActiveCommands');
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.socket?.removeAllListeners();
  }

  /**
   * Remove specific event listener
   */
  off(event: keyof WebSocketEvents): void {
    this.socket?.off(event);
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();
