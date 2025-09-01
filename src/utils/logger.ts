/**
 * SeraphC2 Production-Ready Logging Utility
 * Provides structured logging with Winston, security-safe logging,
 * log rotation, and retention policies
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Production configuration
const isProduction = process.env['NODE_ENV'] === 'production';
const logLevel = process.env['LOG_LEVEL'] || (isProduction ? 'info' : 'debug');
const maxLogSize = process.env['LOG_MAX_SIZE'] || '20m';
const maxLogFiles = process.env['LOG_MAX_FILES'] || '14d';
const logRetentionDays = parseInt(process.env['LOG_RETENTION_DAYS'] || '30');

// Sensitive data patterns to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /auth/i,
  /credential/i,
  /session/i,
  /cookie/i,
  /bearer/i,
  /jwt/i,
];

// PII patterns to redact
const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses (partial redaction)
];

/**
 * Sanitizes sensitive data from log entries
 */
function sanitizeLogData(data: any): any {
  if (typeof data === 'string') {
    let sanitized = data;

    // Redact PII patterns
    PII_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  if (typeof data === 'object' && data !== null) {
    const sanitized: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      // Check if key contains sensitive information
      const isSensitiveKey = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));

      if (isSensitiveKey) {
        // Hash sensitive values for debugging while maintaining privacy
        if (typeof value === 'string' && value.length > 0) {
          const hash = crypto.createHash('sha256').update(value).digest('hex').substring(0, 8);
          sanitized[key] = `[HASHED:${hash}]`;
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }

    return sanitized;
  }

  return data;
}

/**
 * Custom format for production logging with sanitization
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const logEntry: Record<string, unknown> = {
      '@timestamp': timestamp,
      '@version': '1',
      level: level.toUpperCase(),
      message: sanitizeLogData(message),
      service: 'seraphc2',
      environment: process.env['NODE_ENV'] || 'development',
      version: process.env['npm_package_version'] || '1.0.0',
      hostname: process.env['HOSTNAME'] || 'unknown',
      pid: process.pid,
    };

    if (stack) {
      logEntry['error'] = {
        stack: sanitizeLogData(stack),
        type: 'exception',
      };
    }

    // Sanitize metadata
    if (Object.keys(meta).length > 0) {
      logEntry['metadata'] = sanitizeLogData(meta);
    }

    // Add correlation ID if available
    if (meta.correlationId) {
      logEntry['correlation_id'] = meta.correlationId;
    }

    // Add request ID if available
    if (meta.requestId) {
      logEntry['request_id'] = meta.requestId;
    }

    return JSON.stringify(logEntry);
  })
);

/**
 * Development format for console output
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let output = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(sanitizeLogData(meta), null, 2)}`;
    }

    if (stack) {
      output += `\n${stack}`;
    }

    return output;
  })
);

/**
 * Create daily rotate file transport
 */
