/**
 * Scalability configuration management
 * Centralizes all scalability-related configuration
 */

import { CacheConfig } from '../cache/redis.service';
import { SessionConfig } from '../cache/session-cache.service';
import { ConnectionPoolConfig } from '../database/connection-pool.service';
import { LoadBalancerConfig } from '../scaling/load-balancer.service';
import { ClusterConfig } from '../scaling/cluster-manager.service';
import { DistributedSessionConfig } from '../scaling/distributed-session.service';
import { MonitoringConfig } from '../monitoring/performance-monitor.service';

export interface ScalabilityConfig {
  redis: CacheConfig;
  session: SessionConfig;
  distributedSession: DistributedSessionConfig;
  connectionPool: ConnectionPoolConfig;
  loadBalancer: LoadBalancerConfig;
  cluster: ClusterConfig;
  monitoring: MonitoringConfig;
}

export function getScalabilityConfig(): ScalabilityConfig {
  return {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'seraphc2:',
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
      lazyConnect: true,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
      commandTimeout: 5000,
      family: 4,
      keepAlive: 30000,
      noDelay: true,
    },

    session: {
      defaultTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || '3600'),
      maxIdleTimeSeconds: parseInt(process.env.SESSION_MAX_IDLE_SECONDS || '1800'),
      enableSlidingExpiration: process.env.SESSION_ENABLE_SLIDING_EXPIRATION === 'true',
      maxConcurrentSessions: parseInt(process.env.SESSION_MAX_CONCURRENT || '10'),
      sessionKeyPrefix: 'session:',
    },

    distributedSession: {
      sessionSyncInterval: 30000,
      sessionReplicationFactor: 2,
      enableSessionMigration: process.env.SESSION_ENABLE_DISTRIBUTED === 'true',
      enableSessionFailover: true,
      sessionConsistencyLevel: 'eventual',
      conflictResolutionStrategy: 'last-write-wins',
      enableSessionBroadcast: true,
      broadcastChannel: 'session_events',
    },

    connectionPool: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'seraphc2',
      user: process.env.DB_USER || 'seraphc2',
      password: process.env.DB_PASSWORD || 'password',
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '10000'),
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      enableHealthCheck: process.env.DB_ENABLE_HEALTH_CHECK === 'true',
      healthCheckIntervalMs: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000'),
      healthCheckQuery: 'SELECT 1',
      enableQueryLogging: true,
      slowQueryThresholdMs: 1000,
      enableConnectionMetrics: true,
      validateConnection: true,
      validationQuery: 'SELECT 1',
      testOnBorrow: true,
      testOnReturn: false,
      testWhileIdle: true,
    },

    loadBalancer: {
      algorithm: (process.env.LB_ALGORITHM as any) || 'round-robin',
      healthCheckInterval: parseInt(process.env.LB_HEALTH_CHECK_INTERVAL || '30000'),
      healthCheckTimeout: parseInt(process.env.LB_HEALTH_CHECK_TIMEOUT || '5000'),
      healthCheckPath: '/api/health',
      maxRetries: parseInt(process.env.LB_MAX_RETRIES || '3'),
      retryDelay: 1000,
      enableStickySessions: process.env.LB_ENABLE_STICKY_SESSIONS === 'true',
      sessionAffinityKey: 'sessionId',
      enableCircuitBreaker: process.env.LB_ENABLE_CIRCUIT_BREAKER === 'true',
      circuitBreakerThreshold: parseInt(process.env.LB_CIRCUIT_BREAKER_THRESHOLD || '5'),
      circuitBreakerTimeout: 30000,
    },

    cluster: {
      nodeId: process.env.NODE_ID || `seraphc2-node-${Date.now()}`,
      role: (process.env.NODE_ROLE as any) || 'primary',
      heartbeatInterval: parseInt(process.env.CLUSTER_HEARTBEAT_INTERVAL || '5000'),
      heartbeatTimeout: parseInt(process.env.CLUSTER_HEARTBEAT_TIMEOUT || '15000'),
      electionTimeout: 10000,
      enableAutoScaling: process.env.CLUSTER_ENABLE_AUTO_SCALING === 'true',
      minNodes: parseInt(process.env.CLUSTER_MIN_NODES || '1'),
      maxNodes: parseInt(process.env.CLUSTER_MAX_NODES || '10'),
      scaleUpThreshold: 80,
      scaleDownThreshold: 30,
      loadBalancerConfig: {
        algorithm: 'least-connections',
        healthCheckInterval: 30000,
        healthCheckTimeout: 5000,
        healthCheckPath: '/api/health',
        maxRetries: 3,
        retryDelay: 1000,
        enableStickySessions: false,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 5,
        circuitBreakerTimeout: 30000,
      },
    },

    monitoring: {
      metricsInterval: parseInt(process.env.MONITORING_METRICS_INTERVAL || '30000'),
      retentionDays: parseInt(process.env.MONITORING_RETENTION_DAYS || '7'),
      enableAlerting: process.env.MONITORING_ENABLE_ALERTING === 'true',
      alertCheckInterval: parseInt(process.env.MONITORING_ALERT_CHECK_INTERVAL || '60000'),
      maxAlertsPerHour: parseInt(process.env.MONITORING_MAX_ALERTS_PER_HOUR || '10'),
      enableMetricsAggregation: true,
      aggregationInterval: 300000, // 5 minutes
    },
  };
}

export function validateScalabilityConfig(config: ScalabilityConfig): string[] {
  const errors: string[] = [];

  // Validate Redis configuration
  if (!config.redis.host) {
    errors.push('Redis host is required');
  }
  if (config.redis.port < 1 || config.redis.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }

  // Validate session configuration
  if (config.session.defaultTtlSeconds < 60) {
    errors.push('Session TTL must be at least 60 seconds');
  }
  if (config.session.maxConcurrentSessions < 1) {
    errors.push('Max concurrent sessions must be at least 1');
  }

  // Validate connection pool configuration
  if (!config.connectionPool.host) {
    errors.push('Database host is required');
  }
  if (config.connectionPool.min! < 1) {
    errors.push('Database pool minimum connections must be at least 1');
  }
  if (config.connectionPool.max! < config.connectionPool.min!) {
    errors.push('Database pool maximum must be greater than or equal to minimum');
  }

  // Validate cluster configuration
  if (!config.cluster.nodeId) {
    errors.push('Node ID is required for cluster configuration');
  }
  if (config.cluster.minNodes < 1) {
    errors.push('Minimum cluster nodes must be at least 1');
  }
  if (config.cluster.maxNodes < config.cluster.minNodes) {
    errors.push('Maximum cluster nodes must be greater than or equal to minimum');
  }

  // Validate monitoring configuration
  if (config.monitoring.metricsInterval < 1000) {
    errors.push('Metrics collection interval must be at least 1000ms');
  }
  if (config.monitoring.retentionDays < 1) {
    errors.push('Metrics retention must be at least 1 day');
  }

  return errors;
}

export function getEnvironmentInfo(): {
  nodeId: string;
  role: string;
  clusterEnabled: boolean;
  monitoringEnabled: boolean;
  distributedSessionsEnabled: boolean;
} {
  return {
    nodeId: process.env.NODE_ID || `seraphc2-node-${Date.now()}`,
    role: process.env.NODE_ROLE || 'primary',
    clusterEnabled: process.env.CLUSTER_ENABLE === 'true',
    monitoringEnabled: process.env.MONITORING_ENABLE === 'true',
    distributedSessionsEnabled: process.env.SESSION_ENABLE_DISTRIBUTED === 'true',
  };
}
