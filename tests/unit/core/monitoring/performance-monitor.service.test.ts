/**
 * Unit tests for PerformanceMonitorService
 */

import { EventEmitter } from 'events';
import {
  PerformanceMonitorService,
  MonitoringConfig,
  AlertRule,
  PerformanceMetrics,
} from '../../../../src/core/monitoring/performance-monitor.service';
import { RedisService } from '../../../../src/core/cache/redis.service';

// Mock dependencies
jest.mock('os');
jest.mock('../../../../src/core/cache/redis.service');

const MockedRedisService = RedisService as jest.MockedClass<typeof RedisService>;

describe('PerformanceMonitorService', () => {
  let performanceMonitor: PerformanceMonitorService;
  let mockRedis: jest.Mocked<RedisService>;
  let config: MonitoringConfig;
  let nodeId: string;

  beforeEach(() => {
    // Reset singleton instance
    (PerformanceMonitorService as any).instance = undefined;

    mockRedis = {
      getStats: jest.fn(),
      zadd: jest.fn(),
      zrange: jest.fn(),
      keys: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      expire: jest.fn(),
    } as any;

    MockedRedisService.mockImplementation(() => mockRedis);

    config = {
      metricsInterval: 5000,
      retentionDays: 7,
      enableAlerting: true,
      alertCheckInterval: 10000,
      maxAlertsPerHour: 10,
      enableMetricsAggregation: true,
      aggregationInterval: 60000,
    };

    nodeId = 'test-node-1';

    performanceMonitor = PerformanceMonitorService.getInstance(mockRedis, config, nodeId);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('getInstance', () => {
    it('should create singleton instance', () => {
      const instance1 = PerformanceMonitorService.getInstance(mockRedis, config, nodeId);
      const instance2 = PerformanceMonitorService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should throw error if no parameters provided for first initialization', () => {
      (PerformanceMonitorService as any).instance = undefined;

      expect(() => PerformanceMonitorService.getInstance()).toThrow(
        'All parameters required for first initialization'
      );
    });
  });

  describe('start and stop', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockRedis.keys.mockResolvedValue([]);
      mockRedis.getStats.mockResolvedValue({
        hits: 100,
        misses: 10,
        sets: 50,
        deletes: 5,
        errors: 0,
        totalKeys: 1000,
        memoryUsage: 1048576,
        uptime: 3600000,
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start monitoring successfully', async () => {
      const startedSpy = jest.fn();
      performanceMonitor.on('started', startedSpy);

      await performanceMonitor.start();

      expect(startedSpy).toHaveBeenCalled();
      expect(mockRedis.keys).toHaveBeenCalledWith('alert_rule:*');
    });

    it('should stop monitoring successfully', async () => {
      const stoppedSpy = jest.fn();
      performanceMonitor.on('stopped', stoppedSpy);

      await performanceMonitor.start();
      await performanceMonitor.stop();

      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('should handle start errors', async () => {
      const error = new Error('Redis connection failed');
      mockRedis.keys.mockRejectedValue(error);

      await expect(performanceMonitor.start()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('metrics collection', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockRedis.getStats.mockResolvedValue({
        hits: 100,
        misses: 10,
        sets: 50,
        deletes: 5,
        errors: 0,
        totalKeys: 1000,
        memoryUsage: 1048576,
        uptime: 3600000,
      });

      // Mock os module
      const mockOs = require('os');
      mockOs.totalmem.mockReturnValue(8589934592); // 8GB
      mockOs.freemem.mockReturnValue(4294967296); // 4GB
      mockOs.loadavg.mockReturnValue([1.5, 1.2, 1.0]);
      mockOs.cpus.mockReturnValue(new Array(8)); // 8 cores
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should collect current metrics', async () => {
      const metrics = await performanceMonitor.getCurrentMetrics();

      expect(metrics).toMatchObject({
        timestamp: expect.any(Date),
        nodeId: 'test-node-1',
        cpu: {
          usage: expect.any(Number),
          loadAverage: [1.5, 1.2, 1.0],
          cores: 8,
        },
        memory: {
          total: 8589934592,
          used: 4294967296,
          free: 4294967296,
          usage: 50,
          heapUsed: expect.any(Number),
          heapTotal: expect.any(Number),
        },
        cache: {
          hitRate: expect.any(Number),
          missRate: expect.any(Number),
          memoryUsage: 1048576,
          operationsPerSecond: expect.any(Number),
        },
      });
    });

    it('should handle cache stats with zero operations', async () => {
      mockRedis.getStats.mockResolvedValue({
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        totalKeys: 0,
        memoryUsage: 0,
        uptime: 0,
      });

      const metrics = await performanceMonitor.getCurrentMetrics();

      expect(metrics.cache.hitRate).toBe(0);
      expect(metrics.cache.missRate).toBe(0);
    });

    it('should collect metrics periodically when started', async () => {
      mockRedis.keys.mockResolvedValue([]);
      mockRedis.zadd.mockResolvedValue(1);

      const metricsCollectedSpy = jest.fn();
      performanceMonitor.on('metricsCollected', metricsCollectedSpy);

      await performanceMonitor.start();

      // Fast-forward time to trigger metrics collection
      jest.advanceTimersByTime(config.metricsInterval);

      await Promise.resolve(); // Allow async operations to complete

      expect(metricsCollectedSpy).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
    });
  });

  describe('metrics history', () => {
    it('should return metrics history for specified hours', () => {
      const now = new Date();
      const oldMetrics: PerformanceMetrics = {
        timestamp: new Date(now.getTime() - 25 * 60 * 60 * 1000), // 25 hours ago
        nodeId: 'test-node-1',
      } as any;

      const recentMetrics: PerformanceMetrics = {
        timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        nodeId: 'test-node-1',
      } as any;

      // Add metrics to internal history
      (performanceMonitor as any).metricsHistory = [oldMetrics, recentMetrics];

      const history = performanceMonitor.getMetricsHistory(24);

      expect(history).toHaveLength(1);
      expect(history[0]).toBe(recentMetrics);
    });

    it('should return aggregated metrics from Redis', async () => {
      const startTime = new Date('2023-01-01T00:00:00Z');
      const endTime = new Date('2023-01-01T23:59:59Z');

      const mockAggregatedData = [
        JSON.stringify({ timestamp: startTime, nodeId: 'test-node-1' }),
        JSON.stringify({ timestamp: endTime, nodeId: 'test-node-1' }),
      ];

      mockRedis.zrange.mockResolvedValue(mockAggregatedData);

      const result = await performanceMonitor.getAggregatedMetrics(startTime, endTime, 'hour');

      expect(mockRedis.zrange).toHaveBeenCalledWith(
        'metrics:aggregated:hour:test-node-1',
        startTime.getTime(),
        endTime.getTime()
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('alert rule management', () => {
    it('should add alert rule', () => {
      const rule: AlertRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test alert rule',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
      };

      mockRedis.set.mockResolvedValue(undefined);

      const alertRuleAddedSpy = jest.fn();
      performanceMonitor.on('alertRuleAdded', alertRuleAddedSpy);

      performanceMonitor.addAlertRule(rule);

      expect(alertRuleAddedSpy).toHaveBeenCalledWith(rule);
      expect(mockRedis.set).toHaveBeenCalledWith('alert_rule:test-rule', rule);
    });

    it('should remove alert rule', () => {
      const rule: AlertRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test alert rule',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
      };

      // Add rule first
      (performanceMonitor as any).alertRules.set('test-rule', rule);
      mockRedis.del.mockResolvedValue(1);

      const alertRuleRemovedSpy = jest.fn();
      performanceMonitor.on('alertRuleRemoved', alertRuleRemovedSpy);

      performanceMonitor.removeAlertRule('test-rule');

      expect(alertRuleRemovedSpy).toHaveBeenCalledWith(rule);
      expect(mockRedis.del).toHaveBeenCalledWith('alert_rule:test-rule');
    });

    it('should update alert rule', () => {
      const rule: AlertRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test alert rule',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
      };

      // Add rule first
      (performanceMonitor as any).alertRules.set('test-rule', rule);
      mockRedis.set.mockResolvedValue(undefined);

      const alertRuleUpdatedSpy = jest.fn();
      performanceMonitor.on('alertRuleUpdated', alertRuleUpdatedSpy);

      const updates = { threshold: 90, severity: 'critical' as const };
      performanceMonitor.updateAlertRule('test-rule', updates);

      expect(alertRuleUpdatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ ...rule, ...updates })
      );
    });

    it('should get alert rules', () => {
      const rule1: AlertRule = {
        id: 'rule-1',
        name: 'Rule 1',
        description: 'First rule',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [],
        cooldown: 1800,
      };

      const rule2: AlertRule = {
        id: 'rule-2',
        name: 'Rule 2',
        description: 'Second rule',
        metric: 'memory.usage',
        operator: '>',
        threshold: 90,
        duration: 300,
        severity: 'critical',
        enabled: true,
        actions: [],
        cooldown: 1800,
      };

      (performanceMonitor as any).alertRules.set('rule-1', rule1);
      (performanceMonitor as any).alertRules.set('rule-2', rule2);

      const rules = performanceMonitor.getAlertRules();

      expect(rules).toHaveLength(2);
      expect(rules).toContain(rule1);
      expect(rules).toContain(rule2);
    });
  });

  describe('alert processing', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should trigger alert when threshold exceeded', async () => {
      const rule: AlertRule = {
        id: 'cpu-alert',
        name: 'High CPU',
        description: 'CPU usage too high',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
      };

      (performanceMonitor as any).alertRules.set('cpu-alert', rule);

      const mockMetrics: PerformanceMetrics = {
        timestamp: new Date(),
        nodeId: 'test-node-1',
        cpu: { usage: 85, loadAverage: [1.0], cores: 4 },
      } as any;

      (performanceMonitor as any).lastMetrics = mockMetrics;
      mockRedis.set.mockResolvedValue(undefined);

      const alertTriggeredSpy = jest.fn();
      performanceMonitor.on('alertTriggered', alertTriggeredSpy);

      // Trigger alert check
      await (performanceMonitor as any).checkAlerts();

      expect(alertTriggeredSpy).toHaveBeenCalled();
      const triggeredAlert = alertTriggeredSpy.mock.calls[0][0];
      expect(triggeredAlert.ruleId).toBe('cpu-alert');
      expect(triggeredAlert.value).toBe(85);
      expect(triggeredAlert.threshold).toBe(80);
    });

    it('should not trigger alert when threshold not exceeded', async () => {
      const rule: AlertRule = {
        id: 'cpu-alert',
        name: 'High CPU',
        description: 'CPU usage too high',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
      };

      (performanceMonitor as any).alertRules.set('cpu-alert', rule);

      const mockMetrics: PerformanceMetrics = {
        timestamp: new Date(),
        nodeId: 'test-node-1',
        cpu: { usage: 75, loadAverage: [1.0], cores: 4 },
      } as any;

      (performanceMonitor as any).lastMetrics = mockMetrics;

      const alertTriggeredSpy = jest.fn();
      performanceMonitor.on('alertTriggered', alertTriggeredSpy);

      await (performanceMonitor as any).checkAlerts();

      expect(alertTriggeredSpy).not.toHaveBeenCalled();
    });

    it('should respect cooldown period', async () => {
      const rule: AlertRule = {
        id: 'cpu-alert',
        name: 'High CPU',
        description: 'CPU usage too high',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: true,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
        lastTriggered: new Date(Date.now() - 1000), // 1 second ago
      };

      (performanceMonitor as any).alertRules.set('cpu-alert', rule);

      const mockMetrics: PerformanceMetrics = {
        timestamp: new Date(),
        nodeId: 'test-node-1',
        cpu: { usage: 85, loadAverage: [1.0], cores: 4 },
      } as any;

      (performanceMonitor as any).lastMetrics = mockMetrics;

      const alertTriggeredSpy = jest.fn();
      performanceMonitor.on('alertTriggered', alertTriggeredSpy);

      await (performanceMonitor as any).checkAlerts();

      expect(alertTriggeredSpy).not.toHaveBeenCalled();
    });

    it('should not trigger disabled alerts', async () => {
      const rule: AlertRule = {
        id: 'cpu-alert',
        name: 'High CPU',
        description: 'CPU usage too high',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 80,
        duration: 300,
        severity: 'high',
        enabled: false,
        actions: [{ type: 'log', config: {} }],
        cooldown: 1800,
      };

      (performanceMonitor as any).alertRules.set('cpu-alert', rule);

      const mockMetrics: PerformanceMetrics = {
        timestamp: new Date(),
        nodeId: 'test-node-1',
        cpu: { usage: 85, loadAverage: [1.0], cores: 4 },
      } as any;

      (performanceMonitor as any).lastMetrics = mockMetrics;

      const alertTriggeredSpy = jest.fn();
      performanceMonitor.on('alertTriggered', alertTriggeredSpy);

      await (performanceMonitor as any).checkAlerts();

      expect(alertTriggeredSpy).not.toHaveBeenCalled();
    });
  });

  describe('alert resolution', () => {
    it('should resolve active alert', async () => {
      const alert = {
        id: 'alert-123',
        ruleId: 'cpu-alert',
        ruleName: 'High CPU',
        severity: 'high' as const,
        message: 'CPU usage is high',
        metric: 'cpu.usage',
        value: 85,
        threshold: 80,
        timestamp: new Date(),
        nodeId: 'test-node-1',
        resolved: false,
      };

      (performanceMonitor as any).activeAlerts.set('alert-123', alert);
      mockRedis.set.mockResolvedValue(undefined);

      const alertResolvedSpy = jest.fn();
      performanceMonitor.on('alertResolved', alertResolvedSpy);

      await performanceMonitor.resolveAlert('alert-123');

      expect(alert.resolved).toBe(true);
      expect(alert.resolvedAt).toBeInstanceOf(Date);
      expect(alertResolvedSpy).toHaveBeenCalledWith(alert);
    });

    it('should not resolve already resolved alert', async () => {
      const alert = {
        id: 'alert-123',
        ruleId: 'cpu-alert',
        ruleName: 'High CPU',
        severity: 'high' as const,
        message: 'CPU usage is high',
        metric: 'cpu.usage',
        value: 85,
        threshold: 80,
        timestamp: new Date(),
        nodeId: 'test-node-1',
        resolved: true,
        resolvedAt: new Date(),
      };

      (performanceMonitor as any).activeAlerts.set('alert-123', alert);

      const alertResolvedSpy = jest.fn();
      performanceMonitor.on('alertResolved', alertResolvedSpy);

      await performanceMonitor.resolveAlert('alert-123');

      expect(alertResolvedSpy).not.toHaveBeenCalled();
    });
  });

  describe('performance analysis', () => {
    it('should analyze performance trends', () => {
      const now = new Date();
      const metrics: PerformanceMetrics[] = [
        {
          timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          nodeId: 'test-node-1',
          cpu: { usage: 70, loadAverage: [1.0], cores: 4 },
          memory: {
            usage: 60,
            total: 8000000000,
            used: 4800000000,
            free: 3200000000,
            heapUsed: 100000000,
            heapTotal: 200000000,
          },
          database: {
            averageQueryTime: 50,
            connectionsActive: 5,
            connectionsIdle: 5,
            queriesPerSecond: 10,
            slowQueries: 0,
          },
          cache: { hitRate: 85, missRate: 15, memoryUsage: 1000000, operationsPerSecond: 100 },
          network: {
            connectionsActive: 10,
            connectionsTotal: 1000,
            bytesReceived: 1000000,
            bytesSent: 500000,
            requestsPerSecond: 50,
          },
          application: {
            uptime: 3600,
            activeImplants: 10,
            activeSessions: 5,
            commandsExecuted: 100,
            errorsPerMinute: 1,
          },
        },
        {
          timestamp: new Date(now.getTime() - 1 * 60 * 60 * 1000),
          nodeId: 'test-node-1',
          cpu: { usage: 80, loadAverage: [1.2], cores: 4 },
          memory: {
            usage: 70,
            total: 8000000000,
            used: 5600000000,
            free: 2400000000,
            heapUsed: 120000000,
            heapTotal: 200000000,
          },
          database: {
            averageQueryTime: 75,
            connectionsActive: 8,
            connectionsIdle: 2,
            queriesPerSecond: 15,
            slowQueries: 1,
          },
          cache: { hitRate: 75, missRate: 25, memoryUsage: 1200000, operationsPerSecond: 120 },
          network: {
            connectionsActive: 15,
            connectionsTotal: 1200,
            bytesReceived: 1200000,
            bytesSent: 600000,
            requestsPerSecond: 60,
          },
          application: {
            uptime: 7200,
            activeImplants: 12,
            activeSessions: 7,
            commandsExecuted: 150,
            errorsPerMinute: 2,
          },
        },
      ];

      (performanceMonitor as any).metricsHistory = metrics;

      const analysis = performanceMonitor.analyzePerformance(24);

      expect(analysis.summary).toMatchObject({
        averageCpuUsage: 75,
        averageMemoryUsage: 65,
        peakCpuUsage: 80,
        peakMemoryUsage: 70,
      });

      expect(analysis.trends).toMatchObject({
        cpu: 'degrading',
        memory: 'degrading',
        responseTime: 'degrading',
        cacheHitRate: 'degrading',
      });

      expect(analysis.recommendations).toBeInstanceOf(Array);
    });

    it('should return empty analysis for no metrics', () => {
      (performanceMonitor as any).metricsHistory = [];

      const analysis = performanceMonitor.analyzePerformance(24);

      expect(analysis.summary).toEqual({});
      expect(analysis.trends).toEqual({});
      expect(analysis.recommendations).toEqual([]);
    });

    it('should generate appropriate recommendations', () => {
      const metrics: PerformanceMetrics[] = [
        {
          timestamp: new Date(),
          nodeId: 'test-node-1',
          cpu: { usage: 95, loadAverage: [3.0], cores: 4 },
          memory: {
            usage: 90,
            total: 8000000000,
            used: 7200000000,
            free: 800000000,
            heapUsed: 180000000,
            heapTotal: 200000000,
          },
          database: {
            averageQueryTime: 1500,
            connectionsActive: 20,
            connectionsIdle: 0,
            queriesPerSecond: 50,
            slowQueries: 10,
          },
          cache: { hitRate: 60, missRate: 40, memoryUsage: 2000000, operationsPerSecond: 200 },
          network: {
            connectionsActive: 100,
            connectionsTotal: 5000,
            bytesReceived: 10000000,
            bytesSent: 5000000,
            requestsPerSecond: 200,
          },
          application: {
            uptime: 86400,
            activeImplants: 100,
            activeSessions: 50,
            commandsExecuted: 10000,
            errorsPerMinute: 10,
          },
        },
      ];

      (performanceMonitor as any).metricsHistory = metrics;

      const analysis = performanceMonitor.analyzePerformance(1);

      expect(analysis.recommendations).toContain(
        expect.stringContaining('High CPU usage detected')
      );
      expect(analysis.recommendations).toContain(
        expect.stringContaining('High memory usage detected')
      );
      expect(analysis.recommendations).toContain(expect.stringContaining('Low cache hit rate'));
      expect(analysis.recommendations).toContain(
        expect.stringContaining('High database response times')
      );
    });
  });

  describe('metric value extraction', () => {
    it('should extract nested metric values', () => {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        nodeId: 'test-node-1',
        cpu: { usage: 75, loadAverage: [1.0], cores: 4 },
        memory: {
          usage: 60,
          total: 8000000000,
          used: 4800000000,
          free: 3200000000,
          heapUsed: 100000000,
          heapTotal: 200000000,
        },
      } as any;

      const cpuUsage = (performanceMonitor as any).getMetricValue(metrics, 'cpu.usage');
      const memoryUsage = (performanceMonitor as any).getMetricValue(metrics, 'memory.usage');
      const invalidPath = (performanceMonitor as any).getMetricValue(metrics, 'invalid.path');

      expect(cpuUsage).toBe(75);
      expect(memoryUsage).toBe(60);
      expect(invalidPath).toBeUndefined();
    });
  });

  describe('condition evaluation', () => {
    it('should evaluate different operators correctly', () => {
      const evaluateCondition = (performanceMonitor as any).evaluateCondition.bind(
        performanceMonitor
      );

      expect(evaluateCondition(85, '>', 80)).toBe(true);
      expect(evaluateCondition(75, '>', 80)).toBe(false);
      expect(evaluateCondition(75, '<', 80)).toBe(true);
      expect(evaluateCondition(85, '<', 80)).toBe(false);
      expect(evaluateCondition(80, '>=', 80)).toBe(true);
      expect(evaluateCondition(79, '>=', 80)).toBe(false);
      expect(evaluateCondition(80, '<=', 80)).toBe(true);
      expect(evaluateCondition(81, '<=', 80)).toBe(false);
      expect(evaluateCondition(80, '==', 80)).toBe(true);
      expect(evaluateCondition(81, '==', 80)).toBe(false);
      expect(evaluateCondition(81, '!=', 80)).toBe(true);
      expect(evaluateCondition(80, '!=', 80)).toBe(false);
      expect(evaluateCondition(80, 'invalid' as any, 80)).toBe(false);
    });
  });
});
