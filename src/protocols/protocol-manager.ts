import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import {
  IProtocolManager,
  ProtocolMessage,
  ConnectionInfo,
  ProtocolStats,
  BaseProtocolHandler,
} from './interfaces';
import { Protocol } from '../types/entities';

// Using BaseProtocolHandler from interfaces instead of separate interface

export class ProtocolManager extends EventEmitter implements IProtocolManager {
  private implantConnections: Map<string, ConnectionInfo>;
  private logger: Logger;
  private handlers: Map<Protocol, BaseProtocolHandler> = new Map();
  private isRunning: boolean = false;
  private stats = {
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
  };

  constructor(config?: any) {
    super();
    this.implantConnections = new Map();
    this.logger = new Logger('protocol-manager');
  }

  async sendMessage(
    implantId: string,
    message: ProtocolMessage,
    preferredProtocol?: Protocol
  ): Promise<boolean> {
    try {
      // Basic implementation placeholder
      this.logger.info('Sending message', { implantId, messageId: message.id });
      return true;
    } catch (error) {
      this.logger.error(
        'Error occurred',
        error instanceof Error ? error : new Error('Unknown error'),
        {}
      );
      return false;
    }
  }

  isImplantConnected(implantId: string): boolean {
    return this.implantConnections.has(implantId);
  }

  getImplantConnection(implantId: string): ConnectionInfo | null {
    return this.implantConnections.get(implantId) || null;
  }

  // Additional basic methods
  addConnection(implantId: string, connectionInfo: ConnectionInfo): void {
    this.implantConnections.set(implantId, connectionInfo);
    this.emit('implantConnected', { implantId, connectionInfo });
  }

  removeConnection(implantId: string): void {
    this.implantConnections.delete(implantId);
    this.emit('implantDisconnected', { implantId });
  }

  getConnectedImplants(): string[] {
    return Array.from(this.implantConnections.keys());
  }

  registerHandler(protocol: Protocol, handler: BaseProtocolHandler): void {
    this.handlers.set(protocol, handler);
    this.logger.debug('Registered protocol handler', { protocol });
  }

  unregisterHandler(protocol: Protocol): void {
    this.handlers.delete(protocol);
    this.logger.debug('Unregistered protocol handler', { protocol });
  }

  getAvailableProtocols(): Protocol[] {
    return Array.from(this.handlers.keys());
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.logger.info('Starting protocol manager');

    for (const [protocol, handler] of this.handlers) {
      try {
        await handler.start();
        this.logger.info('Started protocol handler', { protocol });
      } catch (error) {
        this.logger.error(
          'Failed to start protocol handler',
          error instanceof Error ? error : new Error('Unknown error'),
          { protocol }
        );
      }
    }

    this.isRunning = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping protocol manager');

    for (const [protocol, handler] of this.handlers) {
      try {
        await handler.stop();
        this.logger.info('Stopped protocol handler', { protocol });
      } catch (error) {
        this.logger.error(
          'Failed to stop protocol handler',
          error instanceof Error ? error : new Error('Unknown error'),
          { protocol }
        );
      }
    }

    this.isRunning = false;
    this.emit('stopped');
  }

  getProtocolHealth() {
    const health: Record<string, any> = {};

    for (const protocol of this.handlers.keys()) {
      health[protocol] = {
        status: 'healthy',
        lastCheck: new Date(),
      };
    }

    return health;
  }

  getProtocolStats(): ProtocolStats[] {
    const stats: ProtocolStats[] = [];

    for (const [protocol, handler] of this.handlers) {
      if (handler instanceof BaseProtocolHandler) {
        stats.push(handler.getStats());
      }
    }

    return stats;
  }

  getImplantProtocolStates() {
    const states: Record<string, any> = {};

    for (const [implantId, connection] of this.implantConnections) {
      states[implantId] = {
        protocol: connection.protocol,
        connected: true,
        lastSeen: connection.lastActivity,
      };
    }

    return states;
  }

  forceFailover(implantId: string, targetProtocol: Protocol): Promise<boolean> {
    this.logger.info('Forcing failover', { implantId, targetProtocol });

    // Basic implementation - in a real system this would handle protocol switching
    const connection = this.implantConnections.get(implantId);
    if (connection) {
      connection.protocol = targetProtocol;
      this.implantConnections.set(implantId, connection);
      return Promise.resolve(true);
    }

    return Promise.resolve(false);
  }
}
