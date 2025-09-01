/**
 * Unit tests for RateLimitMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimitMiddleware } from '../../../../src/web/middleware/rate-limit.middleware';

describe('RateLimitMiddleware', () => {
  let rateLimitMiddleware: RateLimitMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    rateLimitMiddleware = new RateLimitMiddleware();

    mockRequest = {
      ip: '192.168.1.100',
      connection: { remoteAddress: '192.168.1.100' },
      get: jest.fn().mockReturnValue('Test User Agent'),
      path: '/api/test',
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      statusCode: 200,
    };

    mockNext = jest.fn();

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    rateLimitMiddleware.destroy();
  });

  describe('create', () => {
    it('should allow requests within limit', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 5,
      });

      // First request
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();

      // Second request
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject requests exceeding limit', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 2,
      });

      // First two requests should pass
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // Third request should be rejected
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        details: {
          limit: 2,
          windowMs: 60000,
          retryAfter: 60,
          resetTime: expect.any(String),
        },
      });
      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should set rate limit headers', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 5,
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.header).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(mockResponse.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
      expect(mockResponse.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should use custom message', () => {
      const customMessage = 'Custom rate limit message';
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
        message: customMessage,
      });

      // First request passes
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Second request should be rejected with custom message
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: customMessage,
        })
      );
    });

    it('should use custom key generator', () => {
      const customKeyGenerator = jest.fn().mockReturnValue('custom-key');
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 2,
        keyGenerator: customKeyGenerator,
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(customKeyGenerator).toHaveBeenCalledWith(mockRequest);
    });

    it('should call onLimitReached callback', () => {
      const onLimitReached = jest.fn();
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
        onLimitReached,
      });

      // First request passes
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Second request should trigger callback
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(onLimitReached).toHaveBeenCalledWith(mockRequest, mockResponse);
    });

    it('should reset limit after window expires', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
      });

      // First request
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Second request should be rejected
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);

      // Advance time past window
      jest.advanceTimersByTime(61000);

      // Third request should pass (new window)
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should handle skipSuccessfulRequests option', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 2,
        skipSuccessfulRequests: true,
      });

      // Mock successful response
      mockResponse.statusCode = 200;

      // First request
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response completion
      const originalSend = mockResponse.send;
      (mockResponse.send as jest.Mock).mock.calls[0][0](); // Call the wrapped send function

      // Second request should still be allowed because first was successful
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should handle skipFailedRequests option', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 2,
        skipFailedRequests: true,
      });

      // Mock failed response
      mockResponse.statusCode = 400;

      // First request
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Simulate response completion
      const originalSend = mockResponse.send;
      (mockResponse.send as jest.Mock).mock.calls[0][0](); // Call the wrapped send function

      // Second request should still be allowed because first failed
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);
    });
  });

  describe('createTiered', () => {
    it('should apply different limits for different paths', () => {
      const middleware = rateLimitMiddleware.createTiered({
        '/api/auth/*': {
          windowMs: 60000,
          maxRequests: 1,
        },
        '/api/data/*': {
          windowMs: 60000,
          maxRequests: 5,
        },
      });

      // Test auth endpoint (strict limit)
      mockRequest.path = '/api/auth/login';
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);

      // Reset mocks
      jest.clearAllMocks();

      // Test data endpoint (lenient limit)
      mockRequest.path = '/api/data/users';
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow requests for unmatched paths', () => {
      const middleware = rateLimitMiddleware.createTiered({
        '/api/auth/*': {
          windowMs: 60000,
          maxRequests: 1,
        },
      });

      mockRequest.path = '/api/other/endpoint';
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should match wildcard patterns', () => {
      const middleware = rateLimitMiddleware.createTiered({
        '*': {
          windowMs: 60000,
          maxRequests: 1,
        },
      });

      mockRequest.path = '/any/path';
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });
  });

  describe('key generators', () => {
    it('should generate key from IP and user agent by default', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Different IP should have separate limit
      mockRequest.ip = '192.168.1.101';
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Same IP should share limit
      mockRequest.ip = '192.168.1.100';
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should use userKeyGenerator for authenticated users', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: rateLimitMiddleware.userKeyGenerator,
      });

      // Mock authenticated user
      (mockRequest as any).user = { id: 'user-123' };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should use apiKeyGenerator for API key requests', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: rateLimitMiddleware.apiKeyGenerator,
      });

      mockRequest.headers = { 'x-api-key': 'test-api-key' };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should fallback to default key generator when user not available', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: rateLimitMiddleware.userKeyGenerator,
      });

      // No user in request
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should fallback to default key generator when API key not available', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator: rateLimitMiddleware.apiKeyGenerator,
      });

      // No API key in headers
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });
  });

  describe('utility methods', () => {
    it('should get status for a key', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 5,
      });

      // Make a request to create an entry
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Get the key that was generated
      const key = (rateLimitMiddleware as any).defaultKeyGenerator(mockRequest);
      const status = rateLimitMiddleware.getStatus(key);

      expect(status).toMatchObject({
        count: 1,
        resetTime: expect.any(Number),
        firstRequest: expect.any(Number),
      });
    });

    it('should return null for non-existent key', () => {
      const status = rateLimitMiddleware.getStatus('non-existent-key');
      expect(status).toBeNull();
    });

    it('should reset rate limit for a key', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Make requests to hit limit
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);

      // Reset the limit
      const key = (rateLimitMiddleware as any).defaultKeyGenerator(mockRequest);
      rateLimitMiddleware.reset(key);

      // Should be able to make request again
      jest.clearAllMocks();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should clear all rate limit data', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 5,
      });

      // Make some requests
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Clear all data
      rateLimitMiddleware.clear();

      // Verify data is cleared
      const key = (rateLimitMiddleware as any).defaultKeyGenerator(mockRequest);
      const status = rateLimitMiddleware.getStatus(key);
      expect(status).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 5,
      });

      // Make a request to create an entry
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Advance time past expiration
      jest.advanceTimersByTime(70000);

      // Trigger cleanup (normally done by interval)
      (rateLimitMiddleware as any).cleanup();

      // Entry should be cleaned up
      const key = (rateLimitMiddleware as any).defaultKeyGenerator(mockRequest);
      const status = rateLimitMiddleware.getStatus(key);
      expect(status).toBeNull();
    });

    it('should not clean up active entries', () => {
      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 5,
      });

      // Make a request to create an entry
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Advance time but not past expiration
      jest.advanceTimersByTime(30000);

      // Trigger cleanup
      (rateLimitMiddleware as any).cleanup();

      // Entry should still exist
      const key = (rateLimitMiddleware as any).defaultKeyGenerator(mockRequest);
      const status = rateLimitMiddleware.getStatus(key);
      expect(status).not.toBeNull();
    });
  });

  describe('path matching', () => {
    it('should match exact paths', () => {
      const pathMatches = (rateLimitMiddleware as any).pathMatches.bind(rateLimitMiddleware);

      expect(pathMatches('/api/auth', '/api/auth')).toBe(true);
      expect(pathMatches('/api/auth', '/api/data')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      const pathMatches = (rateLimitMiddleware as any).pathMatches.bind(rateLimitMiddleware);

      expect(pathMatches('/api/auth/login', '/api/auth/*')).toBe(true);
      expect(pathMatches('/api/auth/logout', '/api/auth/*')).toBe(true);
      expect(pathMatches('/api/data/users', '/api/auth/*')).toBe(false);
    });

    it('should match global wildcard', () => {
      const pathMatches = (rateLimitMiddleware as any).pathMatches.bind(rateLimitMiddleware);

      expect(pathMatches('/any/path', '*')).toBe(true);
      expect(pathMatches('/another/path', '*')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle missing IP address', () => {
      mockRequest.ip = undefined;
      mockRequest.connection = {};

      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Should not throw error
      expect(() => {
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle missing user agent', () => {
      (mockRequest.get as jest.Mock).mockReturnValue(undefined);

      const middleware = rateLimitMiddleware.create({
        windowMs: 60000,
        maxRequests: 1,
      });

      // Should not throw error
      expect(() => {
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clear interval and data on destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      rateLimitMiddleware.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
