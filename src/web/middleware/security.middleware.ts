/**
 * Enhanced Security middleware for Express.js
 * Provides comprehensive security headers, protections, and monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { log } from '../../utils/logger';

/**
 * Custom security headers middleware
 */
export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Remove server identification
    res.removeHeader('X-Powered-By');

    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Add SeraphC2 identification (for legitimate traffic identification)
    res.setHeader('X-SeraphC2-Server', '1.0.0');

    // Cache control for API responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    return next();
  };
}

/**
 * Request size limiting middleware
 */
export function requestSizeLimit(maxSizeBytes: number = 10 * 1024 * 1024) {
  // 10MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');

    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      res.status(413).json({
        success: false,
        error: 'Request entity too large',
        maxSize: `${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
      });
      return;
    }

    return next();
  };
}

/**
 * IP whitelist middleware
 */
export function ipWhitelist(allowedIPs: string[] = []) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured, allow all
    }

    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    // Check if client IP is in whitelist
    const isAllowed = allowedIPs.some(allowedIP => {
      if (allowedIP.includes('/')) {
        // CIDR notation support would require additional library
        // For now, exact match only
        return clientIP === allowedIP.split('/')[0];
      }
      return clientIP === allowedIP;
    });

    if (!isAllowed) {
      console.warn(`Access denied for IP: ${clientIP}`);
      res.status(403).json({
        success: false,
        error: 'Access denied',
      });
      return;
    }

    return next();
  };
}

/**
 * Request method validation middleware
 */
export function allowedMethods(methods: string[] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!methods.includes(req.method)) {
      res.status(405).json({
        success: false,
        error: 'Method not allowed',
        allowedMethods: methods,
      });
      return;
    }

    return next();
  };
}

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs: number = 30000) {
  // 30 seconds default
  return (_req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          timeout: `${timeoutMs}ms`,
        });
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    const originalEnd = res.end;
    res.end = function (chunk?: any, encoding?: any): any {
      clearTimeout(timeout);
      return originalEnd.call(this, chunk, encoding);
    };

    return next();
  };
}

/**
 * Content type validation middleware
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip validation for GET requests and requests without body
    if (req.method === 'GET' || req.method === 'HEAD' || !req.get('Content-Length')) {
      return next();
    }

    const contentType = req.get('Content-Type');

    if (!contentType) {
      res.status(400).json({
        success: false,
        error: 'Content-Type header required',
        allowedTypes,
      });
      return;
    }

    const isAllowed = allowedTypes.some(type => contentType.includes(type));

    if (!isAllowed) {
      res.status(415).json({
        success: false,
        error: 'Unsupported media type',
        allowedTypes,
      });
      return;
    }

    return next();
  };
}

/**
 * API versioning middleware
 */
export function apiVersioning(supportedVersions: string[] = ['v1']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract version from URL path (e.g., /api/v1/...)
    const versionMatch = req.path.match(/^\/api\/v(\d+)/);
    const requestedVersion = versionMatch ? `v${versionMatch[1]}` : 'v1';

    if (!supportedVersions.includes(requestedVersion)) {
      res.status(400).json({
        success: false,
        error: 'Unsupported API version',
        requestedVersion,
        supportedVersions,
      });
      return;
    }

    // Add version info to request
    (req as any).apiVersion = requestedVersion;

    return next();
  };
}

/**
 * Enhanced Content Security Policy middleware
 */
export function contentSecurityPolicy(
  options: {
    reportOnly?: boolean;
    reportUri?: string;
    nonce?: boolean;
  } = {}
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { reportOnly = false, reportUri, nonce = true } = options;

    // Generate nonce for inline scripts/styles if enabled
    let nonceValue = '';
    if (nonce) {
      nonceValue = randomBytes(16).toString('base64');
      (req as any).nonce = nonceValue;
    }

    // Build CSP directive
    const directives = [
      "default-src 'self'",
      "script-src 'self'" + (nonce ? ` 'nonce-${nonceValue}'` : " 'unsafe-inline'"),
      "style-src 'self'" + (nonce ? ` 'nonce-${nonceValue}'` : " 'unsafe-inline'"),
      "img-src 'self' data: https:",
      "font-src 'self' https:",
      "connect-src 'self'",
      "media-src 'none'",
      "object-src 'none'",
      "child-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ];

    if (reportUri) {
      directives.push(`report-uri ${reportUri}`);
    }

    const cspValue = directives.join('; ');
    const headerName = reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    res.setHeader(headerName, cspValue);
    return next();
  };
}

/**
 * Request fingerprinting for security monitoring
 */
export function requestFingerprinting() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Generate request fingerprint for security monitoring
    const fingerprint = createHash('sha256')
      .update(
        [
          req.ip || 'unknown',
          req.get('User-Agent') || 'unknown',
          req.get('Accept-Language') || 'unknown',
          req.get('Accept-Encoding') || 'unknown',
        ].join('|')
      )
      .digest('hex')
      .substring(0, 16);

    (req as any).fingerprint = fingerprint;

    // Log security-relevant request information
    log.security('Request received', {
      fingerprint,
      ip: req.ip,
      method: req.method,
      path: req.path,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    return next();
  };
}

/**
 * Anti-automation and bot detection middleware
 */
export function antiAutomation(
  options: {
    challengeThreshold?: number;
    blockThreshold?: number;
    windowMs?: number;
  } = {}
) {
  const { challengeThreshold = 10, blockThreshold = 50, windowMs = 60000 } = options;
  const requestCounts = new Map<
    string,
    { count: number; firstRequest: number; blocked: boolean }
  >();

  return (req: Request, res: Response, next: NextFunction): void => {
    const fingerprint = (req as any).fingerprint || req.ip || 'unknown';
    const now = Date.now();

    // Clean up old entries
    for (const [key, data] of requestCounts.entries()) {
      if (now - data.firstRequest > windowMs) {
        requestCounts.delete(key);
      }
    }

    // Get or create request data
    let requestData = requestCounts.get(fingerprint);
    if (!requestData) {
      requestData = { count: 0, firstRequest: now, blocked: false };
      requestCounts.set(fingerprint, requestData);
    }

    // Reset if window expired
    if (now - requestData.firstRequest > windowMs) {
      requestData.count = 0;
      requestData.firstRequest = now;
      requestData.blocked = false;
    }

    requestData.count++;

    // Check if blocked
    if (requestData.blocked || requestData.count > blockThreshold) {
      requestData.blocked = true;
      log.security('Request blocked - automation detected', {
        fingerprint,
        count: requestData.count,
        ip: req.ip,
        path: req.path,
      });

      res.status(429).json({
        success: false,
        error: 'Too many requests - automation detected',
        retryAfter: Math.ceil((windowMs - (now - requestData.firstRequest)) / 1000),
      });
      return;
    }

    // Challenge if threshold exceeded
    if (requestData.count > challengeThreshold) {
      log.security('High request rate detected', {
        fingerprint,
        count: requestData.count,
        ip: req.ip,
        path: req.path,
      });

      // Add challenge header for client-side handling
      res.setHeader('X-Challenge-Required', 'rate-limit');
    }

    return next();
  };
}

/**
 * Secure session management middleware
 */
export function secureSession(
  options: {
    cookieName?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
  } = {}
) {
  const {
    cookieName = 'seraphc2-session',
    secure = process.env.NODE_ENV === 'production',
    httpOnly = true,
    sameSite = 'strict',
    maxAge = 3600000, // 1 hour
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Override default cookie settings for security
    const originalCookie = res.cookie;
    res.cookie = function (name: string, value: any, options: any = {}) {
      const secureOptions = {
        ...options,
        secure: secure || options.secure,
        httpOnly: httpOnly || options.httpOnly,
        sameSite: sameSite || options.sameSite,
        maxAge: maxAge || options.maxAge,
      };

      return originalCookie.call(this, name, value, secureOptions);
    };

    return next();
  };
}

/**
 * Input sanitization middleware
 */
export function inputSanitization() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Sanitize common XSS patterns in request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    return next();
  };
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeString(key)] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize string input
 */
function sanitizeString(str: string): string {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Security monitoring middleware
 */
export function securityMonitoring() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Monitor for suspicious patterns
    const suspiciousPatterns = [
      /\.\.\//g, // Directory traversal
      /<script/gi, // XSS attempts
      /union\s+select/gi, // SQL injection
      /exec\s*\(/gi, // Command injection
      /eval\s*\(/gi, // Code injection
    ];

    const requestData = JSON.stringify({
      path: req.path,
      query: req.query,
      body: req.body,
      headers: req.headers,
    });

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(requestData)) {
        log.security('Suspicious request pattern detected', {
          pattern: pattern.source,
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent'),
          fingerprint: (req as any).fingerprint,
        });
        break;
      }
    }

    // Monitor response
    const originalSend = res.send;
    res.send = function (data: any) {
      const responseTime = Date.now() - startTime;

      // Log slow responses (potential DoS)
      if (responseTime > 5000) {
        log.security('Slow response detected', {
          responseTime,
          path: req.path,
          statusCode: res.statusCode,
          ip: req.ip,
        });
      }

      return originalSend.call(this, data);
    };

    return next();
  };
}

/**
 * Comprehensive security middleware stack
 */
export function enhancedSecurity(
  options: {
    enableCSP?: boolean;
    enableAntiAutomation?: boolean;
    enableFingerprinting?: boolean;
    enableMonitoring?: boolean;
    cspReportUri?: string;
  } = {}
) {
  const {
    enableCSP = true,
    enableAntiAutomation = true,
    enableFingerprinting = true,
    enableMonitoring = true,
    cspReportUri,
  } = options;

  return [
    // Basic security headers
    securityHeaders(),

    // Request fingerprinting (if enabled)
    ...(enableFingerprinting ? [requestFingerprinting()] : []),

    // Content Security Policy (if enabled)
    ...(enableCSP ? [contentSecurityPolicy({ reportUri: cspReportUri })] : []),

    // Anti-automation protection (if enabled)
    ...(enableAntiAutomation ? [antiAutomation()] : []),

    // Input sanitization
    inputSanitization(),

    // Secure session management
    secureSession(),

    // Security monitoring (if enabled)
    ...(enableMonitoring ? [securityMonitoring()] : []),
  ];
}
