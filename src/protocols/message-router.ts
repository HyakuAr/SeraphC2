/**
 * Protocol-agnostic message routing system
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { IMessageRouter, ProtocolMessage, ConnectionInfo } from './interfaces';
import { Logger } from '../utils/logger';
import { CryptoService } from '../core/crypto/crypto.service';

import type { MessageHandler } from './interfaces';

export class MessageRouter extends EventEmitter implements IMessageRouter {
  private handlers: Map<string, MessageHandler>;
  private logger: Logger;
  private cryptoService: CryptoService;

  constructor(cryptoService?: CryptoService) {
    super();
    this.handlers = new Map();
    this.logger = Logger.getInstance();
    this.cryptoService = cryptoService || new CryptoService();
  }

  /**
   * Route incoming message to appropriate handler
   */
  async routeMessage(message: ProtocolMessage, connectionInfo: ConnectionInfo): Promise<void> {
    try {
      this.logger.debug('Routing message', {
        messageId: message.id,
        type: message.type,
        implantId: message.implantId,
        protocol: connectionInfo.protocol,
        encrypted: message.encrypted,
      });

      // Decrypt message if encrypted
      let processedMessage = message;
      if (message.encrypted) {
        processedMessage = await this.decryptMessage(message);
      }

      // Validate message integrity
      if (processedMessage.checksum) {
        const isValid = await this.validateMessageIntegrity(processedMessage);
        if (!isValid) {
          throw new Error('Message integrity validation failed');
        }
      }

      // Find and execute handler
      const handler = this.handlers.get(processedMessage.type);
      if (!handler) {
        this.logger.warn('No handler found for message type', {
          messageType: processedMessage.type,
          messageId: processedMessage.id,
        });

        this.emit('unhandledMessage', {
          message: processedMessage,
          connectionInfo,
        });
        return;
      }

      // Execute handler
      await handler(processedMessage, connectionInfo);

      this.emit('messageRouted', {
        message: processedMessage,
        connectionInfo,
        handler: processedMessage.type,
      });

      this.logger.debug('Message routed successfully', {
        messageId: processedMessage.id,
        type: processedMessage.type,
        handler: processedMessage.type,
      });
    } catch (error) {
      this.logger.error('Failed to route message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: message.id,
        type: message.type,
        implantId: message.implantId,
        protocol: connectionInfo.protocol,
      });

      this.emit('routingError', {
        message,
        connectionInfo,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Register message handler for specific message type
   */
  registerHandler(messageType: string, handler: MessageHandler): void {
    this.handlers.set(messageType, handler);

    this.logger.info('Message handler registered', {
      messageType,
    });

    this.emit('handlerRegistered', {
      messageType,
    });
  }

  /**
   * Unregister message handler
   */
  unregisterHandler(messageType: string): void {
    const existed = this.handlers.delete(messageType);

    if (existed) {
      this.logger.info('Message handler unregistered', {
        messageType,
      });

      this.emit('handlerUnregistered', {
        messageType,
      });
    }
  }

  /**
   * Get all registered message types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if handler exists for message type
   */
  hasHandler(messageType: string): boolean {
    return this.handlers.has(messageType);
  }

  /**
   * Create a protocol message
   */
  createMessage(
    type: 'command' | 'response' | 'heartbeat' | 'registration',
    implantId: string,
    payload: any,
    encrypt: boolean = true
  ): ProtocolMessage {
    const message: ProtocolMessage = {
      id: this.generateMessageId(),
      type,
      implantId,
      timestamp: new Date(),
      payload,
      encrypted: false,
    };

    if (encrypt) {
      return this.encryptMessage(message);
    }

    return message;
  }

  /**
   * Encrypt message payload
   */
  private encryptMessage(message: ProtocolMessage): ProtocolMessage {
    try {
      const serialized = JSON.stringify(message.payload);
      const encrypted = this.cryptoService.encrypt(serialized, message.implantId);

      const encryptedMessage: ProtocolMessage = {
        ...message,
        payload: encrypted,
        encrypted: true,
        checksum: this.calculateChecksum(serialized),
      };

      return encryptedMessage;
    } catch (error) {
      this.logger.error('Failed to encrypt message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: message.id,
      });
      throw error;
    }
  }

  /**
   * Decrypt message payload
   */
  private async decryptMessage(message: ProtocolMessage): Promise<ProtocolMessage> {
    try {
      const decrypted = this.cryptoService.decrypt(message.payload, message.implantId);
      const payload = JSON.parse(decrypted);

      return {
        ...message,
        payload,
        encrypted: false,
      };
    } catch (error) {
      this.logger.error('Failed to decrypt message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: message.id,
      });
      throw error;
    }
  }

  /**
   * Validate message integrity using checksum
   */
  private async validateMessageIntegrity(message: ProtocolMessage): Promise<boolean> {
    if (!message.checksum) {
      return true; // No checksum to validate
    }

    try {
      const serialized = JSON.stringify(message.payload);
      const calculatedChecksum = this.calculateChecksum(serialized);

      return calculatedChecksum === message.checksum;
    } catch (error) {
      this.logger.error('Failed to validate message integrity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: message.id,
      });
      return false;
    }
  }

  /**
   * Calculate message checksum
   */
  private calculateChecksum(data: string): string {
    return this.cryptoService.hash(data);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get router statistics
   */
  getStats(): {
    handlersRegistered: number;
    messageTypes: string[];
  } {
    return {
      handlersRegistered: this.handlers.size,
      messageTypes: Array.from(this.handlers.keys()),
    };
  }

  /**
   * Clear all handlers
   */
  clearHandlers(): void {
    const types = Array.from(this.handlers.keys());
    this.handlers.clear();

    this.logger.info('All message handlers cleared', {
      clearedTypes: types,
    });

    this.emit('handlersCleared', {
      clearedTypes: types,
    });
  }
}
