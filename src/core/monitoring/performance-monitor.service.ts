/**
 * Performance monitoring service
 * Tracks system metrics and provides alerting capabilities
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { RedisService } from '../cache/redis.service';

export interface PerformanceMetrics {
  timestamp: Date;
  nodeId: string;

  // System metrics
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };

  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
    heapUsed: number;
    heapTotal: number;
  };

  // Network metrics
  network: {
    connectionsActive: number;
    connectionsTotal: number;
    bytesReceived: number;
    bytesSent: number;
    requestsPerSecond: number;
  };

  // Database metrics
  database: {
    connectionsActive: number;
    connectionsIdle: number;
    queriesPerSecond: number;
    averageQueryTime: number;
    slowQueries: number;
  };

  // Cache metrics
  cache: {
    hitRate: number;
    missRate: number;
    memoryUsage: number;
    operationsPerSecond: number;
  };

  // Application metrics
  application: {
    uptime: number;
    activeImplants: number;
    activeSessions: number;
    commandsExecuted: number;
    errorsPerMinute: number;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  duration: number; // seconds
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: AlertAction[];
  cooldown: number; // seconds
  lastTriggered?: Date;
}

export interface AlertAction {
  type: 'log' | 'email' | 'webhook' | 'slack';
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  nodeId: string;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface MonitoringConfig {
  metricsInterval: number;
  retentionDays: number;
  enableAlerting: boolean;
  alertCheckInterval: number;
  maxAlertsPerHour: number;
  enableMetricsAggregation: boolean;
  aggregationInterval: number;
}

export class PerformanceMonitorService extends EventEmitter {
  private static instance: PerformanceMonitorService;
  private redis: RedisService;
  private config: MonitoringConfig;
  private nodeId: string;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private metricsHistory: PerformanceMetrics[] = [];
  private metricsInterval?: NodeJS.Timeout;
  private alertInterval?: NodeJS.Timeout;
  private aggregationInterval?: NodeJS.Timeout;
  private lastMetrics?: PerformanceMetrics;
  private alertCounts: Map<string, number> = new Map();

  private constructor(redis: RedisService, config: MonitoringConfig, nodeId: string) {
    super();
    this.redis = redis;
    this.config = config;
    this.nodeId = nodeId;

    this.initializeDefaultAlertRules();
  }

  public static getInstance(
    redis?: RedisService,
    config?: MonitoringConfig,
    nodeId?: string
  ): PerformanceMonitorService {
    if (!PerformanceMonitorService.instance) {
      if (!redis || !config || !nodeId) {
        throw new Error('All parameters required for first initialization');
      }
      PerformanceMonitorService.instance = new PerformanceMonitorService(redis, config, nodeId);
    }
    return PerformanceMonitorService.instance;
  }

  public async start(): Promise<void> {
    try {
      // Load existing alert rules
      await this.loadAlertRules();

      // Start metrics collection
      this.startMetricsCollection();

      // Start alerting if enabled
      if (this.config.enableAlerting) {
        this.startAlerting();
      }

      // Start metrics aggregation if enabled
      if (this.config.enableMetricsAggregation) {
        this.startMetricsAggregation();
      }

      console.log(`📊 Performance monitoring started for node ${this.nodeId}`);
      this.emit('started');
    } catch (error) {
      console.error('❌ Failed to start performance monitoring:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.alertInterval) {
      clearInterval(this.alertInterval);
    }

    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }

    console.log('🛑 Performance monitoring stopped');
    this.emit('stopped');
  }

  public async getCurrentMetrics(): Promise<PerformanceMetrics> {
    return await this.collectMetrics();
  }

  public getMetricsHistory(hours: number = 24): PerformanceMetrics[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.metricsHistory.filter(m => m.timestamp >= cutoff);
  }

  public async getAggregatedMetrics(
    startTime: Date,
    endTime: Date,
    interval: 'minute' | 'hour' | 'day' = 'hour'
  ): Promise<PerformanceMetrics[]> {
    const key = `metrics:aggregated:${interval}:${this.nodeId}`;
    const start = startTime.getTime();
    const end = endTime.getTime();

    const results = await this.redis.zrange(key, start, end);
    return results.map(r => JSON.parse(r));
  }

  // Alert rule management
  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.saveAlertRule(rule);
    console.log(`📋 Added alert rule: ${rule.name}`);
    this.emit('alertRuleAdded', rule);
  }

  public removeAlertRule(ruleId: string): void {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      this.alertRules.delete(ruleId);
      this.deleteAlertRule(ruleId);
      console.log(`🗑️ Removed alert rule: ${rule.name}`);
      this.emit('alertRuleRemoved', rule);
    }
  }

  public updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      const updatedRule = { ...rule, ...updates };
      this.alertRules.set(ruleId, updatedRule);
      this.saveAlertRule(updatedRule);
      console.log(`✏️ Updated alert rule: ${rule.name}`);
      this.emit('alertRuleUpdated', updatedRule);
    }
  }

  public getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(a => !a.resolved);
  }

  public async resolveAlert(alertId: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();

      await this.saveAlert(alert);
      console.log(`✅ Resolved alert: ${alert.ruleName}`);
      this.emit('alertResolved', alert);
    }
  }

  // Performance analysis
  public analyzePerformance(hours: number = 24): {
    summary: Record<string, any>;
    trends: Record<string, 'improving' | 'stable' | 'degrading'>;
    recommendations: string[];
  } {
    const metrics = this.getMetricsHistory(hours);
    if (metrics.length === 0) {
      return { summary: {}, trends: {}, recommendations: [] };
    }

    const latest = metrics[metrics.length - 1];
    const oldest = metrics[0];

    const summary = {
      averageCpuUsage: this.calculateAverage(metrics, m => m.cpu.usage),
      averageMemoryUsage: this.calculateAverage(metrics, m => m.memory.usage),
      peakCpuUsage: Math.max(...metrics.map(m => m.cpu.usage)),
      peakMemoryUsage: Math.max(...metrics.map(m => m.memory.usage)),
      totalRequests: latest.network.connectionsTotal - oldest.network.connectionsTotal,
      averageResponseTime: this.calculateAverage(metrics, m => m.database.averageQueryTime),
      cacheHitRate: this.calculateAverage(metrics, m => m.cache.hitRate),
      uptime: latest.application.uptime,
    };

    const trends = {
      cpu: this.calculateTrend(metrics, m => m.cpu.usage),
      memory: this.calculateTrend(metrics, m => m.memory.usage),
      responseTime: this.calculateTrend(metrics, m => m.database.averageQueryTime),
      cacheHitRate: this.calculateTrend(metrics, m => m.cache.hitRate),
    };

    const recommendations = this.generateRecommendations(summary, trends);

    return { summary, trends, recommendations };
  }

  // Private methods
  private async collectMetrics(): Promise<PerformanceMetrics> {
    const timestamp = new Date();

    // System metrics
    const cpuUsage = await this.getCpuUsage();
    const memoryInfo = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
    };

    // Network metrics (would be collected from actual network interfaces)
    const networkMetrics = await this.getNetworkMetrics();

    // Database metrics (would be collected from connection pool)
    const databaseMetrics = await this.getDatabaseMetrics();

    // Cache metrics
    const cacheStats = await this.redis.getStats();

    // Application metrics
    const applicationMetrics = await this.getApplicationMetrics();

    const metrics: PerformanceMetrics = {
      timestamp,
      nodeId: this.nodeId,
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg(),
        cores: os.cpus().length,
      },
      memory: {
        total: systemMemory.total,
        used: systemMemory.total - systemMemory.free,
        free: systemMemory.free,
        usage: ((systemMemory.total - systemMemory.free) / systemMemory.total) * 100,
        heapUsed: memoryInfo.heapUsed,
        heapTotal: memoryInfo.heapTotal,
      },
      network: networkMetrics,
      database: databaseMetrics,
      cache: {
        hitRate: (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100 || 0,
        missRate: (cacheStats.misses / (cacheStats.hits + cacheStats.misses)) * 100 || 0,
        memoryUsage: cacheStats.memoryUsage,
        operationsPerSecond: (cacheStats.sets + cacheStats.deletes) / 60, // Approximate
      },
      application: applicationMetrics,
    };

    return metrics;
  }

  private async getCpuUsage(): Promise<number> {
    return new Promise(resolve => {
      const startUsage = process.cpuUsage();
      const startTime = Date.now();

      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = Date.now();

        const totalTime = (endTime - startTime) * 1000; // Convert to microseconds
        const cpuTime = endUsage.user + endUsage.system;
        const usage = (cpuTime / totalTime) * 100;

        resolve(Math.min(usage, 100));
      }, 100);
    });
  }

  private async getNetworkMetrics(): Promise<PerformanceMetrics['network']> {
    // In a real implementation, this would collect actual network metrics
    return {
      connectionsActive: Math.floor(Math.random() * 100),
      connectionsTotal: Math.floor(Math.random() * 10000),
      bytesReceived: Math.floor(Math.random() * 1000000),
      bytesSent: Math.floor(Math.random() * 1000000),
      requestsPerSecond: Math.floor(Math.random() * 100),
    };
  }

  private async getDatabaseMetrics(): Promise<PerformanceMetrics['database']> {
    // In a real implementation, this would collect from connection pool
    return {
      connectionsActive: Math.floor(Math.random() * 20),
      connectionsIdle: Math.floor(Math.random() * 10),
      queriesPerSecond: Math.floor(Math.random() * 50),
      averageQueryTime: Math.random() * 100,
      slowQueries: Math.floor(Math.random() * 5),
    };
  }

  private async getApplicationMetrics(): Promise<PerformanceMetrics['application']> {
    return {
      uptime: process.uptime(),
      activeImplants: Math.floor(Math.random() * 100),
      activeSessions: Math.floor(Math.random() * 50),
      commandsExecuted: Math.floor(Math.random() * 1000),
      errorsPerMinute: Math.floor(Math.random() * 5),
    };
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();

        // Store in memory
        this.metricsHistory.push(metrics);
        this.lastMetrics = metrics;

        // Cleanup old metrics
        const cutoff = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
        this.metricsHistory = this.metricsHistory.filter(m => m.timestamp >= cutoff);

        // Store in Redis
        await this.storeMetrics(metrics);

        this.emit('metricsCollected', metrics);
      } catch (error) {
        console.error('❌ Metrics collection failed:', error);
      }
    }, this.config.metricsInterval);
  }

  private startAlerting(): void {
    this.alertInterval = setInterval(async () => {
      try {
        await this.checkAlerts();
      } catch (error) {
        console.error('❌ Alert checking failed:', error);
      }
    }, this.config.alertCheckInterval);
  }

  private startMetricsAggregation(): void {
    this.aggregationInterval = setInterval(async () => {
      try {
        await this.aggregateMetrics();
      } catch (error) {
        console.error('❌ Metrics aggregation failed:', error);
      }
    }, this.config.aggregationInterval);
  }

  private async checkAlerts(): Promise<void> {
    if (!this.lastMetrics) return;

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      // Check cooldown
      if (rule.lastTriggered) {
        const timeSinceLastTrigger = Date.now() - rule.lastTriggered.getTime();
        if (timeSinceLastTrigger < rule.cooldown * 1000) {
          continue;
        }
      }

      // Check rate limiting
      const hourKey = `${rule.id}:${Math.floor(Date.now() / 3600000)}`;
      const alertCount = this.alertCounts.get(hourKey) || 0;
      if (alertCount >= this.config.maxAlertsPerHour) {
        continue;
      }

      const value = this.getMetricValue(this.lastMetrics, rule.metric);
      if (value !== undefined && this.evaluateCondition(value, rule.operator, rule.threshold)) {
        await this.triggerAlert(rule, value);
      }
    }
  }

  private async triggerAlert(rule: AlertRule, value: number): Promise<void> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      timestamp: new Date(),
      nodeId: this.nodeId,
      resolved: false,
    };

    this.activeAlerts.set(alert.id, alert);
    rule.lastTriggered = new Date();

    // Update rate limiting
    const hourKey = `${rule.id}:${Math.floor(Date.now() / 3600000)}`;
    this.alertCounts.set(hourKey, (this.alertCounts.get(hourKey) || 0) + 1);

    // Execute alert actions
    for (const action of rule.actions) {
      await this.executeAlertAction(action, alert);
    }

    await this.saveAlert(alert);
    console.warn(`🚨 Alert triggered: ${alert.message}`);
    this.emit('alertTriggered', alert);
  }

  private async executeAlertAction(action: AlertAction, alert: Alert): Promise<void> {
    try {
      switch (action.type) {
        case 'log':
          console.log(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
          break;
        case 'webhook':
          // In a real implementation, this would make HTTP request
          console.log(`📡 Webhook alert: ${alert.message}`);
          break;
        case 'email':
          // In a real implementation, this would send email
          console.log(`📧 Email alert: ${alert.message}`);
          break;
        case 'slack':
          // In a real implementation, this would send to Slack
          console.log(`💬 Slack alert: ${alert.message}`);
          break;
      }
    } catch (error) {
      console.error(`❌ Failed to execute alert action ${action.type}:`, error);
    }
  }

  private getMetricValue(metrics: PerformanceMetrics, path: string): number | undefined {
    const parts = path.split('.');
    let value: any = metrics;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return typeof value === 'number' ? value : undefined;
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      case '==':
        return value === threshold;
      case '!=':
        return value !== threshold;
      default:
        return false;
    }
  }

  private calculateAverage(
    metrics: PerformanceMetrics[],
    accessor: (m: PerformanceMetrics) => number
  ): number {
    if (metrics.length === 0) return 0;
    const sum = metrics.reduce((acc, m) => acc + accessor(m), 0);
    return sum / metrics.length;
  }

  private calculateTrend(
    metrics: PerformanceMetrics[],
    accessor: (m: PerformanceMetrics) => number
  ): 'improving' | 'stable' | 'degrading' {
    if (metrics.length < 2) return 'stable';

    const values = metrics.map(accessor);
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 5) return 'degrading';
    if (change < -5) return 'improving';
    return 'stable';
  }

  private generateRecommendations(summary: any, trends: any): string[] {
    const recommendations: string[] = [];

    if (summary.averageCpuUsage > 80) {
      recommendations.push(
        'High CPU usage detected - consider scaling up or optimizing CPU-intensive operations'
      );
    }

    if (summary.averageMemoryUsage > 85) {
      recommendations.push(
        'High memory usage detected - check for memory leaks or consider increasing available memory'
      );
    }

    if (summary.cacheHitRate < 80) {
      recommendations.push('Low cache hit rate - review caching strategy and cache key patterns');
    }

    if (summary.averageResponseTime > 1000) {
      recommendations.push(
        'High database response times - consider query optimization or database scaling'
      );
    }

    if (trends.cpu === 'degrading') {
      recommendations.push('CPU usage trend is degrading - monitor for performance regressions');
    }

    if (trends.memory === 'degrading') {
      recommendations.push('Memory usage trend is degrading - investigate potential memory leaks');
    }

    return recommendations;
  }

  private initializeDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-cpu',
        name: 'High CPU Usage',
        description: 'CPU usage exceeds 90%',
        metric: 'cpu.usage',
        operator: '>',
        threshold: 90,
        duration: 300,
        severity: 'high',
        enabled: true,
        cooldown: 1800,
        actions: [{ type: 'log', config: {} }],
      },
      {
        id: 'high-memory',
        name: 'High Memory Usage',
        description: 'Memory usage exceeds 90%',
        metric: 'memory.usage',
        operator: '>',
        threshold: 90,
        duration: 300,
        severity: 'high',
        enabled: true,
        cooldown: 1800,
        actions: [{ type: 'log', config: {} }],
      },
      {
        id: 'low-cache-hit-rate',
        name: 'Low Cache Hit Rate',
        description: 'Cache hit rate below 70%',
        metric: 'cache.hitRate',
        operator: '<',
        threshold: 70,
        duration: 600,
        severity: 'medium',
        enabled: true,
        cooldown: 3600,
        actions: [{ type: 'log', config: {} }],
      },
    ];

    defaultRules.forEach(rule => this.alertRules.set(rule.id, rule));
  }

  // Storage methods
  private async storeMetrics(metrics: PerformanceMetrics): Promise<void> {
    const key = `metrics:raw:${this.nodeId}`;
    await this.redis.zadd(key, metrics.timestamp.getTime(), JSON.stringify(metrics));

    // Set TTL for cleanup
    await this.redis.expire(key, this.config.retentionDays * 24 * 60 * 60);
  }

  private async aggregateMetrics(): Promise<void> {
    // Aggregate hourly metrics
    const hourKey = `metrics:aggregated:hour:${this.nodeId}`;
    const now = new Date();
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    // Get metrics for the current hour
    const rawKey = `metrics:raw:${this.nodeId}`;
    const hourMetrics = await this.redis.zrange(rawKey, hourStart.getTime(), now.getTime());

    if (hourMetrics.length > 0) {
      const parsedMetrics = hourMetrics.map(m => JSON.parse(m));
      const aggregated = this.aggregateMetricsArray(parsedMetrics);

      await this.redis.zadd(hourKey, hourStart.getTime(), JSON.stringify(aggregated));
      await this.redis.expire(hourKey, 30 * 24 * 60 * 60); // 30 days
    }
  }

  private aggregateMetricsArray(metrics: PerformanceMetrics[]): PerformanceMetrics {
    if (metrics.length === 0) throw new Error('No metrics to aggregate');

    const first = metrics[0];
    const aggregated: PerformanceMetrics = {
      timestamp: new Date(Math.max(...metrics.map(m => m.timestamp.getTime()))),
      nodeId: first.nodeId,
      cpu: {
        usage: this.calculateAverage(metrics, m => m.cpu.usage),
        loadAverage: first.cpu.loadAverage,
        cores: first.cpu.cores,
      },
      memory: {
        total: first.memory.total,
        used: this.calculateAverage(metrics, m => m.memory.used),
        free: this.calculateAverage(metrics, m => m.memory.free),
        usage: this.calculateAverage(metrics, m => m.memory.usage),
        heapUsed: this.calculateAverage(metrics, m => m.memory.heapUsed),
        heapTotal: this.calculateAverage(metrics, m => m.memory.heapTotal),
      },
      network: {
        connectionsActive: this.calculateAverage(metrics, m => m.network.connectionsActive),
        connectionsTotal: Math.max(...metrics.map(m => m.network.connectionsTotal)),
        bytesReceived: metrics.reduce((sum, m) => sum + m.network.bytesReceived, 0),
        bytesSent: metrics.reduce((sum, m) => sum + m.network.bytesSent, 0),
        requestsPerSecond: this.calculateAverage(metrics, m => m.network.requestsPerSecond),
      },
      database: {
        connectionsActive: this.calculateAverage(metrics, m => m.database.connectionsActive),
        connectionsIdle: this.calculateAverage(metrics, m => m.database.connectionsIdle),
        queriesPerSecond: this.calculateAverage(metrics, m => m.database.queriesPerSecond),
        averageQueryTime: this.calculateAverage(metrics, m => m.database.averageQueryTime),
        slowQueries: Math.max(...metrics.map(m => m.database.slowQueries)),
      },
      cache: {
        hitRate: this.calculateAverage(metrics, m => m.cache.hitRate),
        missRate: this.calculateAverage(metrics, m => m.cache.missRate),
        memoryUsage: this.calculateAverage(metrics, m => m.cache.memoryUsage),
        operationsPerSecond: this.calculateAverage(metrics, m => m.cache.operationsPerSecond),
      },
      application: {
        uptime: Math.max(...metrics.map(m => m.application.uptime)),
        activeImplants: this.calculateAverage(metrics, m => m.application.activeImplants),
        activeSessions: this.calculateAverage(metrics, m => m.application.activeSessions),
        commandsExecuted: metrics.reduce((sum, m) => sum + m.application.commandsExecuted, 0),
        errorsPerMinute: this.calculateAverage(metrics, m => m.application.errorsPerMinute),
      },
    };

    return aggregated;
  }

  private async loadAlertRules(): Promise<void> {
    const keys = await this.redis.keys('alert_rule:*');

    for (const key of keys) {
      const rule = await this.redis.get<AlertRule>(key);
      if (rule) {
        this.alertRules.set(rule.id, rule);
      }
    }
  }

  private async saveAlertRule(rule: AlertRule): Promise<void> {
    const key = `alert_rule:${rule.id}`;
    await this.redis.set(key, rule);
  }

  private async deleteAlertRule(ruleId: string): Promise<void> {
    const key = `alert_rule:${ruleId}`;
    await this.redis.del(key);
  }

  private async saveAlert(alert: Alert): Promise<void> {
    const key = `alert:${alert.id}`;
    await this.redis.set(key, alert, 7 * 24 * 60 * 60); // 7 days TTL
  }
}
