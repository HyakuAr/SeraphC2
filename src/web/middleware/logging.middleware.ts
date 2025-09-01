/**
 * Request logging middleware for Express.js
 * Provides structured logging of HTTP requests and responses
 */

import { Request, Response, NextFunction } from 'express';

export interface RequestLogData {
  method: string;
  url: string;
  ip: string;
  userAgent: string | undefined;
  contentLength: number | undefined;
  statusCode: number | undefined;
  responseTime: number | undefined;
  timestamp: string;
  operatorId: string | undefined;
  error?: string;
}

/**
 * Request logging middleware
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Capture original end function
    const originalEnd = res.end;

    // Override end function to capture response data
    res.end = function (chunk?: any, encoding?: any): any {
      const responseTime = Date.now() - startTime;

      const logData: RequestLogData = {
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length') ? parseInt(req.get('Content-Length')!) : undefined,
        statusCode: res.statusCode,
        responseTime,
        timestamp,
        operatorId: req.operator?.id,
      };

      // Log different levels based on status code
      if (res.statusCode >= 500) {
        console.error('HTTP Request Error:', logData);
      } else if (res.statusCode >= 400) {
        console.warn('HTTP Request Warning:', logData);
      } else {
        console.log('HTTP Request:', logData);
      }

      // Call original end function
      return originalEnd.call(this, chunk, encoding);
    };

    return next();
  };
}

/**
 * Security-focused request logger that excludes sensitive data
 */
export function secureRequestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // List of sensitive headers to exclude from logs
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

    // Filter out sensitive headers
    const safeHeaders = Object.keys(req.headers).reduce(
      (acc, key) => {
        if (!sensitiveHeaders.includes(key.toLowerCase())) {
          acc[key] = req.headers[key];
        } else {
          acc[key] = '[REDACTED]';
        }
        return acc;
      },
      {} as Record<string, any>
    );

    // Capture original end function
    const originalEnd = res.end;

    // Override end function to capture response data
    res.end = function (chunk?: any, encoding?: any): any {
      const responseTime = Date.now() - startTime;

      const logData = {
        method: req.method,
        url: req.originalUrl || req.url,
        ip: req.ip || req.connection.remoteAddress || 'unknown',
        headers: safeHeaders,
        statusCode: res.statusCode,
        responseTime,
        timestamp,
        operatorId: req.operator?.id,
        bodySize: chunk ? Buffer.byteLength(chunk) : 0,
      };

      // Log with appropriate level
      if (res.statusCode >= 500) {
        console.error('Secure HTTP Request Error:', logData);
      } else if (res.statusCode >= 400) {
        console.warn('Secure HTTP Request Warning:', logData);
      } else if (process.env['NODE_ENV'] === 'development') {
        console.log('Secure HTTP Request:', logData);
      }

      // Call original end function
      return originalEnd.call(this, chunk, encoding);
    };

    return next();
  };
}

/**
 * Performance monitoring middleware
 */
export function performanceLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();

    // Capture original end function
    const originalEnd = res.end;

    // Override end function to capture performance data
    res.end = function (chunk?: any, encoding?: any): any {
      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();

      const responseTimeNs = endTime - startTime;
      const responseTimeMs = Number(responseTimeNs) / 1000000; // Convert to milliseconds

      const memoryDelta = {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
      };

      const performanceData = {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        responseTime: Math.round(responseTimeMs * 100) / 100, // Round to 2 decimal places
        memoryDelta: {
          rss: Math.round(memoryDelta.rss / 1024), // Convert to KB
          heapTotal: Math.round(memoryDelta.heapTotal / 1024),
          heapUsed: Math.round(memoryDelta.heapUsed / 1024),
          external: Math.round(memoryDelta.external / 1024),
        },
        timestamp: new Date().toISOString(),
      };

      // Log slow requests (> 1000ms) as warnings
      if (responseTimeMs > 1000) {
        console.warn('Slow HTTP Request:', performanceData);
      } else if (process.env['NODE_ENV'] === 'development') {
        console.log('HTTP Performance:', performanceData);
      }

      // Call original end function
      return originalEnd.call(this, chunk, encoding);
    };

    return next();
  };
}
