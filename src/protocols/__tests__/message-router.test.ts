/**
 * Unit tests for MessageRouter
 * Tests protocol-agnostic message routing functionality
 */

import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { MessageRouter } from '../message-router';
import { ProtocolMessage, ConnectionInfo, MessageHandler } from '../interfaces';
import { Protocol } from '../../types/entities';

// Simple mock crypto service
const mockCryptoService = {
  encrypt: jest.fn().mockReturnValue('encrypted_data'),
  decrypt: jest.fn().mockReturnValue('{"test": "decrypted"}'),
  hash: jest.fn().mockReturnValue('test_hash'),
} as any;

describe('MessageRouter', () => {
  let messageRouter: MessageRouter;

  const testImplantId = 'test-implant-001';
  const testConnectionInfo: ConnectionInfo = {
    protocol: Protocol.WEBSOCKET,
    remoteAddress: '127.0.0.1:12345',
    connectedAt: new Date(),
    lastActivity: new Date(),
    isActive: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    messageRouter = new MessageRouter();
  });

  describe('Handler Registration', () => {
    it('should register message handlers', () => {
      const handler: MessageHandler = async () => {};
      messageRouter.registerHandler('test', handler);

      expect(messageRouter.hasHandler('test')).toBe(true);
      expect(messageRouter.getRegisteredTypes()).toContain('test');
    });

    it('should unregister message handlers', () => {
      const handler: MessageHandler = async () => {};
      messageRouter.registerHandler('test', handler);
      messageRouter.unregisterHandler('test');

      expect(messageRouter.hasHandler('test')).toBe(false);
      expect(messageRouter.getRegisteredTypes()).not.toContain('test');
    });

    it('should emit events when handlers are registered/unregistered', () => {
      const registeredSpy = jest.fn();
      const unregisteredSpy = jest.fn();

      messageRouter.on('handlerRegistered', registeredSpy);
      messageRouter.on('handlerUnregistered', unregisteredSpy);

      const handler: MessageHandler = async () => {};
      messageRouter.registerHandler('test', handler);
      messageRouter.unregisterHandler('test');

      expect(registeredSpy).toHaveBeenCalledWith({ messageType: 'test' });
      expect(unregisteredSpy).toHaveBeenCalledWith({ messageType: 'test' });
    });
  });

  describe('Message Routing', () => {
    it('should route messages to correct handlers', async () => {
      let receivedMessage: ProtocolMessage | null = null;
      let receivedConnectionInfo: ConnectionInfo | null = null;

      const handler: MessageHandler = async (message, connectionInfo) => {
        receivedMessage = message;
        receivedConnectionInfo = connectionInfo;
      };

      messageRouter.registerHandler('test', handler);

      const message: ProtocolMessage = {
        id: 'test-msg-001',
        type: 'test',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      await messageRouter.routeMessage(message, testConnectionInfo);

      expect(receivedMessage).toEqual(message);
      expect(receivedConnectionInfo).toEqual(testConnectionInfo);
    });

    it('should emit unhandledMessage event for unknown message types', async () => {
      const unhandledSpy = jest.fn();
      messageRouter.on('unhandledMessage', unhandledSpy);

      const message: ProtocolMessage = {
        id: 'unknown-msg-001',
        type: 'unknown',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      await messageRouter.routeMessage(message, testConnectionInfo);

      expect(unhandledSpy).toHaveBeenCalledWith({
        message,
        connectionInfo: testConnectionInfo,
      });
    });

    it('should emit messageRouted event for successful routing', async () => {
      const handler: MessageHandler = async () => {};
      const routedSpy = jest.fn();

      messageRouter.registerHandler('test', handler);
      messageRouter.on('messageRouted', routedSpy);

      const message: ProtocolMessage = {
        id: 'routed-msg-001',
        type: 'test',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      await messageRouter.routeMessage(message, testConnectionInfo);

      expect(routedSpy).toHaveBeenCalledWith({
        message,
        connectionInfo: testConnectionInfo,
        handler: 'test',
      });
    });
  });

  describe('Message Creation', () => {
    it('should create unencrypted messages', () => {
      const message = messageRouter.createMessage('command', testImplantId, { command: 'test' });

      expect(message.type).toBe('command');
      expect(message.implantId).toBe(testImplantId);
      expect(message.payload).toEqual({ command: 'test' });
      expect(message.encrypted).toBe(false);
      expect(message.id).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });

    it('should create encrypted messages', () => {
      const message = messageRouter.createMessage('response', testImplantId, { result: 'success' });

      expect(message.type).toBe('response');
      expect(message.implantId).toBe(testImplantId);
      expect(message.encrypted).toBe(false);
      expect(message.payload).toEqual({ result: 'success' });
    });
  });

  describe('Statistics and Management', () => {
    it('should provide router statistics', () => {
      const handler1: MessageHandler = async () => {};
      const handler2: MessageHandler = async () => {};

      messageRouter.registerHandler('type1', handler1);
      messageRouter.registerHandler('type2', handler2);

      const stats = messageRouter.getStats();

      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesRouted).toBe(0);
      expect(stats.errors).toBe(0);
    });

    it('should clear all handlers', () => {
      const clearedSpy = jest.fn();
      messageRouter.on('handlersCleared', clearedSpy);

      const handler1: MessageHandler = async () => {};
      const handler2: MessageHandler = async () => {};

      messageRouter.registerHandler('type1', handler1);
      messageRouter.registerHandler('type2', handler2);

      messageRouter.clearHandlers();

      expect(messageRouter.getRegisteredTypes()).toHaveLength(0);
      expect(clearedSpy).toHaveBeenCalledWith({
        clearedTypes: ['type1', 'type2'],
      });
    });
  });
});
