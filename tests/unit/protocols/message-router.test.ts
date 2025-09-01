/**
 * Unit tests for MessageRouter
 */

import { MessageRouter } from '../../../src/protocols/message-router';
import { CryptoService } from '../../../src/core/crypto/crypto.service';
import { Protocol } from '../../../src/types/entities';
import { Logger } from '../../../src/utils/logger';
import type {
  ProtocolMessage,
  ConnectionInfo,
  MessageHandler,
} from '../../../src/protocols/interfaces';

// Mock dependencies
jest.mock('../../../src/core/crypto/crypto.service');
jest.mock('../../../src/utils/logger');

const MockedCryptoService = CryptoService as jest.MockedClass<typeof CryptoService>;
const MockedLogger = Logger as jest.MockedClass<typeof Logger>;

describe('MessageRouter', () => {
  let messageRouter: MessageRouter;
  let mockCryptoService: jest.Mocked<CryptoService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockCryptoService = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      hash: jest.fn(),
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getInstance: jest.fn(),
    } as any;

    MockedCryptoService.mockImplementation(() => mockCryptoService);
    MockedLogger.getInstance.mockReturnValue(mockLogger);

    messageRouter = new MessageRouter(mockCryptoService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided crypto service', () => {
      expect(messageRouter).toBeInstanceOf(MessageRouter);
    });

    it('should initialize with default crypto service if none provided', () => {
      const router = new MessageRouter();
      expect(router).toBeInstanceOf(MessageRouter);
    });
  });

  describe('registerHandler', () => {
    it('should register message handler', () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-message';

      messageRouter.registerHandler(messageType, handler);

      expect(messageRouter.hasHandler(messageType)).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Message handler registered', { messageType });
    });

    it('should emit handlerRegistered event', () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-message';
      const eventSpy = jest.fn();

      messageRouter.on('handlerRegistered', eventSpy);
      messageRouter.registerHandler(messageType, handler);

      expect(eventSpy).toHaveBeenCalledWith({ messageType });
    });

    it('should overwrite existing handler', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();
      const messageType = 'test-message';

      messageRouter.registerHandler(messageType, handler1);
      messageRouter.registerHandler(messageType, handler2);

      expect(messageRouter.hasHandler(messageType)).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('unregisterHandler', () => {
    it('should unregister existing handler', () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-message';

      messageRouter.registerHandler(messageType, handler);
      messageRouter.unregisterHandler(messageType);

      expect(messageRouter.hasHandler(messageType)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Message handler unregistered', { messageType });
    });

    it('should emit handlerUnregistered event', () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-message';
      const eventSpy = jest.fn();

      messageRouter.registerHandler(messageType, handler);
      messageRouter.on('handlerUnregistered', eventSpy);
      messageRouter.unregisterHandler(messageType);

      expect(eventSpy).toHaveBeenCalledWith({ messageType });
    });

    it('should do nothing for non-existent handler', () => {
      messageRouter.unregisterHandler('non-existent');

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return empty array when no handlers registered', () => {
      const types = messageRouter.getRegisteredTypes();

      expect(types).toEqual([]);
    });

    it('should return list of registered message types', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();

      messageRouter.registerHandler('type1', handler1);
      messageRouter.registerHandler('type2', handler2);

      const types = messageRouter.getRegisteredTypes();

      expect(types).toHaveLength(2);
      expect(types).toContain('type1');
      expect(types).toContain('type2');
    });
  });

  describe('hasHandler', () => {
    it('should return true for registered handler', () => {
      const handler: MessageHandler = jest.fn();
      messageRouter.registerHandler('test-type', handler);

      expect(messageRouter.hasHandler('test-type')).toBe(true);
    });

    it('should return false for unregistered handler', () => {
      expect(messageRouter.hasHandler('non-existent')).toBe(false);
    });
  });

  describe('routeMessage', () => {
    let connectionInfo: ConnectionInfo;

    beforeEach(() => {
      connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };
    });

    it('should route unencrypted message to handler', async () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-command';

      messageRouter.registerHandler(messageType, handler);

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(handler).toHaveBeenCalledWith(message, connectionInfo);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message routed successfully',
        expect.objectContaining({
          messageId: 'msg-1',
          type: messageType,
          handler: messageType,
        })
      );
    });

    it('should decrypt encrypted message before routing', async () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-command';

      messageRouter.registerHandler(messageType, handler);

      const encryptedPayload = 'encrypted-data';
      const decryptedPayload = { command: 'whoami' };

      mockCryptoService.decrypt.mockReturnValue(JSON.stringify(decryptedPayload));

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: encryptedPayload,
        encrypted: true,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(encryptedPayload, 'test-implant');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: decryptedPayload,
          encrypted: false,
        }),
        connectionInfo
      );
    });

    it('should validate message integrity when checksum present', async () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-command';

      messageRouter.registerHandler(messageType, handler);

      const payload = { command: 'whoami' };
      const checksum = 'valid-checksum';

      mockCryptoService.hash.mockReturnValue(checksum);

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload,
        encrypted: false,
        checksum,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(mockCryptoService.hash).toHaveBeenCalledWith(JSON.stringify(payload));
      expect(handler).toHaveBeenCalledWith(message, connectionInfo);
    });

    it('should throw error for invalid checksum', async () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-command';

      messageRouter.registerHandler(messageType, handler);

      const payload = { command: 'whoami' };
      const checksum = 'invalid-checksum';

      mockCryptoService.hash.mockReturnValue('different-checksum');

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload,
        encrypted: false,
        checksum,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow(
        'Message integrity validation failed'
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('should emit unhandledMessage event for unknown message type', async () => {
      const eventSpy = jest.fn();
      messageRouter.on('unhandledMessage', eventSpy);

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: 'unknown-type',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(eventSpy).toHaveBeenCalledWith({
        message,
        connectionInfo,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No handler found for message type',
        expect.objectContaining({
          messageType: 'unknown-type',
          messageId: 'msg-1',
        })
      );
    });

    it('should emit messageRouted event on successful routing', async () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-command';
      const eventSpy = jest.fn();

      messageRouter.registerHandler(messageType, handler);
      messageRouter.on('messageRouted', eventSpy);

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(eventSpy).toHaveBeenCalledWith({
        message,
        connectionInfo,
        handler: messageType,
      });
    });

    it('should emit routingError event on handler error', async () => {
      const error = new Error('Handler failed');
      const handler: MessageHandler = jest.fn().mockRejectedValue(error);
      const messageType = 'test-command';
      const eventSpy = jest.fn();

      messageRouter.registerHandler(messageType, handler);
      messageRouter.on('routingError', eventSpy);

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow(
        'Handler failed'
      );

      expect(eventSpy).toHaveBeenCalledWith({
        message,
        connectionInfo,
        error: 'Handler failed',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to route message',
        expect.objectContaining({
          error: 'Handler failed',
          messageId: 'msg-1',
          type: messageType,
        })
      );
    });

    it('should handle decryption errors', async () => {
      const handler: MessageHandler = jest.fn();
      const messageType = 'test-command';
      const eventSpy = jest.fn();

      messageRouter.registerHandler(messageType, handler);
      messageRouter.on('routingError', eventSpy);

      const decryptionError = new Error('Decryption failed');
      mockCryptoService.decrypt.mockImplementation(() => {
        throw decryptionError;
      });

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: 'encrypted-data',
        encrypted: true,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow(
        'Decryption failed'
      );

      expect(handler).not.toHaveBeenCalled();
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('createMessage', () => {
    beforeEach(() => {
      // Mock message ID generation
      jest.spyOn(Date, 'now').mockReturnValue(1234567890000);
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should create unencrypted message', () => {
      const payload = { command: 'whoami' };
      const message = messageRouter.createMessage('command', 'test-implant', payload, false);

      expect(message).toMatchObject({
        id: expect.stringMatching(/^msg_\d+_[a-z0-9]+$/),
        type: 'command',
        implantId: 'test-implant',
        payload,
        encrypted: false,
      });

      expect(message.timestamp).toBeInstanceOf(Date);
    });

    it('should create encrypted message by default', () => {
      const payload = { command: 'whoami' };
      const encryptedPayload = 'encrypted-data';
      const checksum = 'message-checksum';

      mockCryptoService.encrypt.mockReturnValue(encryptedPayload);
      mockCryptoService.hash.mockReturnValue(checksum);

      const message = messageRouter.createMessage('command', 'test-implant', payload);

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        JSON.stringify(payload),
        'test-implant'
      );
      expect(mockCryptoService.hash).toHaveBeenCalledWith(JSON.stringify(payload));

      expect(message).toMatchObject({
        type: 'command',
        implantId: 'test-implant',
        payload: encryptedPayload,
        encrypted: true,
        checksum,
      });
    });

    it('should create different message types', () => {
      const payload = { status: 'alive' };

      const commandMessage = messageRouter.createMessage('command', 'test-implant', payload, false);
      const responseMessage = messageRouter.createMessage(
        'response',
        'test-implant',
        payload,
        false
      );
      const heartbeatMessage = messageRouter.createMessage(
        'heartbeat',
        'test-implant',
        payload,
        false
      );
      const registrationMessage = messageRouter.createMessage(
        'registration',
        'test-implant',
        payload,
        false
      );

      expect(commandMessage.type).toBe('command');
      expect(responseMessage.type).toBe('response');
      expect(heartbeatMessage.type).toBe('heartbeat');
      expect(registrationMessage.type).toBe('registration');
    });

    it('should handle encryption errors', () => {
      const payload = { command: 'whoami' };
      const encryptionError = new Error('Encryption failed');

      mockCryptoService.encrypt.mockImplementation(() => {
        throw encryptionError;
      });

      expect(() => {
        messageRouter.createMessage('command', 'test-implant', payload, true);
      }).toThrow('Encryption failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to encrypt message',
        expect.objectContaining({
          error: 'Encryption failed',
        })
      );
    });
  });

  describe('getStats', () => {
    it('should return router statistics', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();

      messageRouter.registerHandler('type1', handler1);
      messageRouter.registerHandler('type2', handler2);

      const stats = messageRouter.getStats();

      expect(stats).toEqual({
        handlersRegistered: 2,
        messageTypes: ['type1', 'type2'],
      });
    });

    it('should return empty stats when no handlers registered', () => {
      const stats = messageRouter.getStats();

      expect(stats).toEqual({
        handlersRegistered: 0,
        messageTypes: [],
      });
    });
  });

  describe('clearHandlers', () => {
    it('should clear all registered handlers', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();

      messageRouter.registerHandler('type1', handler1);
      messageRouter.registerHandler('type2', handler2);

      expect(messageRouter.getRegisteredTypes()).toHaveLength(2);

      messageRouter.clearHandlers();

      expect(messageRouter.getRegisteredTypes()).toHaveLength(0);
      expect(messageRouter.hasHandler('type1')).toBe(false);
      expect(messageRouter.hasHandler('type2')).toBe(false);
    });

    it('should emit handlersCleared event', () => {
      const handler1: MessageHandler = jest.fn();
      const handler2: MessageHandler = jest.fn();
      const eventSpy = jest.fn();

      messageRouter.registerHandler('type1', handler1);
      messageRouter.registerHandler('type2', handler2);
      messageRouter.on('handlersCleared', eventSpy);

      messageRouter.clearHandlers();

      expect(eventSpy).toHaveBeenCalledWith({
        clearedTypes: ['type1', 'type2'],
      });

      expect(mockLogger.info).toHaveBeenCalledWith('All message handlers cleared', {
        clearedTypes: ['type1', 'type2'],
      });
    });

    it('should do nothing when no handlers registered', () => {
      const eventSpy = jest.fn();
      messageRouter.on('handlersCleared', eventSpy);

      messageRouter.clearHandlers();

      expect(eventSpy).toHaveBeenCalledWith({
        clearedTypes: [],
      });
    });
  });

  describe('message ID generation', () => {
    it('should generate unique message IDs', () => {
      const payload = { test: 'data' };

      const message1 = messageRouter.createMessage('command', 'implant1', payload, false);
      const message2 = messageRouter.createMessage('command', 'implant2', payload, false);

      expect(message1.id).not.toBe(message2.id);
      expect(message1.id).toMatch(/^msg_\d+_[a-z0-9]+$/);
      expect(message2.id).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });
  });

  describe('error handling edge cases', () => {
    it('should handle JSON parsing errors in decryption', async () => {
      const handler: MessageHandler = jest.fn();
      messageRouter.registerHandler('test-type', handler);

      mockCryptoService.decrypt.mockReturnValue('invalid-json{');

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: 'test-type',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: 'encrypted-data',
        encrypted: true,
      };

      const connectionInfo: ConnectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle checksum validation errors', async () => {
      const handler: MessageHandler = jest.fn();
      messageRouter.registerHandler('test-type', handler);

      mockCryptoService.hash.mockImplementation(() => {
        throw new Error('Hash calculation failed');
      });

      const message: ProtocolMessage = {
        id: 'msg-1',
        type: 'test-type',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { test: 'data' },
        encrypted: false,
        checksum: 'some-checksum',
      };

      const connectionInfo: ConnectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to validate message integrity',
        expect.objectContaining({
          error: 'Hash calculation failed',
          messageId: 'msg-1',
        })
      );
    });
  });
});
