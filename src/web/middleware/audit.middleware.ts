/**
 * Audit Middleware
 * Automatically logs HTTP requests and responses for audit trail
 */

import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../../core/audit/audit.service';

export interface AuditedRequest extends Request {
  operatorId?: string;
  startTime?: number;
}

export class AuditMiddleware {
  private auditService: AuditService;
  private excludedPaths: Set<string>;
  private excludedMethods: Set<string>;

  constructor() {
    this.auditService = AuditService.getInstance();

    // Paths to exclude from audit logging (health checks, static assets, etc.)
    this.excludedPaths = new Set(['/health', '/favicon.ico', '/static', '/assets']);

    // Methods to exclude from audit logging
    this.excludedMethods = new Set(['OPTIONS']);
  }

  /**
   * Middleware to log HTTP requests
   */
  logRequest() {
    return (req: AuditedRequest, res: Response, next: NextFunction) => {
      // Skip excluded paths and methods
      if (this.shouldExclude(req)) {
        return next();
      }

      req.startTime = Date.now();

      // Log the request
      this.auditService.logEvent({
        operatorId: req.operatorId,
        action: 'http_request',
        resourceType: 'api',
        resourceId: `${req.method} ${req.path}`,
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          headers: this.sanitizeHeaders(req.headers),
          body: this.sanitizeBody(req.body),
        },
        ipAddress: this.getClientIP(req),
        userAgent: req.get('User-Agent'),
        success: true,
      });

      // Override res.json to capture response
      const originalJson = res.json;
      res.json = function (body: any) {
        const responseTime = req.startTime ? Date.now() - req.startTime : 0;

        // Log the response
        AuditService.getInstance().logEvent({
          operatorId: req.operatorId,
          action: 'http_response',
          resourceType: 'api',
          resourceId: `${req.method} ${req.path}`,
          details: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTime,
            responseSize: JSON.stringify(body).length,
            success: body?.success,
          },
          ipAddress: AuditMiddleware.prototype.getClientIP(req),
          userAgent: req.get('User-Agent'),
          success: res.statusCode < 400,
        });

        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Middleware to log authentication events
   */
  logAuthentication() {
    return (req: AuditedRequest, res: Response, next: NextFunction) => {
      // Only log for authentication endpoints
      if (!req.path.includes('/auth/')) {
        return next();
      }

      const originalJson = res.json;
      res.json = function (body: any) {
        const isLogin = req.path.includes('/login');
        const isLogout = req.path.includes('/logout');
        const isMFA = req.path.includes('/mfa');

        if (isLogin || isLogout || isMFA) {
          const success = res.statusCode < 400 && body?.success !== false;
          let action: string;

          if (isLogin) {
            action = success ? 'login' : 'login_failed';
          } else if (isLogout) {
            action = 'logout';
          } else if (isMFA) {
            action = success ? 'mfa_success' : 'mfa_failed';
          } else {
            action = 'auth_unknown';
          }

          AuditService.getInstance().logAuthentication(
            req.operatorId,
            action as any,
            {
              username: req.body?.username || req.body?.email,
              authMethod: isMFA ? 'mfa' : 'password',
              sessionId: body?.sessionId || body?.token,
              failureReason: success ? undefined : body?.error || body?.message,
            },
            AuditMiddleware.prototype.getClientIP(req),
            req.get('User-Agent')
          );
        }

        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Middleware to log command execution
   */
  logCommandExecution() {
    return (req: AuditedRequest, res: Response, next: NextFunction) => {
      // Only log for command endpoints
      if (!req.path.includes('/commands/') || req.method !== 'POST') {
        return next();
      }

      const originalJson = res.json;
      res.json = function (body: any) {
        const success = res.statusCode < 400 && body?.success !== false;

        AuditService.getInstance().logCommandExecution(
          req.operatorId || 'unknown',
          req.body?.implantId || req.params?.['implantId'],
          body?.commandId || body?.data?.id,
          {
            implantId: req.body?.implantId || req.params?.['implantId'],
            command: req.body?.command,
            commandType: req.body?.type || 'shell',
          },
          success,
          success ? undefined : body?.error || body?.message,
          AuditMiddleware.prototype.getClientIP(req),
          req.get('User-Agent')
        );

        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Middleware to log file operations
   */
  logFileOperations() {
    return (req: AuditedRequest, res: Response, next: NextFunction) => {
      // Only log for file operation endpoints
      if (!req.path.includes('/files/')) {
        return next();
      }

      const originalJson = res.json;
      res.json = function (body: any) {
        const success = res.statusCode < 400 && body?.success !== false;
        let operation: string;

        if (req.method === 'POST' && req.path.includes('/upload')) {
          operation = 'upload';
        } else if (req.method === 'GET' && req.path.includes('/download')) {
          operation = 'download';
        } else if (req.method === 'DELETE') {
          operation = 'delete';
        } else if (req.method === 'PUT' || req.method === 'PATCH') {
          operation = 'rename';
        } else {
          operation = 'unknown';
        }

        AuditService.getInstance().logFileOperation(
          req.operatorId || 'unknown',
          {
            implantId: req.body?.implantId || req.params?.['implantId'],
            operation: operation as any,
            sourcePath: req.body?.sourcePath || (req.query?.['path'] as string),
            targetPath: req.body?.targetPath || req.body?.path,
            fileSize: req.body?.size || body?.data?.size,
            checksum: req.body?.checksum || body?.data?.checksum,
          },
          success,
          success ? undefined : body?.error || body?.message,
          AuditMiddleware.prototype.getClientIP(req),
          req.get('User-Agent')
        );

        return originalJson.call(this, body);
      };

      next();
    };
  }

  /**
   * Check if request should be excluded from audit logging
   */
  private shouldExclude(req: Request): boolean {
    // Check excluded methods
    if (this.excludedMethods.has(req.method)) {
      return true;
    }

    // Check excluded paths
    for (const excludedPath of this.excludedPaths) {
      if (req.path.startsWith(excludedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string) ||
      (req.headers['x-real-ip'] as string) ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };

    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    delete sanitized['x-auth-token'];

    return sanitized;
  }

  /**
   * Sanitize request body for logging (remove sensitive data)
   */
  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };

    // Remove sensitive fields
    if (sanitized.password) sanitized.password = '[REDACTED]';
    if (sanitized.token) sanitized.token = '[REDACTED]';
    if (sanitized.apiKey) sanitized.apiKey = '[REDACTED]';
    if (sanitized.secret) sanitized.secret = '[REDACTED]';
    if (sanitized.key) sanitized.key = '[REDACTED]';

    return sanitized;
  }

  /**
   * Add excluded path
   */
  addExcludedPath(path: string): void {
    this.excludedPaths.add(path);
  }

  /**
   * Remove excluded path
   */
  removeExcludedPath(path: string): void {
    this.excludedPaths.delete(path);
  }

  /**
   * Get current configuration
   */
  getConfiguration(): {
    excludedPaths: string[];
    excludedMethods: string[];
  } {
    return {
      excludedPaths: Array.from(this.excludedPaths),
      excludedMethods: Array.from(this.excludedMethods),
    };
  }
}