function createRotateFileTransport(filename: string, level?: string) {
  return new DailyRotateFile({
    filename: path.join(logsDir, `${filename}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: maxLogSize,
    maxFiles: maxLogFiles,
    level: level,
    format: productionFormat,
    auditFile: path.join(logsDir, `.${filename}-audit.json`),
  });
}

// Create logger instance with production-ready configuration
const logger = winston.createLogger({
  level: logLevel,
  format: isProduction ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'seraphc2',
    version: process.env['npm_package_version'] || '1.0.0',
    environment: process.env['NODE_ENV'] || 'development',
  },
  transports: [
    // Error logs with daily rotation
    createRotateFileTransport('error', 'error'),

    // Combined logs with daily rotation
    createRotateFileTransport('combined'),

    // Security logs with daily rotation
    createRotateFileTransport('security', 'warn'),

    // Audit logs with daily rotation
    createRotateFileTransport('audit', 'info'),

    // Performance logs with daily rotation
    createRotateFileTransport('performance', 'info'),
  ],

  // Handle uncaught exceptions and rejections with rotation
  exceptionHandlers: [createRotateFileTransport('exceptions')],

  rejectionHandlers: [createRotateFileTransport('rejections')],

  // Exit on handled exceptions in production
  exitOnError: isProduction,
});

// Add console transport for non-production environments
if (!isProduction) {
  logger.add(
    new winston.transports.Console({
      format: developmentFormat,
      level: logLevel,
    })
  );
}

// Add structured logging for production monitoring
if (isProduction) {
  // Add HTTP transport for centralized logging (optional)
  if (process.env['LOG_HTTP_ENDPOINT']) {
    logger.add(
      new winston.transports.Http({
        host: process.env['LOG_HTTP_HOST'] || 'localhost',
        port: parseInt(process.env['LOG_HTTP_PORT'] || '80'),
        path: process.env['LOG_HTTP_PATH'] || '/logs',
        ssl: process.env['LOG_HTTP_SSL'] === 'true',
        format: productionFormat,
      })
    );
  }
}

/**
 * Log levels enum for type safety
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * Log categories for structured logging
 */
export enum LogCategory {
  SECURITY = 'security',
  AUDIT = 'audit',
  PERFORMANCE = 'performance',
  BUSINESS = 'business',
  SYSTEM = 'system',
  API = 'api',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
}

/**
 * Enhanced structured logging methods with production safety
 */
export const log = {
  error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
    const logData = {
      category: LogCategory.SYSTEM,
      ...meta,
    };

    if (error) {
      (logData as any).error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    logger.error(message, logData);
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    logger.warn(message, {
      category: LogCategory.SYSTEM,
      ...meta,
    });
  },

  info: (message: string, meta?: Record<string, unknown>) => {
    logger.info(message, {
      category: LogCategory.SYSTEM,
      ...meta,
    });
  },

  debug: (message: string, meta?: Record<string, unknown>) => {
    logger.debug(message, {
      category: LogCategory.SYSTEM,
      ...meta,
    });
  },

  // Security-specific logging with enhanced metadata
  security: (event: string, details: Record<string, unknown>) => {
    logger.warn(`SECURITY_EVENT: ${event}`, {
      category: LogCategory.SECURITY,
      event_type: 'security_incident',
      severity: 'high',
      timestamp: new Date().toISOString(),
      ...details,
    });
  },

  // Audit logging for compliance and operator actions
  audit: (operator: string, action: string, target?: string, details?: Record<string, unknown>) => {
    logger.info(`AUDIT_LOG: ${action}`, {
      category: LogCategory.AUDIT,
      event_type: 'audit_trail',
      operator: sanitizeLogData(operator),
      action,
      target: sanitizeLogData(target),
      timestamp: new Date().toISOString(),
      ...details,
    });
  },

  // Performance logging with metrics
  performance: (operation: string, duration: number, meta?: Record<string, unknown>) => {
    logger.info(`PERFORMANCE_METRIC: ${operation}`, {
      category: LogCategory.PERFORMANCE,
      event_type: 'performance_metric',
      operation,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },

  // API request/response logging
  api: (
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    meta?: Record<string, unknown>
  ) => {
    logger.info(`API_REQUEST: ${method} ${path}`, {
      category: LogCategory.API,
      event_type: 'api_request',
      http_method: method,
      http_path: sanitizeLogData(path),
      http_status: statusCode,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },

  // Database operation logging
  database: (
    operation: string,
    table: string,
    duration: number,
    meta?: Record<string, unknown>
  ) => {
    logger.debug(`DATABASE_OPERATION: ${operation} on ${table}`, {
      category: LogCategory.DATABASE,
      event_type: 'database_operation',
      operation,
      table,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },

  // Authentication events
  authentication: (
    event: string,
    user: string,
    success: boolean,
    meta?: Record<string, unknown>
  ) => {
    const level = success ? 'info' : 'warn';
    logger[level](`AUTH_EVENT: ${event}`, {
      category: LogCategory.AUTHENTICATION,
      event_type: 'authentication',
      auth_event: event,
      user: sanitizeLogData(user),
      success,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },

  // Authorization events
  authorization: (
    event: string,
    user: string,
    resource: string,
    allowed: boolean,
    meta?: Record<string, unknown>
  ) => {
    const level = allowed ? 'info' : 'warn';
    logger[level](`AUTHZ_EVENT: ${event}`, {
      category: LogCategory.AUTHORIZATION,
      event_type: 'authorization',
      authz_event: event,
      user: sanitizeLogData(user),
      resource: sanitizeLogData(resource),
      allowed,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },

  // Business logic events
  business: (event: string, meta?: Record<string, unknown>) => {
    logger.info(`BUSINESS_EVENT: ${event}`, {
      category: LogCategory.BUSINESS,
      event_type: 'business_logic',
      business_event: event,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  },
};

/**
 * Enhanced Logger class with production-ready features
 */
export class Logger {
  private static instance: Logger;
  private winston: winston.Logger;
  private correlationId?: string;
  private requestId?: string;

  constructor(category?: string) {
    this.winston = category ? logger.child({ category }) : logger;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set correlation ID for request tracing
   */
  public setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  /**
   * Set request ID for request tracing
   */
  public setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  /**
   * Get base metadata with tracing information
   */
  private getBaseMeta(meta?: Record<string, unknown>): Record<string, unknown> {
    const baseMeta: Record<string, unknown> = {
      ...meta,
    };

    if (this.correlationId) {
      baseMeta.correlationId = this.correlationId;
    }

    if (this.requestId) {
      baseMeta.requestId = this.requestId;
    }

    return baseMeta;
  }

  public error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    log.error(message, error, this.getBaseMeta(meta));
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    log.warn(message, this.getBaseMeta(meta));
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    log.info(message, this.getBaseMeta(meta));
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    log.debug(message, this.getBaseMeta(meta));
  }

  public critical(message: string, meta?: Record<string, unknown>): void {
    log.error(`CRITICAL: ${message}`, undefined, this.getBaseMeta(meta));
  }

  public security(event: string, details: Record<string, unknown>): void {
    log.security(event, this.getBaseMeta(details));
  }

  public audit(
    operator: string,
    action: string,
    target?: string,
    details?: Record<string, unknown>
  ): void {
    log.audit(operator, action, target, this.getBaseMeta(details));
  }

  public performance(operation: string, duration: number, meta?: Record<string, unknown>): void {
    log.performance(operation, duration, this.getBaseMeta(meta));
  }

  public api(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    meta?: Record<string, unknown>
  ): void {
    log.api(method, path, statusCode, duration, this.getBaseMeta(meta));
  }

  public database(
    operation: string,
    table: string,
    duration: number,
    meta?: Record<string, unknown>
  ): void {
    log.database(operation, table, duration, this.getBaseMeta(meta));
  }

  public authentication(
    event: string,
    user: string,
    success: boolean,
    meta?: Record<string, unknown>
  ): void {
    log.authentication(event, user, success, this.getBaseMeta(meta));
  }

  public authorization(
    event: string,
    user: string,
    resource: string,
    allowed: boolean,
    meta?: Record<string, unknown>
  ): void {
    log.authorization(event, user, resource, allowed, this.getBaseMeta(meta));
  }

  public business(event: string, meta?: Record<string, unknown>): void {
    log.business(event, this.getBaseMeta(meta));
  }

  /**
   * Create a child logger with additional context
   */
  public child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger();
    childLogger.correlationId = this.correlationId;
    childLogger.requestId = this.requestId;

    // Override the winston instance with additional default metadata
    childLogger.winston = this.winston.child(sanitizeLogData(context));

    return childLogger;
  }

  /**
   * Time a function execution and log performance
   */
  public async timeAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    meta?: Record<string, unknown>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.performance(operation, duration, { ...meta, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.performance(operation, duration, {
        ...meta,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Time a synchronous function execution and log performance
   */
  public time<T>(operation: string, fn: () => T, meta?: Record<string, unknown>): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.performance(operation, duration, { ...meta, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.performance(operation, duration, {
        ...meta,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

/**
 * Log retention and cleanup utilities
 */
export class LogRetention {
  private static readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Start automatic log cleanup
   */
  public static startCleanup(): void {
    if (!isProduction) {
      return; // Only run cleanup in production
    }

    setInterval(() => {
      LogRetention.cleanupOldLogs();
    }, LogRetention.CLEANUP_INTERVAL);

    // Run initial cleanup
    LogRetention.cleanupOldLogs();
  }

  /**
   * Clean up old log files based on retention policy
   */
  private static cleanupOldLogs(): void {
    try {
      const files = fs.readdirSync(logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - logRetentionDays);

      files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < cutoffDate && file.endsWith('.log')) {
          fs.unlinkSync(filePath);
          logger.info(`Cleaned up old log file: ${file}`, {
            category: LogCategory.SYSTEM,
            event_type: 'log_cleanup',
            file,
            age_days: Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }
      });
    } catch (error) {
      logger.error(
        'Failed to cleanup old logs',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          category: LogCategory.SYSTEM,
          event_type: 'log_cleanup_error',
        }
      );
    }
  }
}

// Start log cleanup in production
if (isProduction) {
  LogRetention.startCleanup();
}

export default logger;

export function createLogger(category: string) {
  return new Logger(category);
}
