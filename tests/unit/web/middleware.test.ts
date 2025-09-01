/**
 * Unit tests for Express middleware
 */

import { NextFunction } from 'express';
import {
  errorHandler,
  asyncHandler,
  createError,
  notFoundHandler,
} from '../../../src/web/middleware/error.middleware';
import {
  securityHeaders,
  requestSizeLimit,
  allowedMethods,
  validateContentType,
} from '../../../src/web/middleware/security.middleware';

describe('Error Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn(),
      originalUrl: '/test',
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
    };

    mockNext = jest.fn();
  });

  describe('errorHandler', () => {
    test('should handle generic errors with 500 status', () => {
      const error = new Error('Test error');
      const middleware = errorHandler();

      middleware(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Internal server error',
          timestamp: expect.any(String),
        })
      );
    });

    test('should handle operational errors with custom status', () => {
      const error = createError('Custom error', 400);
      const middleware = errorHandler();

      middleware(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Custom error',
        })
      );
    });

    test('should handle validation errors with 400 status', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      const middleware = errorHandler();

      middleware(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
        })
      );
    });

    test('should handle JWT errors with 401 status', () => {
      const error = new Error('JWT error');
      error.name = 'JsonWebTokenError';
      const middleware = errorHandler();

      middleware(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication failed',
        })
      );
    });
  });

  describe('asyncHandler', () => {
    test('should handle successful async functions', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest, mockResponse, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should catch and forward async errors', async () => {
      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const wrappedFn = asyncHandler(asyncFn);

      await wrappedFn(mockRequest, mockResponse, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('createError', () => {
    test('should create operational error with default status', () => {
      const error = createError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    test('should create operational error with custom status', () => {
      const error = createError('Custom error', 404);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('notFoundHandler', () => {
    test('should create 404 error for undefined routes', () => {
      mockRequest.originalUrl = '/nonexistent';
      const middleware = notFoundHandler();

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route /nonexistent not found',
          statusCode: 404,
          isOperational: true,
        })
      );
    });
  });
});

describe('Security Middleware', () => {
  let mockRequest: any;
  let mockResponse: any;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/api/test',
      method: 'GET',
      get: jest.fn(),
      ip: '127.0.0.1',
    };

    mockResponse = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  describe('securityHeaders', () => {
    test('should set security headers', () => {
      const middleware = securityHeaders();

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-SeraphC2-Server', '1.0.0');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should set cache control headers for API paths', () => {
      const testRequest = { ...mockRequest, path: '/api/test' };
      const middleware = securityHeaders();

      middleware(testRequest, mockResponse, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Expires', '0');
    });
  });

  describe('requestSizeLimit', () => {
    test('should allow requests within size limit', () => {
      mockRequest.get.mockReturnValue('1000'); // 1KB
      const middleware = requestSizeLimit(10 * 1024 * 1024); // 10MB limit

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should reject requests exceeding size limit', () => {
      mockRequest.get.mockReturnValue('20971520'); // 20MB
      const middleware = requestSizeLimit(10 * 1024 * 1024); // 10MB limit

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(413);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Request entity too large',
          maxSize: '10MB',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should allow requests without Content-Length header', () => {
      mockRequest.get.mockReturnValue(undefined);
      const middleware = requestSizeLimit(10 * 1024 * 1024);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('allowedMethods', () => {
    test('should allow permitted methods', () => {
      mockRequest.method = 'GET';
      const middleware = allowedMethods(['GET', 'POST']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test('should reject non-permitted methods', () => {
      mockRequest.method = 'DELETE';
      const middleware = allowedMethods(['GET', 'POST']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(405);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Method not allowed',
          allowedMethods: ['GET', 'POST'],
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateContentType', () => {
    test('should allow GET requests without content type validation', () => {
      mockRequest.method = 'GET';
      const middleware = validateContentType(['application/json']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should allow requests without body', () => {
      mockRequest.method = 'POST';
      mockRequest.get.mockReturnValue(undefined); // No Content-Length
      const middleware = validateContentType(['application/json']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should allow valid content types', () => {
      mockRequest.method = 'POST';
      mockRequest.get.mockImplementation((header: string) => {
        if (header === 'Content-Length') return '100';
        if (header === 'Content-Type') return 'application/json';
        return undefined;
      });
      const middleware = validateContentType(['application/json']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should reject invalid content types', () => {
      mockRequest.method = 'POST';
      mockRequest.get.mockImplementation((header: string) => {
        if (header === 'Content-Length') return '100';
        if (header === 'Content-Type') return 'text/plain';
        return undefined;
      });
      const middleware = validateContentType(['application/json']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(415);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Unsupported media type',
          allowedTypes: ['application/json'],
        })
      );
    });

    test('should require content type header for requests with body', () => {
      mockRequest.method = 'POST';
      mockRequest.get.mockImplementation((header: string) => {
        if (header === 'Content-Length') return '100';
        if (header === 'Content-Type') return undefined;
        return undefined;
      });
      const middleware = validateContentType(['application/json']);

      middleware(mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Content-Type header required',
        })
      );
    });
  });
});
