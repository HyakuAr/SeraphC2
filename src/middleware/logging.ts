/**
 * SeraphC2 Logging Middleware
 * Express middleware for automatic request/response logging with security features
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger, log } from '../utils/logger';

// Extend Express Request interface to include logging context
declare global {
  namespace Express {
    interface Request {
      logger: Logger;
      requestId: string;
      correlationId: string;
      startTime: number;
    }
  }
}

/**
 * Request logging middleware
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Generate unique identifiers for request tracing
  req.requestId = uuidv4();
  req.correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.startTime = Date.now();

  // Create a logger instance with request context
  req.logger = Logger.getInstance();
  req.logger.setRequestId(req.requestId);
  req.logger.setCorrelationId(req.correlationId);

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', req.correlationId);
  res.setHeader('X-Request-ID', req.requestId);

  // Log incoming request
  const requestMeta = {
    method: req.method,
    url: sanitizeUrl(req.url),
    userAgent: req.headers['user-agent'],
    ip: getClientIp(req),
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type'],
    referer: req.headers['referer'],
    origin: req.headers['origin'],
  };

  req.logger.info(`Incoming ${req.method} request to ${sanitizeUrl(req.url)}`, requestMeta);

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function (chunk?: any, encoding?: any, cb?: any): Response {
    const duration = Date.now() - req.startTime;

    // Log API request with performance metrics
    req.logger.api(req.method, sanitizeUrl(req.url), res.statusCode, duration, {
      responseSize: res.get('content-length'),
      userAgent: req.headers['user-agent'],
      ip: getClientIp(req),
    });

    // Log security events for suspicious status codes
    if (res.statusCode === 401) {
      req.logger.security('unauthorized_access_attempt', {
        method: req.method,
        url: sanitizeUrl(req.url),
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
    } else if (res.statusCode === 403) {
      req.logger.security('forbidden_access_attempt', {
        method: req.method,
        url: sanitizeUrl(req.url),
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
    } else if (res.statusCode === 429) {
      req.logger.security('rate_limit_exceeded', {
        method: req.method,
        url: sanitizeUrl(req.url),
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });
    }

    // Log slow requests as performance issues
    if (duration > 5000) {
      // 5 seconds
      req.logger.warn(`Slow request detected: ${req.method} ${sanitizeUrl(req.url)}`, {
        duration,
        statusCode: res.statusCode,
        category: 'performance',
      });
    }

    // Call original end method
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
}

/**
 * Error logging middleware
 */
export function errorLoggingMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const duration = Date.now() - req.startTime;

  // Log the error with full context
  req.logger.error(`Request error: ${error.message}`, error, {
    method: req.method,
    url: sanitizeUrl(req.url),
    statusCode: res.statusCode,
    duration,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    stack: error.stack,
  });

  // Log security events for potential attacks
  if (error.message.includes('validation') || error.message.includes('invalid')) {
    req.logger.security('input_validation_failure', {
      method: req.method,
      url: sanitizeUrl(req.url),
      error: error.message,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  next(error);
}

/**
 * Authentication logging middleware
 */
export function authenticationLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Override authentication methods to add logging
  const originalJson = res.json;
  res.json = function (body: any) {
    // Check if this is an authentication response
    if (req.url.includes('/auth/') || req.url.includes('/login')) {
      const success = res.statusCode >= 200 && res.statusCode < 300;
      const user = body?.user?.username || body?.username || 'unknown';

      req.logger.authentication(success ? 'login_success' : 'login_failure', user, success, {
        method: req.method,
        url: sanitizeUrl(req.url),
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        statusCode: res.statusCode,
      });

      // Log failed login attempts as security events
      if (!success) {
        req.logger.security('failed_login_attempt', {
          user,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'],
          url: sanitizeUrl(req.url),
        });
      }
    }

    return originalJson.call(this, body);
  };

  next();
}

/**
 * Database operation logging middleware
 */
export function createDatabaseLoggingWrapper<T extends (...args: any[]) => any>(
  operation: string,
  table: string,
  fn: T
): T {
  return ((...args: any[]) => {
    const start = Date.now();

    try {
      const result = fn(...args);

      // Handle both sync and async operations
      if (result && typeof result.then === 'function') {
        return result
          .then((data: any) => {
            const duration = Date.now() - start;
            log.database(operation, table, duration, { success: true });
            return data;
          })
          .catch((error: Error) => {
            const duration = Date.now() - start;
            log.database(operation, table, duration, {
              success: false,
              error: error.message,
            });
            throw error;
          });
      } else {
        const duration = Date.now() - start;
        log.database(operation, table, duration, { success: true });
        return result;
      }
    } catch (error) {
      const duration = Date.now() - start;
      log.database(operation, table, duration, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }) as T;
}

/**
 * Sanitize URL to remove sensitive information
 */
function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url, 'http://localhost');

    // Remove sensitive query parameters
    const sensitiveParams = ['password', 'token', 'secret', 'key', 'auth', 'session'];
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    });

    return urlObj.pathname + urlObj.search;
  } catch {
    // If URL parsing fails, just return the original path without query params
    return url.split('?')[0];
  }
}

/**
 * Get client IP address from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'] as string;
  const realIp = req.headers['x-real-ip'] as string;
  const clientIp = req.headers['x-client-ip'] as string;

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (clientIp) {
    return clientIp;
  }

  return req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limiting logging helper
 */
export function logRateLimitExceeded(req: Request, limit: number, windowMs: number): void {
  req.logger.security('rate_limit_exceeded', {
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    url: sanitizeUrl(req.url),
    method: req.method,
    limit,
    windowMs,
  });
}

/**
 * CORS violation logging helper
 */
export function logCorsViolation(req: Request, origin: string): void {
  req.logger.security('cors_violation', {
    origin,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
    url: sanitizeUrl(req.url),
    method: req.method,
  });
}

/**
 * File upload logging helper
 */
export function logFileUpload(
  req: Request,
  filename: string,
  size: number,
  mimetype: string
): void {
  req.logger.audit(req.user?.username || 'anonymous', 'file_upload', filename, {
    size,
    mimetype,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });
}

/**
 * Data export logging helper
 */
export function logDataExport(req: Request, dataType: string, recordCount: number): void {
  req.logger.audit(req.user?.username || 'anonymous', 'data_export', dataType, {
    recordCount,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'],
  });
}
