/**
 * Integration tests for scalability features
 */

import { RedisService, CacheConfig } from '../../src/core/cache/redis.service';
import { SessionCacheService, SessionConfig } from '../../src/core/cache/session-cache.service';
import {
  ConnectionPoolService,
  ConnectionPoolConfig,
} from '../../src/core/database/connection-pool.service';
import {
  LoadBalancerService,
  LoadBalancerConfig,
} from '../../src/core/scaling/load-balancer.service';
// Cluster manager imports removed as not used in current tests
import {
  PerformanceMonitorService,
  MonitoringConfig,
} from '../../src/core/monitoring/performance-monitor.service';

// Skip integration tests if not explicitly enabled
const runIntegrationTests = process.env['RUN_INTEGRATION_TESTS'] === 'true';

describe('Scalability Integration Tests', () => {
  let redisService: RedisService;
  let sessionCacheService: SessionCacheService;
  let connectionPoolService: ConnectionPoolService;
  let loadBalancerService: LoadBalancerService;
  let performanceMonitorService: PerformanceMonitorService;

  const redisConfig: CacheConfig = {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    keyPrefix: 'test:scalability:',
  };

  const sessionConfig: SessionConfig = {
    defaultTtlSeconds: 3600,
    maxIdleTimeSeconds: 1800,
    enableSlidingExpiration: true,
    maxConcurrentSessions: 5,
    sessionKeyPrefix: 'test:session:',
  };

  const connectionPoolConfig: ConnectionPoolConfig = {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432'),
    database: process.env['DB_NAME'] || 'seraphc2_test',
    user: process.env['DB_USER'] || 'postgres',
    password: process.env['DB_PASSWORD'] || 'password',
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
    enableHealthCheck: true,
    healthCheckIntervalMs: 10000,
  };

  const loadBalancerConfig: LoadBalancerConfig = {
    algorithm: 'round-robin',
    healthCheckInterval: 5000,
    healthCheckTimeout: 2000,
    healthCheckPath: '/health',
    maxRetries: 3,
    retryDelay: 1000,
    enableStickySessions: false,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 3,
    circuitBreakerTimeout: 30000,
  };

  const monitoringConfig: MonitoringConfig = {
    metricsInterval: 5000,
    retentionDays: 1,
    enableAlerting: true,
    alertCheckInterval: 10000,
    maxAlertsPerHour: 10,
    enableMetricsAggregation: true,
    aggregationInterval: 60000,
  };

  beforeAll(async () => {
    if (!runIntegrationTests) {
      console.log('Skipping integration tests - set RUN_INTEGRATION_TESTS=true to enable');
      return;
    }

    try {
      // Initialize Redis service
      redisService = RedisService.getInstance(redisConfig);
      await redisService.connect();

      // Initialize session cache service
      sessionCacheService = SessionCacheService.getInstance(redisService, sessionConfig);

      // Initialize connection pool service
      connectionPoolService = ConnectionPoolService.getInstance(connectionPoolConfig);
      await connectionPoolService.initialize();

      // Initialize load balancer service
      loadBalancerService = new LoadBalancerService(loadBalancerConfig);

      // Initialize performance monitor service
      performanceMonitorService = PerformanceMonitorService.getInstance(
        redisService,
        monitoringConfig,
        'test-node-1'
      );
      await performanceMonitorService.start();

      console.log('✅ All scalability services initialized for integration tests');
    } catch (error) {
      console.error('❌ Failed to initialize services for integration tests:', error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    if (!runIntegrationTests) return;

    try {
      // Cleanup services
      if (performanceMonitorService) {
        await performanceMonitorService.stop();
      }

      if (loadBalancerService) {
        loadBalancerService.shutdown();
      }

      if (connectionPoolService) {
        await connectionPoolService.destroy();
      }

      if (redisService) {
        await redisService.disconnect();
      }

      // Reset singleton instances
      (RedisService as any).instance = null;
      (SessionCacheService as any).instance = null;
      (ConnectionPoolService as any).instance = null;
      (PerformanceMonitorService as any).instance = null;

      console.log('✅ All scalability services cleaned up');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }, 30000);

  describe('Redis Cache Integration', () => {
    beforeEach(() => {
      if (!runIntegrationTests) return;
    });

    it('should perform basic cache operations', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const testData = { message: 'Hello Redis!', timestamp: new Date() };

      // Set data
      await redisService.set('test-key', testData, 60);

      // Get data
      const retrieved = await redisService.get('test-key');
      expect(retrieved).toEqual(
        expect.objectContaining({
          message: 'Hello Redis!',
        })
      );

      // Check existence
      const exists = await redisService.exists('test-key');
      expect(exists).toBe(true);

      // Delete data
      const deleted = await redisService.del('test-key');
      expect(deleted).toBe(1);

      // Verify deletion
      const afterDelete = await redisService.get('test-key');
      expect(afterDelete).toBeNull();
    });

    it('should handle concurrent operations', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 10; i++) {
        operations.push(redisService.set(`concurrent-key-${i}`, { value: i }, 60));
      }

      // Wait for all operations to complete
      await Promise.all(operations);

      // Verify all keys were set
      const retrieveOperations = [];
      for (let i = 0; i < 10; i++) {
        retrieveOperations.push(redisService.get(`concurrent-key-${i}`));
      }

      const results = await Promise.all(retrieveOperations);

      results.forEach((result, index) => {
        expect(result).toEqual({ value: index });
      });

      // Cleanup
      const keys = Array.from({ length: 10 }, (_, i) => `concurrent-key-${i}`);
      await redisService.del(keys);
    });

    it('should provide accurate statistics', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      // Reset stats
      redisService.resetStats();

      // Perform operations
      await redisService.set('stats-test', 'value');
      await redisService.get('stats-test');
      await redisService.get('non-existent-key');

      const stats = await redisService.getStats();

      expect(stats.sets).toBeGreaterThanOrEqual(1);
      expect(stats.hits).toBeGreaterThanOrEqual(1);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
      expect(stats.totalKeys).toBeGreaterThanOrEqual(0);

      // Cleanup
      await redisService.del('stats-test');
    });
  });

  describe('Session Cache Integration', () => {
    it('should manage distributed sessions', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const sessionData = {
        operatorId: 'test-operator',
        username: 'testuser',
        role: 'operator',
        permissions: ['read', 'write'],
        loginTime: new Date(),
        lastActivity: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
        mfaVerified: true,
      };

      // Create session
      await sessionCacheService.createSession('test-session-1', sessionData);

      // Retrieve session
      const retrieved = await sessionCacheService.getSession('test-session-1');
      expect(retrieved).toEqual(
        expect.objectContaining({
          operatorId: 'test-operator',
          username: 'testuser',
        })
      );

      // Update session
      await sessionCacheService.updateSession('test-session-1', {
        mfaVerified: false,
      });

      const updated = await sessionCacheService.getSession('test-session-1');
      expect(updated?.mfaVerified).toBe(false);

      // Validate session
      const isValid = await sessionCacheService.isValidSession('test-session-1');
      expect(isValid).toBe(true);

      // Get operator sessions
      const operatorSessions = await sessionCacheService.getOperatorSessions('test-operator');
      expect(operatorSessions).toHaveLength(1);

      // Delete session
      await sessionCacheService.deleteSession('test-session-1');

      const afterDelete = await sessionCacheService.getSession('test-session-1');
      expect(afterDelete).toBeNull();
    });

    it('should enforce concurrent session limits', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const operatorId = 'test-operator-limits';
      const sessionData = {
        operatorId,
        username: 'testuser',
        role: 'operator',
        permissions: ['read'],
        loginTime: new Date(),
        lastActivity: new Date(),
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
        mfaVerified: true,
      };

      // Create sessions up to the limit
      for (let i = 0; i < sessionConfig.maxConcurrentSessions; i++) {
        await sessionCacheService.createSession(`session-${i}`, sessionData);
      }

      // Create one more session (should trigger cleanup)
      await sessionCacheService.createSession('session-extra', sessionData);

      const operatorSessions = await sessionCacheService.getOperatorSessions(operatorId);
      expect(operatorSessions.length).toBeLessThanOrEqual(sessionConfig.maxConcurrentSessions);

      // Cleanup
      await sessionCacheService.deleteOperatorSessions(operatorId);
    });
  });

  describe('Connection Pool Integration', () => {
    it('should manage database connections efficiently', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      // Execute multiple queries concurrently
      const queries = [];
      for (let i = 0; i < 5; i++) {
        queries.push(connectionPoolService.query('SELECT $1 as test_value', [i]));
      }

      const results = await Promise.all(queries);

      results.forEach((result, index) => {
        expect(result.rows[0].test_value).toBe(index);
      });

      // Check pool metrics
      const metrics = connectionPoolService.getMetrics();
      expect(metrics.totalConnections).toBeGreaterThan(0);
      expect(metrics.totalQueries).toBeGreaterThanOrEqual(5);
    });

    it('should handle transactions correctly', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const result = await connectionPoolService.transaction(async client => {
        await client.query('CREATE TEMP TABLE test_transaction (id INT, value TEXT)');
        await client.query('INSERT INTO test_transaction VALUES (1, $1)', ['test']);
        const selectResult = await client.query('SELECT * FROM test_transaction WHERE id = 1');
        return selectResult.rows[0];
      });

      expect(result).toEqual({ id: 1, value: 'test' });
    });

    it('should provide pool status and recommendations', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const status = await connectionPoolService.getPoolStatus();

      expect(status).toHaveProperty('isHealthy');
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('recommendations');
      expect(Array.isArray(status.recommendations)).toBe(true);
    });
  });

  describe('Load Balancer Integration', () => {
    it('should distribute requests across healthy nodes', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      // Add mock nodes
      loadBalancerService.addNode({
        id: 'node-1',
        host: 'httpbin.org',
        port: 80,
        protocol: 'http',
        weight: 1,
        isHealthy: true,
        lastHealthCheck: new Date(),
        responseTime: 100,
        activeConnections: 0,
        maxConnections: 100,
      });

      loadBalancerService.addNode({
        id: 'node-2',
        host: 'httpbin.org',
        port: 80,
        protocol: 'http',
        weight: 1,
        isHealthy: true,
        lastHealthCheck: new Date(),
        responseTime: 150,
        activeConnections: 0,
        maxConnections: 100,
      });

      // Test node selection
      const node1 = loadBalancerService.getNextNode();
      const node2 = loadBalancerService.getNextNode();

      expect(node1).toBeDefined();
      expect(node2).toBeDefined();
      expect(node1?.id).not.toBe(node2?.id); // Should alternate in round-robin

      // Test health check
      await loadBalancerService.forceHealthCheck();

      const healthyCount = loadBalancerService.getHealthyNodesCount();
      expect(healthyCount).toBeGreaterThan(0);

      // Get statistics
      const stats = loadBalancerService.getStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('nodeStats');
    });
  });

  describe('Performance Monitoring Integration', () => {
    it('should collect and store performance metrics', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      // Wait for at least one metrics collection cycle
      await new Promise(resolve => setTimeout(resolve, 6000));

      const currentMetrics = await performanceMonitorService.getCurrentMetrics();

      expect(currentMetrics).toHaveProperty('timestamp');
      expect(currentMetrics).toHaveProperty('nodeId', 'test-node-1');
      expect(currentMetrics).toHaveProperty('cpu');
      expect(currentMetrics).toHaveProperty('memory');
      expect(currentMetrics).toHaveProperty('application');

      expect(currentMetrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(currentMetrics.memory.usage).toBeGreaterThanOrEqual(0);
    });

    it('should provide performance analysis', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      // Wait for some metrics history
      await new Promise(resolve => setTimeout(resolve, 12000));

      const analysis = performanceMonitorService.analyzePerformance(1);

      expect(analysis).toHaveProperty('summary');
      expect(analysis).toHaveProperty('trends');
      expect(analysis).toHaveProperty('recommendations');

      expect(Array.isArray(analysis.recommendations)).toBe(true);
      expect(typeof analysis.summary['averageCpuUsage']).toBe('number');
    });

    it('should manage alert rules', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const testRule = {
        id: 'test-rule',
        name: 'Test Alert Rule',
        description: 'Test rule for integration testing',
        metric: 'cpu.usage',
        operator: '>' as const,
        threshold: 95,
        duration: 60,
        severity: 'high' as const,
        enabled: true,
        cooldown: 300,
        actions: [{ type: 'log' as const, config: {} }],
      };

      performanceMonitorService.addAlertRule(testRule);

      const rules = performanceMonitorService.getAlertRules();
      const addedRule = rules.find(r => r.id === 'test-rule');

      expect(addedRule).toBeDefined();
      expect(addedRule?.name).toBe('Test Alert Rule');

      performanceMonitorService.removeAlertRule('test-rule');

      const rulesAfterRemoval = performanceMonitorService.getAlertRules();
      const removedRule = rulesAfterRemoval.find(r => r.id === 'test-rule');

      expect(removedRule).toBeUndefined();
    });
  });

  describe('End-to-End Scalability Scenario', () => {
    it('should handle high-load scenario with all components', async () => {
      if (!runIntegrationTests) {
        pending('Integration tests disabled');
        return;
      }

      const startTime = Date.now();
      const operations = [];

      // Simulate high load with concurrent operations
      for (let i = 0; i < 20; i++) {
        operations.push(
          (async () => {
            // Cache operations
            await redisService.set(`load-test-${i}`, { data: `value-${i}` }, 60);
            const cached = await redisService.get(`load-test-${i}`);

            // Session operations
            const sessionData = {
              operatorId: `operator-${i}`,
              username: `user-${i}`,
              role: 'operator',
              permissions: ['read'],
              loginTime: new Date(),
              lastActivity: new Date(),
              ipAddress: '127.0.0.1',
              userAgent: 'Load Test',
              mfaVerified: true,
            };

            await sessionCacheService.createSession(`load-session-${i}`, sessionData);
            const session = await sessionCacheService.getSession(`load-session-${i}`);

            // Database operations
            const dbResult = await connectionPoolService.query('SELECT $1 as load_test_value', [
              `load-${i}`,
            ]);

            return { cached, session, dbResult: dbResult.rows[0] };
          })()
        );
      }

      const results = await Promise.all(operations);
      const endTime = Date.now();

      // Verify all operations completed successfully
      expect(results).toHaveLength(20);
      results.forEach((result, index) => {
        expect(result.cached).toEqual({ data: `value-${index}` });
        expect(result.session?.operatorId).toBe(`operator-${index}`);
        expect(result.dbResult.load_test_value).toBe(`load-${index}`);
      });

      // Check performance
      const totalTime = endTime - startTime;
      console.log(`✅ Completed 20 concurrent operations in ${totalTime}ms`);

      // Verify system health after load
      const redisStats = await redisService.getStats();
      const poolMetrics = connectionPoolService.getMetrics();
      const performanceMetrics = await performanceMonitorService.getCurrentMetrics();

      expect(redisStats.errors).toBe(0);
      expect(poolMetrics.connectionErrors).toBe(0);
      expect(performanceMetrics.application.errorsPerMinute).toBeLessThan(5);

      // Cleanup
      const cleanupOperations = [];
      for (let i = 0; i < 20; i++) {
        cleanupOperations.push(redisService.del(`load-test-${i}`));
        cleanupOperations.push(sessionCacheService.deleteSession(`load-session-${i}`));
      }

      await Promise.all(cleanupOperations);
    }, 60000);
  });
});
