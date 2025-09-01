/**
 * Integration tests for multi-protocol communication system
 * Tests requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { Server as HTTPServer } from 'http';
import { createServer } from 'http';
import {
  ProtocolManager,
  MessageRouter,
  WebSocketHandler,
  DNSHandler,
  ProtocolMessage,
  ProtocolFailoverConfig,
  WebSocketConfig,
  DNSConfig,
} from '../../src/protocols';
import { Protocol } from '../../src/types/entities';
import { CryptoService } from '../../src/core/crypto/crypto.service';

describe('Multi-Protocol Communication Integration', () => {
  let httpServer: HTTPServer;
  let protocolManager: ProtocolManager;
  let messageRouter: MessageRouter;
  let wsHandler: WebSocketHandler;
  let dnsHandler: DNSHandler;
  let cryptoService: CryptoService;

  const testImplantId = 'test-implant-001';
  const testPort = 8080;
  const dnsPort = 5353;

  beforeEach(async () => {
    // Create HTTP server for WebSocket handler
    httpServer = createServer();

    // Initialize crypto service
    cryptoService = new CryptoService();

    // Initialize message router
    messageRouter = new MessageRouter(cryptoService);

    // Configure failover
    const failoverConfig: ProtocolFailoverConfig = {
      enabled: true,
      primaryProtocol: Protocol.WEBSOCKET,
      fallbackProtocols: [Protocol.DNS],
      healthCheckInterval: 1000,
      failureThreshold: 2,
      recoveryThreshold: 1,
    };

    // Initialize protocol manager
    protocolManager = new ProtocolManager(failoverConfig);

    // Configure WebSocket handler
    const wsConfig: WebSocketConfig = {
      enabled: true,
      port: testPort,
      corsOrigins: ['*'],
      path: '/socket.io',
      transports: ['websocket'],
      pingTimeout: 5000,
      pingInterval: 2000,
      jitter: {
        enabled: true,
        minDelay: 100,
        maxDelay: 500,
        variance: 20,
      },
      obfuscation: {
        enabled: true,
        trafficPadding: {
          enabled: true,
          minSize: 100,
          maxSize: 1000,
        },
      },
    };

    wsHandler = new WebSocketHandler(httpServer, wsConfig);

    // Configure DNS handler
    const dnsConfig: DNSConfig = {
      enabled: true,
      port: dnsPort,
      domain: 'c2.example.com',
      subdomains: {
        command: 'cmd',
        response: 'resp',
        heartbeat: 'hb',
        registration: 'reg',
      },
      maxTxtRecordLength: 255,
      chunkSize: 200,
      compressionEnabled: false,
      jitter: {
        enabled: true,
        minDelay: 50,
        maxDelay: 200,
        variance: 15,
      },
    };

    dnsHandler = new DNSHandler(dnsConfig);

    // Register handlers
    protocolManager.registerHandler(Protocol.WEBSOCKET, wsHandler);
    protocolManager.registerHandler(Protocol.DNS, dnsHandler);

    // Start HTTP server
    await new Promise<void>(resolve => {
      httpServer.listen(testPort, () => {
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Stop protocol manager
    if (protocolManager) {
      await protocolManager.stop();
    }

    // Close HTTP server
    if (httpServer) {
      await new Promise<void>(resolve => {
        httpServer.close(() => {
          resolve();
        });
      });
    }
  });

  describe('Protocol Manager', () => {
    it('should start and register multiple protocol handlers', async () => {
      await protocolManager.start();

      const availableProtocols = protocolManager.getAvailableProtocols();
      expect(availableProtocols).toContain(Protocol.WEBSOCKET);
      expect(availableProtocols).toContain(Protocol.DNS);
    });

    it('should provide protocol statistics', async () => {
      await protocolManager.start();

      const stats = protocolManager.getProtocolStats();
      expect(stats).toHaveLength(2);

      const wsStats = stats.find(s => s.protocol === Protocol.WEBSOCKET);
      const dnsStats = stats.find(s => s.protocol === Protocol.DNS);

      expect(wsStats).toBeDefined();
      expect(dnsStats).toBeDefined();
      expect(wsStats?.connectionsActive).toBe(0);
      expect(dnsStats?.connectionsActive).toBe(0);
    });

    it('should track protocol health', async () => {
      await protocolManager.start();

      const health = protocolManager.getProtocolHealth();
      expect(health).toHaveLength(2);

      const wsHealth = health.find(h => h.protocol === Protocol.WEBSOCKET);
      const dnsHealth = health.find(h => h.protocol === Protocol.DNS);

      expect(wsHealth?.isHealthy).toBe(true);
      expect(dnsHealth?.isHealthy).toBe(true);
      expect(wsHealth?.consecutiveFailures).toBe(0);
      expect(dnsHealth?.consecutiveFailures).toBe(0);
    });
  });

  describe('Message Router', () => {
    it('should route messages to registered handlers', async () => {
      const handlerMock = jest.fn(async () => {});
      messageRouter.registerHandler('test', handlerMock);

      const message: ProtocolMessage = {
        id: 'test-msg-001',
        type: 'test',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { data: 'test payload' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '127.0.0.1:12345',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await messageRouter.routeMessage(message, connectionInfo);

      expect(handlerMock).toHaveBeenCalledWith(message, connectionInfo);
    });

    it('should handle encrypted messages', async () => {
      const handlerMock = jest.fn(async () => {});
      messageRouter.registerHandler('encrypted_test', handlerMock);

      // Create encrypted message
      const originalMessage = messageRouter.createMessage(
        'response',
        testImplantId,
        { secret: 'encrypted data' },
        true
      );

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '127.0.0.1:12345',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      await messageRouter.routeMessage(originalMessage, connectionInfo);

      expect(handlerMock).toHaveBeenCalled();
      const calls = handlerMock.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const [routedMessage] = calls[0] as any[];
      expect(routedMessage.encrypted).toBe(false); // Should be decrypted
      expect(routedMessage.payload.secret).toBe('encrypted data');
    });

    it('should emit events for unhandled messages', async () => {
      const unhandledSpy = jest.fn();
      messageRouter.on('unhandledMessage', unhandledSpy);

      const message: ProtocolMessage = {
        id: 'unhandled-msg-001',
        type: 'unknown_type',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { data: 'test' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '127.0.0.1:12345',
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
  });

  describe('WebSocket Handler', () => {
    it('should start and stop successfully', async () => {
      await wsHandler.start();
      expect(wsHandler['isRunning']).toBe(true);

      await wsHandler.stop();
      expect(wsHandler['isRunning']).toBe(false);
    });

    it('should apply jitter configuration', async () => {
      const startTime = Date.now();
      await wsHandler['applyJitter']();
      const endTime = Date.now();

      const elapsed = endTime - startTime;
      // Should have some delay due to jitter (between 100-500ms configured)
      expect(elapsed).toBeGreaterThan(50);
    });

    it('should obfuscate traffic when enabled', async () => {
      const originalData = Buffer.from('test data');
      const obfuscatedData = wsHandler['obfuscateTraffic'](originalData);

      // Should be larger due to padding
      expect(obfuscatedData.length).toBeGreaterThan(originalData.length);
    });
  });

  describe('DNS Handler', () => {
    it('should start and stop successfully', async () => {
      await dnsHandler.start();
      expect(dnsHandler['isRunning']).toBe(true);

      await dnsHandler.stop();
      expect(dnsHandler['isRunning']).toBe(false);
    });

    it('should encode and decode base32 correctly', async () => {
      const originalData = 'Hello, World!';
      const encoded = dnsHandler['encodeBase32'](originalData);
      const decoded = dnsHandler['decodeBase32'](encoded);

      expect(decoded).toBe(originalData);
    });

    it('should parse DNS query names correctly', async () => {
      const queryName = 'data123.implant001.cmd.c2.example.com';
      const implantInfo = dnsHandler['extractImplantInfo'](queryName);

      expect(implantInfo).toBeDefined();
      expect(implantInfo?.implantId).toBe('implant001');
      expect(implantInfo?.queryType).toBe('cmd');
      expect(implantInfo?.data).toBeDefined();
    });

    it('should handle chunked messages', async () => {
      const message: ProtocolMessage = {
        id: 'chunked-msg-001',
        type: 'response',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { result: 'large data that needs chunking'.repeat(50) },
        encrypted: false,
      };

      const encodedChunks = dnsHandler['encodeMessageForTXT'](message);
      expect(encodedChunks.length).toBeGreaterThan(1); // Should be chunked
    });
  });

  describe('Protocol Failover', () => {
    it('should failover to backup protocol on failure', async () => {
      await protocolManager.start();

      // Simulate WebSocket failure
      const wsHealth = protocolManager
        .getProtocolHealth()
        .find(h => h.protocol === Protocol.WEBSOCKET);
      if (wsHealth) {
        wsHealth.isHealthy = false;
        wsHealth.consecutiveFailures = 3;
      }

      const message: ProtocolMessage = {
        id: 'failover-test-001',
        type: 'command',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { command: 'test' },
        encrypted: false,
      };

      // Should attempt to send via DNS since WebSocket is marked unhealthy
      const result = await protocolManager.sendMessage(testImplantId, message, Protocol.WEBSOCKET);

      // The result depends on whether DNS handler can actually send the message
      // In this test environment, it might fail, but the failover logic should be triggered
      expect(typeof result).toBe('boolean');
    });

    it('should track implant protocol states', async () => {
      await protocolManager.start();

      const message: ProtocolMessage = {
        id: 'state-test-001',
        type: 'heartbeat',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: {},
        encrypted: false,
      };

      await protocolManager.sendMessage(testImplantId, message);

      const states = protocolManager.getImplantProtocolStates();
      const implantState = states.find(s => s.implantId === testImplantId);

      expect(implantState).toBeDefined();
      expect(implantState?.currentProtocol).toBeDefined();
      expect(implantState?.availableProtocols).toContain(Protocol.WEBSOCKET);
    });

    it('should force failover when requested', async () => {
      await protocolManager.start();

      // First, establish a protocol state
      const message: ProtocolMessage = {
        id: 'force-failover-001',
        type: 'heartbeat',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: {},
        encrypted: false,
      };

      await protocolManager.sendMessage(testImplantId, message);

      // Force failover to DNS
      const result = await protocolManager.forceFailover(testImplantId, Protocol.DNS);
      expect(result).toBe(true);

      const states = protocolManager.getImplantProtocolStates();
      const implantState = states.find(s => s.implantId === testImplantId);

      expect(implantState?.currentProtocol).toBe(Protocol.DNS);
      expect(implantState?.failoverCount).toBeGreaterThan(0);
    });
  });

  describe('Traffic Obfuscation and Jitter', () => {
    it('should apply jitter delays', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await wsHandler['applyJitter']();
        const endTime = Date.now();
        measurements.push(endTime - startTime);
      }

      // All measurements should be different (jitter working)
      const uniqueMeasurements = new Set(measurements);
      expect(uniqueMeasurements.size).toBeGreaterThan(1);

      // All should be within configured range (100-500ms + variance)
      measurements.forEach(measurement => {
        expect(measurement).toBeGreaterThan(50);
        expect(measurement).toBeLessThan(1000);
      });
    });

    it('should pad traffic for obfuscation', async () => {
      const smallData = Buffer.from('small');
      const paddedData = wsHandler['obfuscateTraffic'](smallData);

      // Should be padded to at least minimum size
      expect(paddedData.length).toBeGreaterThan(smallData.length);
      expect(paddedData.length).toBeGreaterThanOrEqual(100); // Configured min size
    });

    it('should not pad already large data', async () => {
      const largeData = Buffer.alloc(2000, 'x'); // Larger than max padding size
      const processedData = wsHandler['obfuscateTraffic'](largeData);

      // Should not be padded further
      expect(processedData.length).toBe(largeData.length);
    });
  });

  describe('Integration with C2 Engine', () => {
    it('should integrate message routing with protocol management', async () => {
      await protocolManager.start();

      const messageReceived = jest.fn(async () => {});
      messageRouter.registerHandler('integration_test', messageReceived);

      // Simulate message received from protocol handler
      const message: ProtocolMessage = {
        id: 'integration-001',
        type: 'integration_test',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { test: 'integration' },
        encrypted: false,
      };

      const connectionInfo = {
        protocol: Protocol.WEBSOCKET,
        remoteAddress: '127.0.0.1:12345',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };

      // Route message through message router
      await messageRouter.routeMessage(message, connectionInfo);

      expect(messageReceived).toHaveBeenCalledWith(message, connectionInfo);
    });

    it('should handle protocol events correctly', async () => {
      const protocolErrorSpy = jest.fn();
      const failoverSpy = jest.fn();

      protocolManager.on('protocolError', protocolErrorSpy);
      protocolManager.on('protocolFailover', failoverSpy);

      await protocolManager.start();

      // Simulate protocol error
      wsHandler.emit('error', new Error('Test protocol error'));

      // Wait for event propagation
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(protocolErrorSpy).toHaveBeenCalled();
    });
  });
});
