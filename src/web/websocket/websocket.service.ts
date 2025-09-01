/**
 * WebSocket service for real-time updates
 * Provides real-time implant status updates to connected clients
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { ImplantManager } from '../../core/engine/implant-manager';
import { CommandManager } from '../../core/engine/command-manager';
import { AuthService } from '../../core/auth/auth.service';
import { CollaborationService } from '../../core/services/collaboration.service';
import { Logger } from '../../utils/logger';
import { OperatorRole } from '../../types/entities';
import { OperatorSession, CollaborationEvent } from '../../types/collaboration';

export interface WebSocketConfig {
  corsOrigins: string[];
}

export interface AuthenticatedSocket {
  id: string;
  userId: string;
  username: string;
  role: string;
}

export class WebSocketService {
  private io: SocketIOServer;
  private logger: Logger;
  private authenticatedSockets: Map<string, AuthenticatedSocket>;
  private collaborationService: CollaborationService;

  constructor(
    httpServer: HTTPServer,
    private config: WebSocketConfig,
    private implantManager: ImplantManager,
    private commandManager: CommandManager,
    private authService: AuthService
  ) {
    this.logger = Logger.getInstance();
    this.authenticatedSockets = new Map();

    // Initialize collaboration service
    this.collaborationService = new CollaborationService({
      presenceUpdateInterval: 30000, // 30 seconds
      messageRetentionDays: 7,
      activityLogRetentionDays: 30,
      sessionTimeoutMinutes: 30,
      lockTimeoutMinutes: 5,
      conflictResolutionTimeoutMinutes: 2,
    });

    // Initialize Socket.IO server
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: this.config.corsOrigins,
        credentials: true,
      },
      path: '/socket.io/',
    });

    this.setupEventHandlers();
    this.setupImplantManagerListeners();
    this.setupCommandManagerListeners();
    this.setupCollaborationListeners();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    this.io.use(async (socket, next) => {
      try {
        // Extract token from handshake auth
        const token = socket.handshake.auth['token'];

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify token
        const result = await this.authService.validateToken(token);
        if (!result.valid || !result.operator) {
          return next(new Error('Invalid authentication token'));
        }
        const user = result.operator;

        // Store authenticated user info
        const authSocket: AuthenticatedSocket = {
          id: socket.id,
          userId: user.id,
          username: user.username,
          role: user.role,
        };

        this.authenticatedSockets.set(socket.id, authSocket);

        // Register operator session for collaboration
        const operatorSession: OperatorSession = {
          operatorId: user.id,
          username: user.username,
          role: user.role,
          socketId: socket.id,
          connectedAt: new Date(),
          lastActivity: new Date(),
          ipAddress: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
        };

        this.collaborationService.registerOperatorSession(operatorSession);

        this.logger.info('WebSocket client authenticated', {
          socketId: socket.id,
          userId: user.id,
          username: user.username,
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

    this.io.on('connection', socket => {
      const authSocket = this.authenticatedSockets.get(socket.id);

      this.logger.info('WebSocket client connected', {
        socketId: socket.id,
        username: authSocket?.username,
      });

      // Send initial data
      this.sendInitialData(socket);

      // Handle client requests
      socket.on('requestImplantStats', async () => {
        await this.sendImplantStats(socket);
      });

      socket.on('requestImplantList', async () => {
        await this.sendImplantList(socket);
      });

      socket.on('requestImplantDetails', async (implantId: string) => {
        await this.sendImplantDetails(socket, implantId);
      });

      socket.on(
        'requestCommandHistory',
        async (data: { implantId: string; limit?: number; offset?: number }) => {
          await this.sendCommandHistory(socket, data.implantId, data.limit, data.offset);
        }
      );

      socket.on('requestActiveCommands', async () => {
        await this.sendActiveCommands(socket);
      });

      // Collaboration event handlers
      socket.on(
        'updatePresence',
        (data: { status?: string; currentImplant?: string; currentAction?: string }) => {
          if (authSocket) {
            this.collaborationService.updateOperatorPresence(authSocket.userId, data);
          }
        }
      );

      socket.on(
        'sendMessage',
        (data: {
          toOperatorId?: string;
          message: string;
          type?: string;
          priority?: string;
          metadata?: any;
        }) => {
          if (authSocket) {
            this.collaborationService.sendMessage({
              fromOperatorId: authSocket.userId,
              toOperatorId: data.toOperatorId,
              message: data.message,
              type: (data.type as any) || 'direct',
              priority: (data.priority as any) || 'normal',
              metadata: data.metadata,
            });
          }
        }
      );

      socket.on('requestMessages', (data: { limit?: number }) => {
        if (authSocket) {
          const messages = this.collaborationService.getMessagesForOperator(
            authSocket.userId,
            data.limit
          );
          socket.emit('messages', { messages });
        }
      });

      socket.on('requestPresence', () => {
        const presence = this.collaborationService.getAllOperatorPresence();
        socket.emit('operatorPresence', { presence });
      });

      socket.on('requestActivityLogs', (data: { filters?: any; limit?: number }) => {
        if (authSocket && authSocket.role === OperatorRole.ADMINISTRATOR) {
          const logs = this.collaborationService.getActivityLogs({
            ...data.filters,
            limit: data.limit,
          });
          socket.emit('activityLogs', { logs });
        }
      });

      socket.on('resolveConflict', (data: { conflictId: string; resolution: string }) => {
        if (authSocket) {
          this.collaborationService.resolveSessionConflict(
            data.conflictId,
            data.resolution as any,
            authSocket.userId
          );
        }
      });

      socket.on(
        'initiateSessionTakeover',
        (data: { targetOperatorId: string; reason: string; implantId?: string }) => {
          if (authSocket && authSocket.role === OperatorRole.ADMINISTRATOR) {
            this.collaborationService.initiateSessionTakeover(
              authSocket.userId,
              data.targetOperatorId,
              data.reason,
              data.implantId
            );
          }
        }
      );

      socket.on('checkImplantAccess', (data: { implantId: string; action: string }) => {
        if (authSocket) {
          const conflict = this.collaborationService.checkSessionConflict(
            authSocket.userId,
            data.implantId,
            data.action
          );

          if (conflict) {
            socket.emit('sessionConflict', { conflict });
          } else {
            // Try to acquire lock
            const lockAcquired = this.collaborationService.acquireImplantLock(
              data.implantId,
              authSocket.userId,
              authSocket.username,
              data.action
            );

            socket.emit('implantAccessResult', {
              implantId: data.implantId,
              granted: lockAcquired,
              action: data.action,
            });
          }
        }
      });

      socket.on('releaseImplantAccess', (data: { implantId: string }) => {
        if (authSocket) {
          this.collaborationService.releaseImplantLock(data.implantId, authSocket.userId);
        }
      });

      // Handle disconnection
      socket.on('disconnect', reason => {
        this.logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          username: authSocket?.username,
          reason,
        });

        // Unregister from collaboration service
        if (authSocket) {
          this.collaborationService.unregisterOperatorSession(authSocket.userId);
        }

        this.authenticatedSockets.delete(socket.id);
      });
    });
  }

  /**
   * Setup listeners for ImplantManager events
   */
  private setupImplantManagerListeners(): void {
    this.implantManager.on('implantRegistered', data => {
      this.logger.debug('Broadcasting implant registration', {
        implantId: data.implant.id,
      });

      this.io.emit('implantRegistered', {
        implant: data.implant,
        timestamp: new Date(),
      });

      // Also send updated stats
      this.broadcastImplantStats();
    });

    this.implantManager.on('heartbeatReceived', data => {
      this.io.emit('implantHeartbeat', {
        implantId: data.implantId,
        timestamp: data.timestamp,
        protocol: data.protocol,
        remoteAddress: data.remoteAddress,
      });
    });

    this.implantManager.on('implantDisconnected', data => {
      this.logger.debug('Broadcasting implant disconnection', {
        implantId: data.implantId,
      });

      this.io.emit('implantDisconnected', {
        implantId: data.implantId,
        reason: data.reason,
        timestamp: data.timestamp,
      });

      // Also send updated stats
      this.broadcastImplantStats();
    });

    this.implantManager.on('implantInactive', data => {
      this.io.emit('implantStatusChanged', {
        implantId: data.implantId,
        status: 'inactive',
        timestamp: data.timestamp,
      });

      // Also send updated stats
      this.broadcastImplantStats();
    });
  }

  /**
   * Send initial data to newly connected client
   */
  private async sendInitialData(socket: any): Promise<void> {
    try {
      await this.sendImplantStats(socket);
      await this.sendImplantList(socket);
    } catch (error) {
      this.logger.error('Failed to send initial data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
      });
    }
  }

  /**
   * Send implant statistics to a specific socket
   */
  private async sendImplantStats(socket: any): Promise<void> {
    try {
      const stats = await this.implantManager.getImplantStats();
      const activeSessions = this.implantManager.getActiveSessions();

      socket.emit('implantStats', {
        ...stats,
        connected: activeSessions.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send implant stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
      });
    }
  }

  /**
   * Send implant list to a specific socket
   */
  private async sendImplantList(socket: any): Promise<void> {
    try {
      const implants = await this.implantManager.getAllImplants();
      const activeSessions = this.implantManager.getActiveSessions();

      // Enhance implants with session data
      const enhancedImplants = implants.map(implant => {
        const session = activeSessions.find(s => s.implantId === implant.id);
        return {
          ...implant,
          isConnected: !!session && session.isActive,
          lastHeartbeat: session?.lastHeartbeat,
          connectionInfo: session?.connectionInfo,
        };
      });

      socket.emit('implantList', {
        implants: enhancedImplants,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send implant list', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
      });
    }
  }

  /**
   * Send implant details to a specific socket
   */
  private async sendImplantDetails(socket: any, implantId: string): Promise<void> {
    try {
      const implant = await this.implantManager.getImplant(implantId);

      if (!implant) {
        socket.emit('error', {
          message: 'Implant not found',
          implantId,
        });
        return;
      }

      const session = this.implantManager.getImplantSession(implantId);
      const enhancedImplant = {
        ...implant,
        isConnected: !!session && session.isActive,
        lastHeartbeat: session?.lastHeartbeat,
        connectionInfo: session?.connectionInfo,
      };

      socket.emit('implantDetails', {
        implant: enhancedImplant,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send implant details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
        implantId,
      });

      socket.emit('error', {
        message: 'Failed to fetch implant details',
        implantId,
      });
    }
  }

  /**
   * Broadcast implant statistics to all connected clients
   */
  private async broadcastImplantStats(): Promise<void> {
    try {
      const stats = await this.implantManager.getImplantStats();
      const activeSessions = this.implantManager.getActiveSessions();

      this.io.emit('implantStats', {
        ...stats,
        connected: activeSessions.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to broadcast implant stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Broadcast implant list to all connected clients
   */
  public async broadcastImplantList(): Promise<void> {
    try {
      const implants = await this.implantManager.getAllImplants();
      const activeSessions = this.implantManager.getActiveSessions();

      // Enhance implants with session data
      const enhancedImplants = implants.map(implant => {
        const session = activeSessions.find(s => s.implantId === implant.id);
        return {
          ...implant,
          isConnected: !!session && session.isActive,
          lastHeartbeat: session?.lastHeartbeat,
          connectionInfo: session?.connectionInfo,
        };
      });

      this.io.emit('implantList', {
        implants: enhancedImplants,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to broadcast implant list', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get connected client count
   */
  public getConnectedClientCount(): number {
    return this.authenticatedSockets.size;
  }

  /**
   * Setup listeners for CommandManager events
   */
  private setupCommandManagerListeners(): void {
    this.commandManager.on('commandProgress', progress => {
      this.io.emit('commandProgress', {
        ...progress,
        timestamp: new Date(),
      });
    });

    this.commandManager.on('commandCompleted', ({ command, result, status }) => {
      this.io.emit('commandCompleted', {
        command,
        result,
        status,
        timestamp: new Date(),
      });
    });

    this.commandManager.on('commandFailed', ({ command, error }) => {
      this.io.emit('commandFailed', {
        command,
        error,
        timestamp: new Date(),
      });
    });

    this.commandManager.on('commandTimeout', ({ command, timeout }) => {
      this.io.emit('commandTimeout', {
        command,
        timeout,
        timestamp: new Date(),
      });
    });

    this.commandManager.on('commandCancelled', ({ command }) => {
      this.io.emit('commandCancelled', {
        command,
        timestamp: new Date(),
      });
    });
  }

  /**
   * Send command history to a specific socket
   */
  private async sendCommandHistory(
    socket: any,
    implantId: string,
    limit?: number,
    offset?: number
  ): Promise<void> {
    try {
      const commands = await this.commandManager.getCommandHistory({
        implantId,
        limit: limit || 50,
        offset: offset || 0,
      });

      socket.emit('commandHistory', {
        implantId,
        commands,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send command history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
        implantId,
      });

      socket.emit('error', {
        message: 'Failed to fetch command history',
        implantId,
      });
    }
  }

  /**
   * Send active commands to a specific socket
   */
  private async sendActiveCommands(socket: any): Promise<void> {
    try {
      const activeCommands = this.commandManager.getActiveCommands();

      socket.emit('activeCommands', {
        commands: activeCommands,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to send active commands', {
        error: error instanceof Error ? error.message : 'Unknown error',
        socketId: socket.id,
      });

      socket.emit('error', {
        message: 'Failed to fetch active commands',
      });
    }
  }

  /**
   * Setup listeners for CollaborationService events
   */
  private setupCollaborationListeners(): void {
    this.collaborationService.on('collaborationEvent', (event: CollaborationEvent) => {
      // Broadcast collaboration events to relevant clients
      switch (event.type) {
        case 'presence_update':
          this.io.emit('operatorPresenceUpdate', event.data);
          break;

        case 'message':
          const message = event.data as any;
          if (message.toOperatorId) {
            // Direct message - send to specific operator
            const targetSocket = this.findSocketByOperatorId(message.toOperatorId);
            if (targetSocket) {
              targetSocket.emit('newMessage', message);
            }
          } else {
            // Broadcast message
            this.io.emit('newMessage', message);
          }
          break;

        case 'conflict':
          const conflict = event.data as any;
          // Notify both operators involved in the conflict
          const primarySocket = this.findSocketByOperatorId(conflict.primaryOperatorId);
          const conflictingSocket = this.findSocketByOperatorId(conflict.conflictingOperatorId);

          if (primarySocket) {
            primarySocket.emit('sessionConflict', conflict);
          }
          if (conflictingSocket) {
            conflictingSocket.emit('sessionConflict', conflict);
          }
          break;

        case 'takeover':
          const takeover = event.data as any;
          // Notify target operator of takeover
          const targetSocket = this.findSocketByOperatorId(takeover.targetOperatorId);
          if (targetSocket) {
            targetSocket.emit('sessionTakeover', takeover);
          }

          // Notify admin who initiated takeover
          const adminSocket = this.findSocketByOperatorId(takeover.adminOperatorId);
          if (adminSocket) {
            adminSocket.emit('takeoverStatus', takeover);
          }
          break;

        case 'activity':
          // Broadcast activity logs to administrators only
          this.broadcastToAdministrators('activityLogUpdate', event.data);
          break;
      }
    });
  }

  /**
   * Find socket by operator ID
   */
  private findSocketByOperatorId(operatorId: string): any {
    for (const [socketId, authSocket] of this.authenticatedSockets.entries()) {
      if (authSocket.userId === operatorId) {
        return this.io.sockets.sockets.get(socketId);
      }
    }
    return null;
  }

  /**
   * Broadcast message to administrators only
   */
  private broadcastToAdministrators(event: string, data: any): void {
    for (const [socketId, authSocket] of this.authenticatedSockets.entries()) {
      if (authSocket.role === OperatorRole.ADMINISTRATOR) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit(event, data);
        }
      }
    }
  }

  /**
   * Get collaboration service instance
   */
  public getCollaborationService(): CollaborationService {
    return this.collaborationService;
  }

  /**
   * Close WebSocket server
   */
  public close(): void {
    this.collaborationService.stop();
    this.io.close();
    this.authenticatedSockets.clear();
    this.logger.info('WebSocket service closed');
  }
}
