/**
 * Unit tests for Load Balancer service
 */

import {
  LoadBalancerService,
  ServerNode,
  LoadBalancerConfig,
} from '../../../src/core/scaling/load-balancer.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LoadBalancerService', () => {
  let loadBalancer: LoadBalancerService;

  const config: LoadBalancerConfig = {
    algorithm: 'round-robin',
    healthCheckInterval: 5000,
    healthCheckTimeout: 2000,
    healthCheckPath: '/health',
    maxRetries: 3,
    retryDelay: 1000,
    enableStickySessions: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30000,
  };

  const mockNode1: ServerNode = {
    id: 'node-1',
    host: 'localhost',
    port: 3001,
    protocol: 'http',
    weight: 1,
    isHealthy: true,
    lastHealthCheck: new Date(),
    responseTime: 100,
    activeConnections: 10,
    maxConnections: 100,
  };

  const mockNode2: ServerNode = {
    id: 'node-2',
    host: 'localhost',
    port: 3002,
    protocol: 'http',
    weight: 2,
    isHealthy: true,
    lastHealthCheck: new Date(),
    responseTime: 150,
    activeConnections: 5,
    maxConnections: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock axios.create
    mockedAxios.create.mockReturnValue({
      get: jest.fn(),
      request: jest.fn(),
    } as any);

    loadBalancer = new LoadBalancerService(config);
  });

  afterEach(() => {
    jest.useRealTimers();
    loadBalancer.shutdown();
  });

  describe('node management', () => {
    it('should add a server node', () => {
      loadBalancer.addNode(mockNode1);

      const nodes = loadBalancer.getNodeStatus();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.id).toBe('node-1');
    });

    it('should remove a server node', () => {
      loadBalancer.addNode(mockNode1);
      loadBalancer.addNode(mockNode2);

      loadBalancer.removeNode('node-1');

      const nodes = loadBalancer.getNodeStatus();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]?.id).toBe('node-2');
    });

    it('should emit events when nodes are added/removed', () => {
      const addedSpy = jest.fn();
      const removedSpy = jest.fn();

      loadBalancer.on('nodeAdded', addedSpy);
      loadBalancer.on('nodeRemoved', removedSpy);

      loadBalancer.addNode(mockNode1);
      loadBalancer.removeNode('node-1');

      expect(addedSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'node-1' }));
      expect(removedSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'node-1' }));
    });
  });

  describe('load balancing algorithms', () => {
    beforeEach(() => {
      loadBalancer.addNode(mockNode1);
      loadBalancer.addNode(mockNode2);
    });

    it('should use round-robin algorithm', () => {
      const node1 = loadBalancer.getNextNode();
      const node2 = loadBalancer.getNextNode();
      const node3 = loadBalancer.getNextNode();

      expect(node1?.id).toBe('node-1');
      expect(node2?.id).toBe('node-2');
      expect(node3?.id).toBe('node-1'); // Should cycle back
    });

    it('should use least-connections algorithm', () => {
      const lbConfig = { ...config, algorithm: 'least-connections' as const };
      const lb = new LoadBalancerService(lbConfig);

      const node1 = { ...mockNode1, activeConnections: 20 };
      const node2 = { ...mockNode2, activeConnections: 5 };

      lb.addNode(node1);
      lb.addNode(node2);

      const selectedNode = lb.getNextNode();
      expect(selectedNode?.id).toBe('node-2'); // Should select node with fewer connections

      lb.shutdown();
    });

    it('should use least-response-time algorithm', () => {
      const lbConfig = { ...config, algorithm: 'least-response-time' as const };
      const lb = new LoadBalancerService(lbConfig);

      const node1 = { ...mockNode1, responseTime: 200 };
      const node2 = { ...mockNode2, responseTime: 50 };

      lb.addNode(node1);
      lb.addNode(node2);

      const selectedNode = lb.getNextNode();
      expect(selectedNode?.id).toBe('node-2'); // Should select node with lower response time

      lb.shutdown();
    });

    it('should use IP hash algorithm', () => {
      const lbConfig = { ...config, algorithm: 'ip-hash' as const };
      const lb = new LoadBalancerService(lbConfig);

      lb.addNode(mockNode1);
      lb.addNode(mockNode2);

      const context = { ipAddress: '192.168.1.100' };
      const node1 = lb.getNextNode(context);
      const node2 = lb.getNextNode(context);

      // Same IP should always get same node
      expect(node1?.id).toBe(node2?.id);

      lb.shutdown();
    });
  });

  describe('session affinity', () => {
    it('should maintain session affinity when enabled', () => {
      const lbConfig = { ...config, enableStickySessions: true };
      const lb = new LoadBalancerService(lbConfig);

      lb.addNode(mockNode1);
      lb.addNode(mockNode2);

      const context = { sessionId: 'session-123' };
      const node1 = lb.getNextNode(context);
      const node2 = lb.getNextNode(context);

      expect(node1?.id).toBe(node2?.id);

      lb.shutdown();
    });

    it('should handle session affinity when preferred node is unhealthy', () => {
      const lbConfig = { ...config, enableStickySessions: true };
      const lb = new LoadBalancerService(lbConfig);

      const unhealthyNode = { ...mockNode1, isHealthy: false };
      lb.addNode(unhealthyNode);
      lb.addNode(mockNode2);

      const context = { sessionId: 'session-123' };

      // First call should establish affinity with healthy node
      const node1 = lb.getNextNode(context);
      expect(node1?.id).toBe('node-2');

      // Second call should maintain affinity
      const node2 = lb.getNextNode(context);
      expect(node2?.id).toBe('node-2');

      lb.shutdown();
    });
  });

  describe('health checking', () => {
    it('should perform health checks on nodes', async () => {
      const mockHttpClient = {
        get: jest.fn().mockResolvedValue({ status: 200 }),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      loadBalancer.addNode(mockNode1);

      await loadBalancer.forceHealthCheck();

      expect(mockHttpClient.get).toHaveBeenCalledWith('http://localhost:3001/health');
    });

    it('should mark nodes as unhealthy on health check failure', async () => {
      const mockHttpClient = {
        get: jest.fn().mockRejectedValue(new Error('Connection failed')),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      const healthySpy = jest.fn();
      const unhealthySpy = jest.fn();

      loadBalancer.on('nodeHealthy', healthySpy);
      loadBalancer.on('nodeUnhealthy', unhealthySpy);

      loadBalancer.addNode(mockNode1);

      await loadBalancer.forceHealthCheck();

      expect(unhealthySpy).toHaveBeenCalled();
    });

    it('should automatically perform periodic health checks', () => {
      loadBalancer.addNode(mockNode1);

      // Fast forward time to trigger health check
      jest.advanceTimersByTime(config.healthCheckInterval);

      // Verify that health check interval was set
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit breaker after threshold failures', () => {
      loadBalancer.addNode(mockNode1);

      // Simulate failures
      for (let i = 0; i < config.circuitBreakerThreshold; i++) {
        (loadBalancer as any).handleNodeFailure('node-1');
      }

      const isOpen = (loadBalancer as any).isCircuitBreakerOpen('node-1');
      expect(isOpen).toBe(true);
    });

    it('should reset circuit breaker after timeout', () => {
      loadBalancer.addNode(mockNode1);

      // Open circuit breaker
      for (let i = 0; i < config.circuitBreakerThreshold; i++) {
        (loadBalancer as any).handleNodeFailure('node-1');
      }

      // Fast forward past timeout
      jest.advanceTimersByTime(config.circuitBreakerTimeout + 1000);

      const isOpen = (loadBalancer as any).isCircuitBreakerOpen('node-1');
      expect(isOpen).toBe(false);
    });

    it('should manually reset circuit breaker', () => {
      loadBalancer.addNode(mockNode1);

      // Open circuit breaker
      for (let i = 0; i < config.circuitBreakerThreshold; i++) {
        (loadBalancer as any).handleNodeFailure('node-1');
      }

      loadBalancer.resetCircuitBreaker('node-1');

      const isOpen = (loadBalancer as any).isCircuitBreakerOpen('node-1');
      expect(isOpen).toBe(false);
    });
  });

  describe('request execution', () => {
    it('should execute request through selected node', async () => {
      const mockHttpClient = {
        request: jest.fn().mockResolvedValue({ data: { success: true } }),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      loadBalancer.addNode(mockNode1);

      const result = await loadBalancer.executeRequest('/api/test', { method: 'GET' });

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:3001/api/test',
          method: 'GET',
        })
      );
      expect(result).toEqual({ success: true });
    });

    it('should retry on failure', async () => {
      const mockHttpClient = {
        request: jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValue({ data: { success: true } }),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      loadBalancer.addNode(mockNode1);
      loadBalancer.addNode(mockNode2);

      const result = await loadBalancer.executeRequest('/api/test');

      expect(mockHttpClient.request).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    it('should throw error when all retries fail', async () => {
      const mockHttpClient = {
        request: jest.fn().mockRejectedValue(new Error('Network error')),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      loadBalancer.addNode(mockNode1);

      await expect(loadBalancer.executeRequest('/api/test')).rejects.toThrow('Network error');

      expect(mockHttpClient.request).toHaveBeenCalledTimes(config.maxRetries + 1);
    });

    it('should throw error when no healthy nodes available', async () => {
      const unhealthyNode = { ...mockNode1, isHealthy: false };
      loadBalancer.addNode(unhealthyNode);

      await expect(loadBalancer.executeRequest('/api/test')).rejects.toThrow(
        'No healthy nodes available for request'
      );
    });
  });

  describe('statistics', () => {
    it('should track request statistics', async () => {
      const mockHttpClient = {
        request: jest.fn().mockResolvedValue({ data: { success: true } }),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      loadBalancer.addNode(mockNode1);

      await loadBalancer.executeRequest('/api/test');

      const stats = loadBalancer.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
    });

    it('should track node-specific statistics', async () => {
      const mockHttpClient = {
        request: jest.fn().mockResolvedValue({ data: { success: true } }),
      };
      (loadBalancer as any).httpClient = mockHttpClient;

      loadBalancer.addNode(mockNode1);

      await loadBalancer.executeRequest('/api/test');

      const stats = loadBalancer.getStats();
      expect(stats.nodeStats['node-1']).toBeDefined();
      expect(stats.nodeStats['node-1']?.requests).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should clean up resources on shutdown', () => {
      loadBalancer.addNode(mockNode1);

      const shutdownSpy = jest.fn();
      loadBalancer.on('shutdown', shutdownSpy);

      loadBalancer.shutdown();

      expect(shutdownSpy).toHaveBeenCalled();
      expect(loadBalancer.getNodeStatus()).toHaveLength(0);
    });
  });
});
