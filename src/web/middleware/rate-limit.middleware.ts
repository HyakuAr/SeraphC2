/**
 * Rate limiting middleware for API security
 */

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

export class RateLimitMiddleware {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Create rate limiting middleware
   */
  create(config: RateLimitConfig) {
    const {
      windowMs,
      maxRequests,
      message = 'Too many requests, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
      keyGenerator = this.defaultKeyGenerator,
      onLimitReached,
    } = config;

    return (req: Request, res: Response, next: NextFunction) => {
      const key = keyGenerator(req);
      const now = Date.now();
      const windowStart = now - windowMs;

      let entry = this.store.get(key);

      // Create new entry if doesn't exist or window has expired
      if (!entry || entry.resetTime <= now) {
        entry = {
          count: 0,
          resetTime: now + windowMs,
          firstRequest: now,
        };
        this.store.set(key, entry);
      }

      // Check if request should be counted
      const shouldCount = !skipSuccessfulRequests && !skipFailedRequests;

      if (shouldCount) {
        entry.count++;
      }

      // Check if limit exceeded
      if (entry.count > maxRequests) {
        if (onLimitReached) {
          onLimitReached(req, res);
        }

        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

        return res
          .status(429)
          .json({
            success: false,
            error: message,
            code: 'RATE_LIMIT_EXCEEDED',
            details: {
              limit: maxRequests,
              windowMs,
              retryAfter,
              resetTime: new Date(entry.resetTime).toISOString(),
            },
          })
          .header('Retry-After', retryAfter.toString());
      }

      // Add rate limit headers
      res.header('X-RateLimit-Limit', maxRequests.toString());
      res.header('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count).toString());
      res.header('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

      // Handle response counting for skip options
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function (body) {
          const statusCode = res.statusCode;
          const isSuccess = statusCode >= 200 && statusCode < 300;
          const isFailure = statusCode >= 400;

          if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && isFailure)) {
            // Don't count this request
            entry!.count--;
          }

          return originalSend.call(this, body);
        };
      }

      next();
    };
  }

  /**
   * Create different rate limits for different endpoints
   */
  createTiered(configs: { [path: string]: RateLimitConfig }) {
    return (req: Request, res: Response, next: NextFunction) => {
      const path = req.path;
      let matchedConfig: RateLimitConfig | null = null;

      // Find matching configuration
      for (const [pattern, config] of Object.entries(configs)) {
        if (this.pathMatches(path, pattern)) {
          matchedConfig = config;
          break;
        }
      }

      if (!matchedConfig) {
        return next();
      }

      return this.create(matchedConfig)(req, res, next);
    };
  }

  /**
   * Default key generator using IP address and user agent
   */
  private defaultKeyGenerator(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const combined = `${ip}:${userAgent}`;

    return createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Generate key based on authenticated user
   */
  userKeyGenerator(req: Request): string {
    const user = (req as any).user;
    if (user && user.id) {
      return `user:${user.id}`;
    }

    return this.defaultKeyGenerator(req);
  }

  /**
   * Generate key based on API key
   */
  apiKeyGenerator(req: Request): string {
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const hash = createHash('sha256').update(apiKey).digest('hex');
      return `apikey:${hash.substring(0, 16)}`;
    }

    return this.defaultKeyGenerator(req);
  }

  /**
   * Check if path matches pattern (supports wildcards)
   */
  private pathMatches(path: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      return path.startsWith(pattern.slice(0, -1));
    }
    return path === pattern;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current rate limit status for a key
   */
  getStatus(key: string): RateLimitEntry | null {
    return this.store.get(key) || null;
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Destroy the rate limiter and cleanup
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  // Strict rate limiting for authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later',
  },

  // General API rate limiting
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    message: 'API rate limit exceeded, please slow down',
  },

  // Strict rate limiting for sensitive operations
  sensitive: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
    message: 'Rate limit exceeded for sensitive operations',
  },

  // Lenient rate limiting for read operations
  read: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // 200 requests per minute
    skipSuccessfulRequests: true,
  },

  // Very strict rate limiting for file uploads
  upload: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 uploads per minute
    message: 'File upload rate limit exceeded',
  },
};
