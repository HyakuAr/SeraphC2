/**
 * Unit tests for ProtocolManager
 * Tests protocol failover and management functionality
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { ProtocolManager } from '../protocol-manager';
import { BaseProtocolHandler, ProtocolMessage, ProtocolFailoverConfig } from '../interfaces';
import { Protocol } from '../../types/entities';

// Mock protocol handler for testing
class MockProtocolHandler extends BaseProtocolHandler {
  private mockConnections: Set<string> = new Set();
  private shouldFail: boolean = false;

  constructor(protocol: Protocol, enabled: boolean = true) {
    super(protocol, { enabled });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.emit('started');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.mockConnections.clear();
    this.emit('stopped');
  }

  async sendMessage(_implantId: string, message: ProtocolMessage): Promise<boolean> {
    if (this.shouldFail) {
      this.updateStats({ errors: this.stats.errors + 1 });
      return false;
    }

    this.updateStats({
      messagesSent: this.stats.messagesSent + 1,
      bytesSent: this.stats.bytesSent + JSON.stringify(message).length,
    });

    return true;
  }

  getConnectionInfo(implantId: string) {
    if (this.mockConnections.has(implantId)) {
      return {
        protocol: this.stats.protocol,
        remoteAddress: '127.0.0.1:12345',
        connectedAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
      };
    }
    return null;
  }

  isImplantConnected(implantId: string): boolean {
    return this.mockConnections.has(implantId);
  }

  // Test helpers
  simulateConnection(implantId: string): void {
    this.mockConnections.add(implantId);
    this.updateStats({ connectionsActive: this.mockConnections.size });
    this.emit('implantConnected', {
      implantId,
      connectionInfo: this.getConnectionInfo(implantId),
    });
  }

  simulateDisconnection(implantId: string, reason: string = 'test'): void {
    this.mockConnections.delete(implantId);
    this.updateStats({ connectionsActive: this.mockConnections.size });
    this.emit('implantDisconnected', {
      implantId,
      reason,
    });
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}

describe('ProtocolManager', () => {
  let protocolManager: ProtocolManager;
  let wsHandler: MockProtocolHandler;
  let dnsHandler: MockProtocolHandler;
  let httpHandler: MockProtocolHandler;

  const testImplantId = 'test-implant-001';
  const failoverConfig: ProtocolFailoverConfig = {
    enabled: true,
    primaryProtocol: Protocol.WEBSOCKET,
    fallbackProtocols: [Protocol.DNS, Protocol.HTTP],
    healthCheckInterval: 100,
    failureThreshold: 2,
    recoveryThreshold: 1,
  };

  beforeEach(() => {
    protocolManager = new ProtocolManager(failoverConfig);
    wsHandler = new MockProtocolHandler(Protocol.WEBSOCKET);
    dnsHandler = new MockProtocolHandler(Protocol.DNS);
    httpHandler = new MockProtocolHandler(Protocol.HTTP);

    protocolManager.registerHandler(Protocol.WEBSOCKET, wsHandler);
    protocolManager.registerHandler(Protocol.DNS, dnsHandler);
    protocolManager.registerHandler(Protocol.HTTP, httpHandler);
  });

  afterEach(async () => {
    if (protocolManager['isRunning']) {
      await protocolManager.stop();
    }
  });

  describe('Handler Registration', () => {
    it('should register protocol handlers', () => {
      const availableProtocols = protocolManager.getAvailableProtocols();

      expect(availableProtocols).toContain(Protocol.WEBSOCKET);
      expect(availableProtocols).toContain(Protocol.DNS);
      expect(availableProtocols).toContain(Protocol.HTTP);
    });

    it('should unregister protocol handlers', () => {
      protocolManager.unregisterHandler(Protocol.HTTP);

      const availableProtocols = protocolManager.getAvailableProtocols();
      expect(availableProtocols).not.toContain(Protocol.HTTP);
    });
  });

  describe('Protocol Manager Lifecycle', () => {
    it('should start and stop successfully', async () => {
      const startedSpy = jest.fn();
      const stoppedSpy = jest.fn();

      protocolManager.on('started', startedSpy);
      protocolManager.on('stopped', stoppedSpy);

      await protocolManager.start();
      expect(protocolManager['isRunning']).toBe(true);
      expect(startedSpy).toHaveBeenCalled();

      await protocolManager.stop();
      expect(protocolManager['isRunning']).toBe(false);
      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should start all enabled handlers', async () => {
      await protocolManager.start();

      expect(wsHandler['isRunning']).toBe(true);
      expect(dnsHandler['isRunning']).toBe(true);
      expect(httpHandler['isRunning']).toBe(true);
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      await protocolManager.start();
    });

    it('should send messages via primary protocol', async () => {
      const message: ProtocolMessage = {
        id: 'test-msg-001',
        type: 'command',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { command: 'test' },
        encrypted: false,
      };

      const result = await protocolManager.sendMessage(testImplantId, message);
      expect(result).toBe(true);

      const wsStats = wsHandler.getStats();
      expect(wsStats.messagesSent).toBe(1);
    });

    it('should use preferred protocol when specified', async () => {
      const message: ProtocolMessage = {
        id: 'test-msg-002',
        type: 'command',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { command: 'test' },
        encrypted: false,
      };

      const result = await protocolManager.sendMessage(testImplantId, message, Protocol.DNS);
      expect(result).toBe(true);

      const dnsStats = dnsHandler.getStats();
      expect(dnsStats.messagesSent).toBe(1);
    });
  });

  describe('Protocol Health Tracking', () => {
    beforeEach(async () => {
      await protocolManager.start();
    });

    it('should initialize protocol health', () => {
      const health = protocolManager.getProtocolHealth();

      expect(health).toHaveLength(3);

      const wsHealth = health.find(h => h.protocol === Protocol.WEBSOCKET);
      expect(wsHealth?.isHealthy).toBe(true);
      expect(wsHealth?.consecutiveFailures).toBe(0);
      expect(wsHealth?.consecutiveSuccesses).toBe(0);
    });

    it('should update health on successful sends', async () => {
      const message: ProtocolMessage = {
        id: 'health-test-001',
        type: 'command',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { command: 'test' },
        encrypted: false,
      };

      await protocolManager.sendMessage(testImplantId, message);

      const health = protocolManager.getProtocolHealth();
      const wsHealth = health.find(h => h.protocol === Protocol.WEBSOCKET);

      expect(wsHealth?.consecutiveSuccesses).toBe(1);
      expect(wsHealth?.consecutiveFailures).toBe(0);
      expect(wsHealth?.lastSuccess).toBeDefined();
    });

    it('should update health on failed sends', async () => {
      wsHandler.setShouldFail(true);

      const message: ProtocolMessage = {
        id: 'health-fail-001',
        type: 'command',
        implantId: testImplantId,
        timestamp: new Date(),
        payload: { command: 'test' },
        encrypted: false,
      };

      const result = await protocolManager.sendMessage(testImplantId, message);
      expect(result).toBe(false);

      const health = protocolManager.getProtocolHealth();
      const wsHealth = health.find(h => h.protocol === Protocol.WEBSOCKET);

      expect(wsHealth?.consecutiveFailures).toBe(1);
      expect(wsHealth?.consecutiveSuccesses).toBe(0);
      expect(wsHealth?.lastFailure).toBeDefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await protocolManager.start();
    });

    it('should provide protocol statistics', () => {
      const stats = protocolManager.getProtocolStats();

      expect(stats).toHaveLength(3);

      const wsStats = stats.find(s => s.protocol === Protocol.WEBSOCKET);
      expect(wsStats).toBeDefined();
      expect(wsStats?.connectionsActive).toBe(0);
      expect(wsStats?.messagesSent).toBe(0);
    });

    it('should track implant protocol states', async () => {
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
      expect(implantState?.implantId).toBe(testImplantId);
      expect(implantState?.currentProtocol).toBeDefined();
      expect(implantState?.availableProtocols.length).toBeGreaterThan(0);
    });
  });
});
