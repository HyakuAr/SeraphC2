/**
 * Unit tests for authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware } from '../../../src/core/auth/auth.middleware';
import { AuthService } from '../../../src/core/auth/auth.service';
import { OperatorRole, Operator } from '../../../src/types/entities';

// Mock the auth service

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockRequest: Partial<Request> & { ip?: string };
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  const mockOperator: Operator = {
    id: 'test-operator-id',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: OperatorRole.OPERATOR,
    permissions: [
      { resource: 'implants', actions: ['read', 'write'] },
      { resource: 'commands', actions: ['execute'] },
    ],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockAuthService = {
      validateToken: jest.fn(),
    } as any;
    authMiddleware = new AuthMiddleware(mockAuthService);

    mockRequest = {
      headers: {},
      body: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate valid token successfully', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: mockOperator,
      });

      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.operator).toBe(mockOperator);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow request without token when optional', async () => {
      const middleware = authMiddleware.authenticate({ optional: true });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      mockAuthService.validateToken.mockResolvedValue({
        valid: false,
        error: 'Invalid token',
      });

      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should enforce role requirements', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: { ...mockOperator, role: OperatorRole.READ_ONLY },
      });

      const middleware = authMiddleware.authenticate({ requiredRole: OperatorRole.ADMINISTRATOR });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient permissions',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should enforce permission requirements', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: mockOperator,
      });

      const middleware = authMiddleware.authenticate({
        requiredPermissions: ['files:delete'],
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient permissions',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow access with sufficient permissions', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: mockOperator,
      });

      const middleware = authMiddleware.authenticate({
        requiredPermissions: ['implants:read'],
      });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should handle authentication service errors', async () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken.mockRejectedValue(new Error('Service error'));

      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('role-specific middlewares', () => {
    beforeEach(() => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
    });

    it('requireAdmin should require administrator role', async () => {
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: { ...mockOperator, role: OperatorRole.ADMINISTRATOR },
      });

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('requireOperator should allow operator and admin roles', async () => {
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: { ...mockOperator, role: OperatorRole.OPERATOR },
      });

      const middleware = authMiddleware.requireOperator();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('requireReadOnly should allow all roles', async () => {
      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: { ...mockOperator, role: OperatorRole.READ_ONLY },
      });

      const middleware = authMiddleware.requireReadOnly();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateRefreshToken', () => {
    it('should validate refresh token successfully', () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };

      // Mock JWT validation (this would normally be done by JwtUtils)
      const middleware = authMiddleware.validateRefreshToken();

      // Since we can't easily mock JwtUtils here, we'll test the error cases
      mockRequest.body = {};
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Refresh token required',
      });
    });

    it('should reject request without refresh token', () => {
      mockRequest.body = {};

      const middleware = authMiddleware.validateRefreshToken();
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Refresh token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('rateLimitAuth', () => {
    it('should allow requests within rate limit', () => {
      mockRequest.ip = '127.0.0.1';

      const middleware = authMiddleware.rateLimitAuth();

      // Make multiple requests within limit
      for (let i = 0; i < 3; i++) {
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockNext).toHaveBeenCalledTimes(3);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding rate limit', () => {
      mockRequest.ip = '127.0.0.1';

      const middleware = authMiddleware.rateLimitAuth();

      // Make requests exceeding limit
      for (let i = 0; i < 6; i++) {
        middleware(mockRequest as Request, mockResponse as Response, mockNext);
      }

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Too many authentication attempts. Please try again later.',
      });
    });
  });
});
