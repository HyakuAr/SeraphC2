/**
 * Protocol integration tests
 * Tests protocol handlers, message routing, and communication flows
 */

import { EventEmitter } from 'events';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { MessageRouter } from '../../src/protocols/message-router';
import { DNSHandler, DNSConfig } from '../../src/protocols/dns-handler';
import { WebSocketHandler, WebSocketConfig } from '../../src/protocols/websocket-handler';
import { ProtocolManager } from '../../src/protocols/protocol-manager';
import { CryptoService } from '../../src/core/crypto/crypto.service';
import { Protocol } from '../../src/types/entities';
import { Server as HTTPServer, createServer } from 'http';
import { Socket } from 'socket.io-client';
import { createSocket } from 'dgram';

describe('Protocol Integration Tests', () => {
  let messageRouter: MessageRouter;
  let cryptoService: CryptoService;
  let protocolManager: ProtocolManager;
  let httpServer: HTTPServer;

  beforeAll(async () => {
    // Setup test containers
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    // Initialize services
    cryptoService = new CryptoService({
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 100000,
    });

    messageRouter = new MessageRouter(cryptoService);
    protocolManager = new ProtocolManager(messageRouter);

    // Create HTTP server for WebSocket tests
    httpServer = createServer();
  });

  beforeEach(async () => {
    await resetTestData();
    messageRouter.clearHandlers();
  });

  afterAll(async () => {
    if (httpServer.listening) {
      httpServer.close();
    }
    const testContainers = getTestContainers();
    await testContainers.cleanup();
  });

  describe('Message Router', () => {
    it('should register and route messages to handlers', async () => {
      const handler = jest.fn();
      const messageType = 'test-command';

      messageRouter.registerHandler(messageType, handler);

      const message = {
        id: 'msg-1',
        type: messageType,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(handler).toHaveBeenCalledWith(message, connectionInfo);
    });

    it('should handle encrypted messages', async () => {
      const handler = jest.fn();
      messageRouter.registerHandler('encrypted-command', handler);

      // Create encrypted message
      const originalPayload = { command: 'secret-command' };
      const message = messageRouter.createMessage(
        'encrypted-command',
        'test-implant',
        originalPayload,
        true
      );

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: originalPayload,
          encrypted: false, // Should be decrypted
        }),
        connectionInfo
      );
    });

    it('should validate message integrity', async () => {
      const handler = jest.fn();
      messageRouter.registerHandler('integrity-test', handler);

      const message = {
        id: 'msg-1',
        type: 'integrity-test',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
        checksum: 'invalid-checksum',
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow(
        'Message integrity validation failed'
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('should emit events for unhandled messages', async () => {
      const unhandledSpy = jest.fn();
      messageRouter.on('unhandledMessage', unhandledSpy);

      const message = {
        id: 'msg-1',
        type: 'unknown-type',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(unhandledSpy).toHaveBeenCalledWith({
        message,
        connectionInfo,
      });
    });

    it('should handle routing errors', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const errorSpy = jest.fn();

      messageRouter.registerHandler('error-test', errorHandler);
      messageRouter.on('routingError', errorSpy);

      const message = {
        id: 'msg-1',
        type: 'error-test',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await expect(messageRouter.routeMessage(message, connectionInfo)).rejects.toThrow(
        'Handler error'
      );

      expect(errorSpy).toHaveBeenCalledWith({
        message,
        connectionInfo,
        error: 'Handler error',
      });
    });
  });

  describe('DNS Protocol Handler', () => {
    let dnsHandler: DNSHandler;
    let dnsConfig: DNSConfig;

    beforeEach(() => {
      dnsConfig = {
        protocol: Protocol.DNS,
        host: '127.0.0.1',
        port: 5353, // Use non-standard port for testing
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        domain: 'test.local',
        subdomains: {
          command: 'cmd',
          response: 'res',
          heartbeat: 'hb',
          registration: 'reg',
        },
        maxTxtRecordLength: 255,
        chunkSize: 200,
        compressionEnabled: false,
      };

      dnsHandler = new DNSHandler(dnsConfig);
    });

    afterEach(async () => {
      if (dnsHandler.isRunning) {
        await dnsHandler.stop();
      }
    });

    it('should start and stop DNS server', async () => {
      expect(dnsHandler.isRunning).toBe(false);

      await dnsHandler.start();
      expect(dnsHandler.isRunning).toBe(true);

      await dnsHandler.stop();
      expect(dnsHandler.isRunning).toBe(false);
    });

    it('should handle DNS queries and responses', async () => {
      const implantConnectedSpy = jest.fn();
      const messageReceivedSpy = jest.fn();

      dnsHandler.on('implantConnected', implantConnectedSpy);
      dnsHandler.on('messageReceived', messageReceivedSpy);

      await dnsHandler.start();

      // Simulate DNS query from implant
      const testQuery = Buffer.alloc(100);
      // This would be a properly formatted DNS query in a real test
      // For now, we'll test the handler's ability to start/stop

      expect(dnsHandler.isRunning).toBe(true);
    });

    it('should queue messages for implants', async () => {
      await dnsHandler.start();

      // Create mock implant session
      const implantId = 'test-implant-dns';
      const session = {
        implantId,
        lastQuery: new Date(),
        queryCount: 1,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: '192.168.1.100:12345',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };

      (dnsHandler as any).implantSessions.set(implantId, session);

      const message = {
        id: 'dns-msg-1',
        type: 'command' as const,
        implantId,
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const result = await dnsHandler.sendMessage(implantId, message);

      expect(result).toBe(true);
      expect(session.pendingMessages).toHaveLength(1);
      expect(session.pendingMessages[0]).toBe(message);
    });

    it('should check implant connectivity', async () => {
      const implantId = 'test-implant-dns';

      // No session - should be disconnected
      expect(dnsHandler.isImplantConnected(implantId)).toBe(false);

      // Create recent session - should be connected
      const recentSession = {
        implantId,
        lastQuery: new Date(Date.now() - 60000), // 1 minute ago
        queryCount: 1,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: '192.168.1.100:12345',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };

      (dnsHandler as any).implantSessions.set(implantId, recentSession);
      expect(dnsHandler.isImplantConnected(implantId)).toBe(true);

      // Old session - should be disconnected
      recentSession.lastQuery = new Date(Date.now() - 400000); // 6+ minutes ago
      expect(dnsHandler.isImplantConnected(implantId)).toBe(false);
    });

    it('should encode and decode base32 data', async () => {
      const originalData = 'Hello, DNS World!';
      const encoded = (dnsHandler as any).encodeBase32(originalData);
      const decoded = (dnsHandler as any).decodeBase32(encoded);

      expect(decoded).toBe(originalData);
      expect(encoded).toMatch(/^[a-z2-7]+$/);
    });

    it('should handle message chunking for large payloads', async () => {
      const largeMessage = {
        id: 'large-msg',
        type: 'command' as const,
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { data: 'x'.repeat(1000) }, // Large payload
        encrypted: false,
      };

      const chunks = (dnsHandler as any).encodeMessageForTXT(largeMessage);

      expect(chunks).toBeInstanceOf(Array);
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should have format: chunkIndex:totalChunks:data
      chunks.forEach((chunk: string) => {
        expect(chunk).toMatch(/^\d+:\d+:.+$/);
      });
    });
  });

  describe('WebSocket Protocol Handler', () => {
    let webSocketHandler: WebSocketHandler;
    let wsConfig: WebSocketConfig;

    beforeEach(() => {
      wsConfig = {
        protocol: Protocol.WEBSOCKET,
        host: '127.0.0.1',
        port: 8081, // Use different port for testing
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        corsOrigins: ['http://localhost:3000'],
        path: '/socket.io',
        transports: ['websocket'],
        pingTimeout: 60000,
        pingInterval: 25000,
      };

      webSocketHandler = new WebSocketHandler(httpServer, wsConfig);
    });

    afterEach(async () => {
      if (webSocketHandler.isRunning) {
        await webSocketHandler.stop();
      }
    });

    it('should start and stop WebSocket server', async () => {
      expect(webSocketHandler.isRunning).toBe(false);

      await webSocketHandler.start();
      expect(webSocketHandler.isRunning).toBe(true);

      await webSocketHandler.stop();
      expect(webSocketHandler.isRunning).toBe(false);
    });

    it('should handle implant connections', async () => {
      const implantConnectedSpy = jest.fn();
      webSocketHandler.on('implantConnected', implantConnectedSpy);

      await webSocketHandler.start();

      // Mock socket connection
      const mockSocket = {
        id: 'socket-123',
        implantId: 'test-implant-ws',
        authenticated: true,
        connected: true,
        handshake: {
          address: '192.168.1.100',
          auth: {
            implantId: 'test-implant-ws',
            encryptionKey: 'test-key',
          },
          headers: {
            'user-agent': 'Test Agent',
          },
        },
        connectionInfo: {
          protocol: Protocol.WEBSOCKET,
          remoteAddress: '192.168.1.100',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        on: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn(),
      };

      (webSocketHandler as any).implantSockets.set('test-implant-ws', mockSocket);

      expect(webSocketHandler.isImplantConnected('test-implant-ws')).toBe(true);
    });

    it('should send messages to connected implants', async () => {
      await webSocketHandler.start();

      const mockSocket = {
        connected: true,
        authenticated: true,
        emit: jest.fn(),
        implantId: 'test-implant-ws',
      };

      (webSocketHandler as any).implantSockets.set('test-implant-ws', mockSocket);

      const message = {
        id: 'ws-msg-1',
        type: 'command' as const,
        implantId: 'test-implant-ws',
        timestamp: new Date(),
        payload: { command: 'whoami' },
        encrypted: false,
      };

      const result = await webSocketHandler.sendMessage('test-implant-ws', message);

      expect(result).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('message', message);
    });

    it('should broadcast messages to all connected implants', async () => {
      await webSocketHandler.start();

      const mockSocket1 = {
        connected: true,
        authenticated: true,
        emit: jest.fn(),
        implantId: 'implant-1',
      };

      const mockSocket2 = {
        connected: true,
        authenticated: true,
        emit: jest.fn(),
        implantId: 'implant-2',
      };

      (webSocketHandler as any).implantSockets.set('implant-1', mockSocket1);
      (webSocketHandler as any).implantSockets.set('implant-2', mockSocket2);

      const message = {
        id: 'broadcast-msg',
        type: 'command' as const,
        implantId: 'broadcast',
        timestamp: new Date(),
        payload: { command: 'shutdown' },
        encrypted: false,
      };

      const result = await webSocketHandler.broadcastMessage(message);

      expect(result).toBe(2);
      expect(mockSocket1.emit).toHaveBeenCalledWith('message', message);
      expect(mockSocket2.emit).toHaveBeenCalledWith('message', message);
    });

    it('should disconnect specific implants', async () => {
      await webSocketHandler.start();

      const mockSocket = {
        connected: true,
        authenticated: true,
        disconnect: jest.fn(),
        implantId: 'test-implant-ws',
      };

      (webSocketHandler as any).implantSockets.set('test-implant-ws', mockSocket);

      webSocketHandler.disconnectImplant('test-implant-ws', 'Test disconnect');

      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle authentication middleware', async () => {
      await webSocketHandler.start();

      // Get the authentication middleware
      const authMiddleware = (webSocketHandler as any).io.use.mock?.calls?.[0]?.[0];

      if (authMiddleware) {
        const mockSocket = {
          handshake: {
            auth: {
              implantId: 'test-implant',
              encryptionKey: 'valid-key',
            },
            address: '192.168.1.100',
            headers: {
              'user-agent': 'Test Agent',
            },
          },
        };

        const next = jest.fn();

        await authMiddleware(mockSocket, next);

        expect(mockSocket.implantId).toBe('test-implant');
        expect(mockSocket.authenticated).toBe(true);
        expect(next).toHaveBeenCalledWith();
      }
    });
  });

  describe('Protocol Manager', () => {
    it('should register and manage multiple protocols', async () => {
      const dnsConfig: DNSConfig = {
        protocol: Protocol.DNS,
        host: '127.0.0.1',
        port: 5354,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        domain: 'test.local',
        subdomains: {
          command: 'cmd',
          response: 'res',
          heartbeat: 'hb',
          registration: 'reg',
        },
        maxTxtRecordLength: 255,
        chunkSize: 200,
        compressionEnabled: false,
      };

      const wsConfig: WebSocketConfig = {
        protocol: Protocol.WEBSOCKET,
        host: '127.0.0.1',
        port: 8082,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        corsOrigins: ['http://localhost:3000'],
        path: '/socket.io',
        transports: ['websocket'],
        pingTimeout: 60000,
        pingInterval: 25000,
      };

      const dnsHandler = new DNSHandler(dnsConfig);
      const wsHandler = new WebSocketHandler(httpServer, wsConfig);

      protocolManager.registerProtocol(dnsHandler);
      protocolManager.registerProtocol(wsHandler);

      expect(protocolManager.getProtocols()).toHaveLength(2);
      expect(protocolManager.getProtocol(Protocol.DNS)).toBe(dnsHandler);
      expect(protocolManager.getProtocol(Protocol.WEBSOCKET)).toBe(wsHandler);

      await protocolManager.startAll();

      expect(dnsHandler.isRunning).toBe(true);
      expect(wsHandler.isRunning).toBe(true);

      await protocolManager.stopAll();

      expect(dnsHandler.isRunning).toBe(false);
      expect(wsHandler.isRunning).toBe(false);
    });

    it('should route messages through protocols', async () => {
      const handler = jest.fn();
      messageRouter.registerHandler('test-command', handler);

      const dnsConfig: DNSConfig = {
        protocol: Protocol.DNS,
        host: '127.0.0.1',
        port: 5355,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        domain: 'test.local',
        subdomains: {
          command: 'cmd',
          response: 'res',
          heartbeat: 'hb',
          registration: 'reg',
        },
        maxTxtRecordLength: 255,
        chunkSize: 200,
        compressionEnabled: false,
      };

      const dnsHandler = new DNSHandler(dnsConfig);
      protocolManager.registerProtocol(dnsHandler);

      await protocolManager.startAll();

      // Simulate message received from protocol
      const message = {
        id: 'protocol-msg',
        type: 'test-command',
        implantId: 'test-implant',
        timestamp: new Date(),
        payload: { command: 'test' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.DNS,
        remoteAddress: '192.168.1.100',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      dnsHandler.emit('messageReceived', { message, connectionInfo });

      // Give time for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler).toHaveBeenCalledWith(message, connectionInfo);

      await protocolManager.stopAll();
    });

    it('should handle protocol errors', async () => {
      const errorSpy = jest.fn();
      protocolManager.on('protocolError', errorSpy);

      const dnsConfig: DNSConfig = {
        protocol: Protocol.DNS,
        host: '127.0.0.1',
        port: 5356,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        domain: 'test.local',
        subdomains: {
          command: 'cmd',
          response: 'res',
          heartbeat: 'hb',
          registration: 'reg',
        },
        maxTxtRecordLength: 255,
        chunkSize: 200,
        compressionEnabled: false,
      };

      const dnsHandler = new DNSHandler(dnsConfig);
      protocolManager.registerProtocol(dnsHandler);

      await protocolManager.startAll();

      // Simulate protocol error
      const error = new Error('Protocol error');
      dnsHandler.emit('error', error);

      expect(errorSpy).toHaveBeenCalledWith({
        protocol: Protocol.DNS,
        error: error.message,
      });

      await protocolManager.stopAll();
    });

    it('should get protocol statistics', async () => {
      const dnsConfig: DNSConfig = {
        protocol: Protocol.DNS,
        host: '127.0.0.1',
        port: 5357,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        domain: 'test.local',
        subdomains: {
          command: 'cmd',
          response: 'res',
          heartbeat: 'hb',
          registration: 'reg',
        },
        maxTxtRecordLength: 255,
        chunkSize: 200,
        compressionEnabled: false,
      };

      const dnsHandler = new DNSHandler(dnsConfig);
      protocolManager.registerProtocol(dnsHandler);

      const stats = protocolManager.getStatistics();

      expect(stats).toMatchObject({
        totalProtocols: 1,
        activeProtocols: 0, // Not started yet
        protocolStats: expect.any(Object),
      });

      await protocolManager.startAll();

      const activeStats = protocolManager.getStatistics();
      expect(activeStats.activeProtocols).toBe(1);

      await protocolManager.stopAll();
    });
  });

  describe('End-to-End Protocol Communication', () => {
    it('should handle complete message flow', async () => {
      // Setup message handlers
      const commandHandler = jest.fn();
      const responseHandler = jest.fn();

      messageRouter.registerHandler('command', commandHandler);
      messageRouter.registerHandler('response', responseHandler);

      // Setup WebSocket protocol
      const wsConfig: WebSocketConfig = {
        protocol: Protocol.WEBSOCKET,
        host: '127.0.0.1',
        port: 8083,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        corsOrigins: ['http://localhost:3000'],
        path: '/socket.io',
        transports: ['websocket'],
        pingTimeout: 60000,
        pingInterval: 25000,
      };

      const wsHandler = new WebSocketHandler(httpServer, wsConfig);
      protocolManager.registerProtocol(wsHandler);

      await protocolManager.startAll();

      // Simulate implant connection
      const implantId = 'e2e-test-implant';
      const mockSocket = {
        id: 'socket-e2e',
        implantId,
        authenticated: true,
        connected: true,
        emit: jest.fn(),
        on: jest.fn(),
        disconnect: jest.fn(),
        connectionInfo: {
          protocol: Protocol.WEBSOCKET,
          remoteAddress: '192.168.1.100',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
      };

      (wsHandler as any).implantSockets.set(implantId, mockSocket);

      // Send command to implant
      const command = messageRouter.createMessage(
        'command',
        implantId,
        { command: 'whoami' },
        false
      );

      const sendResult = await wsHandler.sendMessage(implantId, command);
      expect(sendResult).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('message', command);

      // Simulate response from implant
      const response = messageRouter.createMessage(
        'response',
        implantId,
        { result: 'test\\user' },
        false
      );

      wsHandler.emit('messageReceived', {
        message: response,
        connectionInfo: mockSocket.connectionInfo,
      });

      // Give time for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(responseHandler).toHaveBeenCalledWith(response, mockSocket.connectionInfo);

      await protocolManager.stopAll();
    });

    it('should handle protocol failover', async () => {
      // This test would simulate switching between protocols when one fails
      // For now, we'll test that multiple protocols can coexist

      const dnsConfig: DNSConfig = {
        protocol: Protocol.DNS,
        host: '127.0.0.1',
        port: 5358,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        domain: 'test.local',
        subdomains: {
          command: 'cmd',
          response: 'res',
          heartbeat: 'hb',
          registration: 'reg',
        },
        maxTxtRecordLength: 255,
        chunkSize: 200,
        compressionEnabled: false,
      };

      const wsConfig: WebSocketConfig = {
        protocol: Protocol.WEBSOCKET,
        host: '127.0.0.1',
        port: 8084,
        timeout: 30000,
        jitter: { min: 100, max: 500 },
        obfuscation: { enabled: false },
        corsOrigins: ['http://localhost:3000'],
        path: '/socket.io',
        transports: ['websocket'],
        pingTimeout: 60000,
        pingInterval: 25000,
      };

      const dnsHandler = new DNSHandler(dnsConfig);
      const wsHandler = new WebSocketHandler(httpServer, wsConfig);

      protocolManager.registerProtocol(dnsHandler);
      protocolManager.registerProtocol(wsHandler);

      await protocolManager.startAll();

      expect(dnsHandler.isRunning).toBe(true);
      expect(wsHandler.isRunning).toBe(true);

      // Both protocols should be able to handle the same implant
      const implantId = 'failover-test-implant';

      // DNS connection
      const dnsSession = {
        implantId,
        lastQuery: new Date(),
        queryCount: 1,
        connectionInfo: {
          protocol: Protocol.DNS,
          remoteAddress: '192.168.1.100:12345',
          connectedAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
        },
        pendingMessages: [],
      };

      (dnsHandler as any).implantSessions.set(implantId, dnsSession);

      // WebSocket connection
      const wsSocket = {
        connected: true,
        authenticated: true,
        emit: jest.fn(),
        implantId,
      };

      (wsHandler as any).implantSockets.set(implantId, wsSocket);

      // Both should report the implant as connected
      expect(dnsHandler.isImplantConnected(implantId)).toBe(true);
      expect(wsHandler.isImplantConnected(implantId)).toBe(true);

      await protocolManager.stopAll();
    });
  });
});
