/**
 * SeraphC2 Monitoring Middleware
 * Comprehensive metrics collection and performance monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { log } from '../../utils/logger';

export interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  contentLength: number;
  userAgent?: string;
  ip?: string;
  timestamp: Date;
}

export interface SystemMetrics {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
    byPath: Record<string, number>;
  };
  performance: {
    averageResponseTime: number;
    slowestRequests: RequestMetrics[];
    fastestRequests: RequestMetrics[];
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    recent: Array<{ timestamp: Date; error: string; path: string }>;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

/**
 * Metrics collector class for centralized metrics management
 */
export class MetricsCollector {
  private static instance: MetricsCollector;
  private requestMetrics: RequestMetrics[] = [];
  private errorMetrics: Array<{ timestamp: Date; error: string; path: string }> = [];
  private readonly maxMetricsHistory = 1000;
  private readonly maxErrorHistory = 100;

  private constructor() {
    // Clean up old metrics periodically
    setInterval(() => this.cleanupOldMetrics(), 300000); // 5 minutes
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Record a request metric
   */
  public recordRequest(metric: RequestMetrics): void {
    this.requestMetrics.push(metric);

    // Keep only recent metrics
    if (this.requestMetrics.length > this.maxMetricsHistory) {
      this.requestMetrics = this.requestMetrics.slice(-this.maxMetricsHistory);
    }

    // Log slow requests
    if (metric.responseTime > 5000) {
      log.performance('Slow request detected', metric.responseTime, {
        path: metric.path,
        method: metric.method,
        statusCode: metric.statusCode,
      });
    }
  }

  /**
   * Record an error metric
   */
  public recordError(error: string, path: string): void {
    this.errorMetrics.push({
      timestamp: new Date(),
      error,
      path,
    });

    // Keep only recent errors
    if (this.errorMetrics.length > this.maxErrorHistory) {
      this.errorMetrics = this.errorMetrics.slice(-this.maxErrorHistory);
    }
  }

  /**
   * Get comprehensive system metrics
   */
  public getMetrics(): SystemMetrics {
    const now = Date.now();
    const recentMetrics = this.requestMetrics.filter(
      m => now - m.timestamp.getTime() < 3600000 // Last hour
    );

    // Calculate request statistics
    const requestsByMethod = recentMetrics.reduce(
      (acc, m) => {
        acc[m.method] = (acc[m.method] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const requestsByStatus = recentMetrics.reduce(
      (acc, m) => {
        const statusGroup = `${Math.floor(m.statusCode / 100)}xx`;
        acc[statusGroup] = (acc[statusGroup] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const requestsByPath = recentMetrics.reduce(
      (acc, m) => {
        acc[m.path] = (acc[m.path] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate performance statistics
    const responseTimes = recentMetrics.map(m => m.responseTime);
    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

    const sortedByResponseTime = [...recentMetrics].sort((a, b) => b.responseTime - a.responseTime);
    const slowestRequests = sortedByResponseTime.slice(0, 10);
    const fastestRequests = sortedByResponseTime.slice(-10).reverse();

    // Calculate error statistics
    const recentErrors = this.errorMetrics.filter(
      e => now - e.timestamp.getTime() < 3600000 // Last hour
    );

    const errorsByType = recentErrors.reduce(
      (acc, e) => {
        acc[e.error] = (acc[e.error] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      requests: {
        total: recentMetrics.length,
        byMethod: requestsByMethod,
        byStatus: requestsByStatus,
        byPath: requestsByPath,
      },
      performance: {
        averageResponseTime,
        slowestRequests,
        fastestRequests,
      },
      errors: {
        total: recentErrors.length,
        byType: errorsByType,
        recent: recentErrors.slice(-20), // Last 20 errors
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };
  }

  /**
   * Get metrics in Prometheus format
   */
  public getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Request metrics
    lines.push('# HELP seraphc2_requests_total Total number of HTTP requests');
    lines.push('# TYPE seraphc2_requests_total counter');
    lines.push(`seraphc2_requests_total ${metrics.requests.total}`);

    // Response time metrics
    lines.push('# HELP seraphc2_response_time_avg Average response time in milliseconds');
    lines.push('# TYPE seraphc2_response_time_avg gauge');
    lines.push(`seraphc2_response_time_avg ${metrics.performance.averageResponseTime}`);

    // Memory metrics
    lines.push('# HELP seraphc2_memory_usage_bytes Memory usage in bytes');
    lines.push('# TYPE seraphc2_memory_usage_bytes gauge');
    lines.push(`seraphc2_memory_usage_bytes{type="rss"} ${metrics.system.memoryUsage.rss}`);
    lines.push(
      `seraphc2_memory_usage_bytes{type="heapTotal"} ${metrics.system.memoryUsage.heapTotal}`
    );
    lines.push(
      `seraphc2_memory_usage_bytes{type="heapUsed"} ${metrics.system.memoryUsage.heapUsed}`
    );

    // Error metrics
    lines.push('# HELP seraphc2_errors_total Total number of errors');
    lines.push('# TYPE seraphc2_errors_total counter');
    lines.push(`seraphc2_errors_total ${metrics.errors.total}`);

    // Uptime metrics
    lines.push('# HELP seraphc2_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE seraphc2_uptime_seconds gauge');
    lines.push(`seraphc2_uptime_seconds ${metrics.system.uptime}`);

    return lines.join('\n') + '\n';
  }

  /**
   * Clean up old metrics to prevent memory leaks
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - 86400000; // 24 hours ago

    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp.getTime() > cutoffTime);

    this.errorMetrics = this.errorMetrics.filter(e => e.timestamp.getTime() > cutoffTime);

    log.debug('Cleaned up old metrics', {
      requestMetrics: this.requestMetrics.length,
      errorMetrics: this.errorMetrics.length,
    });
  }

  /**
   * Reset all metrics (for testing purposes)
   */
  public reset(): void {
    this.requestMetrics = [];
    this.errorMetrics = [];
    log.debug('Metrics reset');
  }
}

/**
 * Request monitoring middleware
 */
export function requestMonitoring() {
  const collector = MetricsCollector.getInstance();

  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const startCpuUsage = process.cpuUsage();

    // Capture original end method
    const originalEnd = res.end;
    const originalSend = res.send;

    let responseEnded = false;

    const recordMetrics = () => {
      if (responseEnded) return;
      responseEnded = true;

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const endCpuUsage = process.cpuUsage(startCpuUsage);

      const metric: RequestMetrics = {
        method: req.method,
        path: req.route?.path || req.path,
        statusCode: res.statusCode,
        responseTime,
        contentLength: parseInt(res.get('Content-Length') || '0', 10),
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date(startTime),
      };

      collector.recordRequest(metric);

      // Log performance metrics
      log.performance('Request completed', responseTime, {
        ...metric,
        cpuUsage: {
          user: endCpuUsage.user,
          system: endCpuUsage.system,
        },
      });
    };

    // Override response methods to capture metrics
    res.end = function (chunk?: any, encoding?: any): any {
      recordMetrics();
      return originalEnd.call(this, chunk, encoding);
    };

    res.send = function (data: any): any {
      recordMetrics();
      return originalSend.call(this, data);
    };

    // Handle connection close
    req.on('close', () => {
      if (!responseEnded) {
        recordMetrics();
      }
    });

    return next();
  };
}

/**
 * Error monitoring middleware
 */
export function errorMonitoring() {
  const collector = MetricsCollector.getInstance();

  return (error: Error, req: Request, res: Response, next: NextFunction): void => {
    // Record error metric
    collector.recordError(error.name || 'UnknownError', req.path);

    // Log error with context
    log.error('Request error', error, {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
    });

    return next(error);
  };
}

/**
 * Performance monitoring middleware
 */
export function performanceMonitoring(
  options: {
    slowRequestThreshold?: number;
    memoryWarningThreshold?: number;
  } = {}
) {
  const { slowRequestThreshold = 1000, memoryWarningThreshold = 500 * 1024 * 1024 } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Monitor memory usage
    const memoryUsed = startMemory.heapUsed;
    if (memoryUsed > memoryWarningThreshold) {
      log.warn('High memory usage detected', {
        memoryUsed: Math.round(memoryUsed / 1024 / 1024),
        threshold: Math.round(memoryWarningThreshold / 1024 / 1024),
        path: req.path,
      });
    }

    // Override response to measure performance
    const originalSend = res.send;
    res.send = function (data: any): any {
      const responseTime = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

      // Log slow requests
      if (responseTime > slowRequestThreshold) {
        log.performance('Slow request detected', responseTime, {
          path: req.path,
          method: req.method,
          memoryDelta: Math.round(memoryDelta / 1024),
          statusCode: res.statusCode,
        });
      }

      return originalSend.call(this, data);
    };

    return next();
  };
}

/**
 * Health check monitoring middleware
 */
export function healthCheckMonitoring() {
  let lastHealthCheck = Date.now();
  let healthCheckCount = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Track health check requests
    if (req.path.startsWith('/api/health')) {
      healthCheckCount++;
      lastHealthCheck = Date.now();

      // Log health check frequency
      if (healthCheckCount % 100 === 0) {
        log.debug('Health check milestone', {
          count: healthCheckCount,
          lastCheck: new Date(lastHealthCheck).toISOString(),
        });
      }
    }

    return next();
  };
}

/**
 * Metrics endpoint middleware
 */
export function metricsEndpoint(path: string = '/metrics') {
  const collector = MetricsCollector.getInstance();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === path && req.method === 'GET') {
      const format = req.query.format as string;

      if (format === 'prometheus') {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(collector.getPrometheusMetrics());
      } else {
        res.json({
          success: true,
          data: collector.getMetrics(),
        });
      }
      return;
    }

    return next();
  };
}

/**
 * Comprehensive monitoring middleware stack
 */
export function comprehensiveMonitoring(
  options: {
    enableRequestMonitoring?: boolean;
    enableErrorMonitoring?: boolean;
    enablePerformanceMonitoring?: boolean;
    enableHealthCheckMonitoring?: boolean;
    enableMetricsEndpoint?: boolean;
    metricsPath?: string;
    slowRequestThreshold?: number;
    memoryWarningThreshold?: number;
  } = {}
) {
  const {
    enableRequestMonitoring = true,
    enableErrorMonitoring = true,
    enablePerformanceMonitoring = true,
    enableHealthCheckMonitoring = true,
    enableMetricsEndpoint = true,
    metricsPath = '/metrics',
    slowRequestThreshold = 1000,
    memoryWarningThreshold = 500 * 1024 * 1024,
  } = options;

  const middlewares: any[] = [];

  if (enableMetricsEndpoint) {
    middlewares.push(metricsEndpoint(metricsPath));
  }

  if (enableRequestMonitoring) {
    middlewares.push(requestMonitoring());
  }

  if (enablePerformanceMonitoring) {
    middlewares.push(performanceMonitoring({ slowRequestThreshold, memoryWarningThreshold }));
  }

  if (enableHealthCheckMonitoring) {
    middlewares.push(healthCheckMonitoring());
  }

  if (enableErrorMonitoring) {
    middlewares.push(errorMonitoring());
  }

  return middlewares;
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();
