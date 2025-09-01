import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { ConnectionInfo, ProtocolMessage } from './interfaces';

export type MessageHandler = (
  message: ProtocolMessage,
  connectionInfo: ConnectionInfo
) => Promise<void>;

export class MessageRouter extends EventEmitter {
  private logger: Logger;
  private handlers: Map<string, MessageHandler> = new Map();
  private stats = {
    messagesProcessed: 0,
    messagesRouted: 0,
    errors: 0,
  };

  constructor() {
    super();
    this.logger = new Logger('message-router');
  }

  async routeMessage(message: ProtocolMessage, connectionInfo: ConnectionInfo): Promise<void> {
    try {
      this.logger.debug('Routing message', {
        messageId: message.id,
        type: message.type,
        implantId: message.implantId,
        protocol: connectionInfo.protocol,
        encrypted: message.encrypted,
      });

      // Basic message routing logic
      this.emit('messageRouted', { message, connectionInfo });
    } catch (error) {
      this.logger.error(
        'Error occurred',
        error instanceof Error ? error : new Error('Unknown error'),
        {}
      );
      throw error;
    }
  }

  async processMessage(message: ProtocolMessage): Promise<any> {
    try {
      this.logger.debug('Processing message', {
        messageId: message.id,
        type: message.type,
      });

      // Basic message processing
      this.stats.messagesProcessed++;
      return { success: true, processed: true };
    } catch (error) {
      this.stats.errors++;
      this.logger.error(
        'Error occurred',
        error instanceof Error ? error : new Error('Unknown error'),
        {}
      );
      throw error;
    }
  }

  registerHandler(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler);
    this.logger.debug('Registered message handler', { type });
  }

  unregisterHandler(type: string): void {
    this.handlers.delete(type);
    this.logger.debug('Unregistered message handler', { type });
  }

  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  clearHandlers(): void {
    this.handlers.clear();
    this.logger.debug('Cleared all message handlers');
  }

  getStats() {
    return { ...this.stats };
  }

  createMessage(type: string, implantId: string, payload: any): ProtocolMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      implantId,
      payload,
      timestamp: new Date(),
      encrypted: false,
    };
  }
}
