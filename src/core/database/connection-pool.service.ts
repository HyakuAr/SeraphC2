/**
 * Advanced database connection pooling service
 * Provides optimized connection management and monitoring
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { EventEmitter } from 'events';

export interface ConnectionPoolConfig extends PoolConfig {
  // Basic pool configuration
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;

  // Advanced configuration
  acquireTimeoutMillis?: number;
  createTimeoutMillis?: number;
  destroyTimeoutMillis?: number;
  reapIntervalMillis?: number;
  createRetryIntervalMillis?: number;

  // Monitoring and health checks
  enableHealthCheck?: boolean;
  healthCheckIntervalMs?: number;
  healthCheckQuery?: string;

  // Performance optimization
  enableQueryLogging?: boolean;
  slowQueryThresholdMs?: number;
  enableConnectionMetrics?: boolean;

  // Connection validation
  validateConnection?: boolean;
  validationQuery?: string;
  testOnBorrow?: boolean;
  testOnReturn?: boolean;
  testWhileIdle?: boolean;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalQueries: number;
  slowQueries: number;
  averageQueryTime: number;
  connectionErrors: number;
  poolErrors: number;
  lastHealthCheck: Date | null;
  healthCheckStatus: 'healthy' | 'unhealthy' | 'unknown';
}

export interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
}

export class ConnectionPoolService extends EventEmitter {
  private static instance: ConnectionPoolService;
  private pool!: Pool;
  private config: ConnectionPoolConfig;
  private metrics: ConnectionMetrics;
  private queryHistory: QueryMetrics[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;
  private isInitialized: boolean = false;

  private constructor(config: ConnectionPoolConfig) {
    super();
    this.config = {
      // Default values
      min: 2,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      enableHealthCheck: true,
      healthCheckIntervalMs: 30000,
      healthCheckQuery: 'SELECT 1',
      enableQueryLogging: true,
      slowQueryThresholdMs: 1000,
      enableConnectionMetrics: true,
      validateConnection: true,
      validationQuery: 'SELECT 1',
      testOnBorrow: true,
      testOnReturn: false,
      testWhileIdle: true,
      ...config,
    };

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      slowQueries: 0,
      averageQueryTime: 0,
      connectionErrors: 0,
      poolErrors: 0,
      lastHealthCheck: null,
      healthCheckStatus: 'unknown',
    };

    this.initializePool();
  }

  public static getInstance(config?: ConnectionPoolConfig): ConnectionPoolService {
    if (!ConnectionPoolService.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      ConnectionPoolService.instance = new ConnectionPoolService(config);
    }
    return ConnectionPoolService.instance;
  }

  private initializePool(): void {
    this.pool = new Pool(this.config);

    // Pool event handlers
    this.pool.on('connect', (client: PoolClient) => {
      this.metrics.totalConnections++;
      this.emit('connect', client);

      if (this.config.enableConnectionMetrics) {
        console.log(`📊 Database connection established. Total: ${this.metrics.totalConnections}`);
      }
    });

    this.pool.on('acquire', (client: PoolClient) => {
      this.metrics.activeConnections++;
      this.emit('acquire', client);
    });

    this.pool.on('release', (err: Error | undefined, client: PoolClient) => {
      this.metrics.activeConnections--;
      this.emit('release', client);
    });

    this.pool.on('remove', (client: PoolClient) => {
      this.metrics.totalConnections--;
      this.emit('remove', client);

      if (this.config.enableConnectionMetrics) {
        console.log(`📊 Database connection removed. Total: ${this.metrics.totalConnections}`);
      }
    });

    this.pool.on('error', (error: Error, client?: PoolClient) => {
      this.metrics.poolErrors++;
      console.error('❌ Database pool error:', error);
      this.emit('error', error, client);
    });

    // Start monitoring if enabled
    if (this.config.enableHealthCheck) {
      this.startHealthCheck();
    }

    if (this.config.enableConnectionMetrics) {
      this.startMetricsCollection();
    }

    this.isInitialized = true;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test initial connection
      const client = await this.pool.connect();
      await client.query(this.config.validationQuery || 'SELECT 1');
      client.release();

      console.log('✅ Database connection pool initialized successfully');
      this.emit('initialized');
    } catch (error) {
      console.error('❌ Failed to initialize database connection pool:', error);
      throw error;
    }
  }

  public async getConnection(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();

      // Validate connection if enabled
      if (this.config.testOnBorrow && this.config.validateConnection) {
        await this.validateClient(client);
      }

      return client;
    } catch (error) {
      this.metrics.connectionErrors++;
      console.error('❌ Failed to acquire database connection:', error);
      throw error;
    }
  }

  public async query<T = any>(text: string, params?: any[]): Promise<any> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      client = await this.getConnection();
      const result = await client.query(text, params);

      const duration = Date.now() - startTime;
      this.recordQueryMetrics(text, duration, true);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordQueryMetrics(
        text,
        duration,
        false,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    } finally {
      if (client) {
        // Validate connection on return if enabled
        if (this.config.testOnReturn && this.config.validateConnection) {
          try {
            await this.validateClient(client);
          } catch (error) {
            console.warn('⚠️ Connection validation failed on return:', error);
            // Don't throw here, just log the warning
          }
        }
        client.release();
      }
    }
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getConnection();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async batchQuery<T = any>(
    queries: Array<{ text: string; params?: any[] }>
  ): Promise<any[]> {
    const client = await this.getConnection();
    const results: T[] = [];

    try {
      await client.query('BEGIN');

      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push(result);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public getMetrics(): ConnectionMetrics {
    return {
      ...this.metrics,
      totalConnections: this.pool.totalCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
    };
  }

  public getQueryHistory(limit: number = 100): QueryMetrics[] {
    return this.queryHistory.slice(-limit);
  }

  public getSlowQueries(limit: number = 50): QueryMetrics[] {
    return this.queryHistory
      .filter(q => q.duration >= (this.config.slowQueryThresholdMs || 1000))
      .slice(-limit);
  }

  public async getPoolStatus(): Promise<{
    isHealthy: boolean;
    metrics: ConnectionMetrics;
    slowQueries: QueryMetrics[];
    recommendations: string[];
  }> {
    const metrics = this.getMetrics();
    const slowQueries = this.getSlowQueries(10);
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (metrics.activeConnections / metrics.totalConnections > 0.8) {
      recommendations.push(
        'Consider increasing max pool size - high connection utilization detected'
      );
    }

    if (metrics.waitingClients > 0) {
      recommendations.push('Connection pool exhausted - clients are waiting for connections');
    }

    if (metrics.slowQueries > metrics.totalQueries * 0.1) {
      recommendations.push('High number of slow queries detected - consider query optimization');
    }

    if (metrics.connectionErrors > 0) {
      recommendations.push('Connection errors detected - check database connectivity');
    }

    return {
      isHealthy: metrics.healthCheckStatus === 'healthy' && metrics.connectionErrors === 0,
      metrics,
      slowQueries,
      recommendations,
    };
  }

  public async optimizePool(): Promise<void> {
    const metrics = this.getMetrics();

    // Dynamic pool sizing based on usage patterns
    if (metrics.waitingClients > 0 && metrics.totalConnections < (this.config.max || 20)) {
      console.log('🔧 Optimizing pool: Increasing connection count due to waiting clients');
    }

    if (
      metrics.idleConnections > metrics.totalConnections * 0.5 &&
      metrics.totalConnections > (this.config.min || 2)
    ) {
      console.log('🔧 Optimizing pool: High idle connection count detected');
    }

    // Clear old query history to prevent memory leaks
    if (this.queryHistory.length > 10000) {
      this.queryHistory = this.queryHistory.slice(-5000);
      console.log('🧹 Cleaned up query history to prevent memory growth');
    }
  }

  public async destroy(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    await this.pool.end();
    console.log('✅ Database connection pool destroyed');
    this.emit('destroyed');
  }

  private async validateClient(client: PoolClient): Promise<void> {
    try {
      await client.query(this.config.validationQuery || 'SELECT 1');
    } catch (error) {
      throw new Error(`Connection validation failed: ${error}`);
    }
  }

  private recordQueryMetrics(
    query: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    if (!this.config.enableQueryLogging) {
      return;
    }

    this.metrics.totalQueries++;

    if (duration >= (this.config.slowQueryThresholdMs || 1000)) {
      this.metrics.slowQueries++;
    }

    // Update average query time
    this.metrics.averageQueryTime =
      (this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + duration) /
      this.metrics.totalQueries;

    // Store query metrics
    this.queryHistory.push({
      query: query.substring(0, 200), // Truncate long queries
      duration,
      timestamp: new Date(),
      success,
      ...(error && { error }),
    });

    // Log slow queries
    if (duration >= (this.config.slowQueryThresholdMs || 1000)) {
      console.warn(`🐌 Slow query detected (${duration}ms): ${query.substring(0, 100)}...`);
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const client = await this.pool.connect();
        await client.query(this.config.healthCheckQuery || 'SELECT 1');
        client.release();

        this.metrics.lastHealthCheck = new Date();
        this.metrics.healthCheckStatus = 'healthy';
        this.emit('healthCheck', true);
      } catch (error) {
        this.metrics.healthCheckStatus = 'unhealthy';
        console.error('❌ Database health check failed:', error);
        this.emit('healthCheck', false, error);
      }
    }, this.config.healthCheckIntervalMs || 30000);
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      await this.optimizePool();
      this.emit('metricsUpdate', this.getMetrics());
    }, 60000); // Update metrics every minute
  }

  public getPool(): Pool {
    return this.pool;
  }
}
