/**
 * Unit tests for AuthMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import {
  AuthMiddleware,
  AuthMiddlewareOptions,
} from '../../../../src/web/middleware/auth.middleware';
import { AuthService } from '../../../../src/core/auth/auth.service';
import { RBACService } from '../../../../src/core/services/rbac.service';
import { ResourceType, Action } from '../../../../src/types/rbac';
import { Operator } from '../../../../src/types/entities';

// Mock dependencies
jest.mock('../../../../src/core/auth/auth.service');
jest.mock('../../../../src/core/services/rbac.service');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedRBACService = RBACService as jest.MockedClass<typeof RBACService>;

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockRBACService: jest.Mocked<RBACService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockAuthService = {
      validateToken: jest.fn(),
    } as any;

    mockRBACService = {
      checkPermission: jest.fn(),
    } as any;

    MockedAuthService.mockImplementation(() => mockAuthService);
    MockedRBACService.mockImplementation(() => mockRBACService);

    authMiddleware = new AuthMiddleware(mockAuthService, mockRBACService);

    mockRequest = {
      headers: {},
      ip: '192.168.1.100',
      get: jest.fn(),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate valid token', async () => {
      const mockOperator: Operator = {
        id: 'operator-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'operator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      mockAuthService.validateToken.mockResolvedValue({
        valid: true,
        operator: mockOperator,
      });

      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockAuthService.validateToken).toHaveBeenCalledWith('valid-token');
      expect(mockRequest.operator).toBe(mockOperator);
      expect(mockRequest.operatorId).toBe('operator-1');
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject missing authorization header when required', async () => {
      const middleware = authMiddleware.authenticate({ required: true });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow missing authorization header when not required', async () => {
      const middleware = authMiddleware.authenticate({ required: false });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      mockRequest.headers = {
        authorization: 'Invalid token-format',
      };

      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      mockAuthService.validateToken.mockResolvedValue({
        valid: false,
        error: 'Token expired',
      });

      const middleware = authMiddleware.authenticate();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token expired',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle authentication service errors', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

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

  describe('authorize', () => {
    beforeEach(() => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'operator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };
      mockRequest.operatorId = 'operator-1';
      (mockRequest.get as jest.Mock).mockReturnValue('Test User Agent');
    });

    it('should authorize user with valid permissions', async () => {
      mockRBACService.checkPermission.mockResolvedValue({
        granted: true,
        reason: 'Permission granted',
      });

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.READ);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRBACService.checkPermission).toHaveBeenCalledWith({
        operatorId: 'operator-1',
        operatorRole: 'operator',
        resource: ResourceType.IMPLANT,
        action: Action.READ,
        metadata: {
          clientIp: '192.168.1.100',
          userAgent: 'Test User Agent',
        },
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject user without authentication', async () => {
      mockRequest.operator = undefined;
      mockRequest.operatorId = undefined;

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.READ);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject user without permissions', async () => {
      mockRBACService.checkPermission.mockResolvedValue({
        granted: false,
        reason: 'Insufficient privileges',
      });

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.WRITE);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied',
        reason: 'Insufficient privileges',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should include resource ID when provided', async () => {
      const options: AuthMiddlewareOptions = {
        getResourceId: req => req.params?.id,
      };

      mockRequest.params = { id: 'resource-123' };

      mockRBACService.checkPermission.mockResolvedValue({
        granted: true,
        reason: 'Permission granted',
      });

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.READ, options);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRBACService.checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: 'resource-123',
        })
      );
    });

    it('should include custom metadata when provided', async () => {
      const options: AuthMiddlewareOptions = {
        getMetadata: req => ({ customField: 'customValue' }),
      };

      mockRBACService.checkPermission.mockResolvedValue({
        granted: true,
        reason: 'Permission granted',
      });

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.READ, options);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRBACService.checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            customField: 'customValue',
          }),
        })
      );
    });

    it('should handle authorization service errors', async () => {
      mockRBACService.checkPermission.mockRejectedValue(new Error('Service error'));

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.READ);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization failed',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should return array of middleware functions', () => {
      const middleware = authMiddleware.requirePermission(ResourceType.IMPLANT, Action.READ);

      expect(middleware).toBeInstanceOf(Array);
      expect(middleware).toHaveLength(2);
      expect(typeof middleware[0]).toBe('function');
      expect(typeof middleware[1]).toBe('function');
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'operator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };
    });

    it('should allow user with sufficient role', async () => {
      const middleware = authMiddleware.requireRole('operator');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow user with higher role', async () => {
      mockRequest.operator!.role = 'administrator';

      const middleware = authMiddleware.requireRole('operator');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject user with insufficient role', async () => {
      mockRequest.operator!.role = 'read_only';

      const middleware = authMiddleware.requireRole('operator');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient privileges',
        required: 'operator',
        current: 'read_only',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated user', async () => {
      mockRequest.operator = undefined;

      const middleware = authMiddleware.requireRole('operator');
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow administrator', async () => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'admin',
        email: 'admin@example.com',
        role: 'administrator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject non-administrator', async () => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'user',
        email: 'user@example.com',
        role: 'operator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      const middleware = authMiddleware.requireAdmin();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireOperator', () => {
    it('should allow operator', async () => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'user',
        email: 'user@example.com',
        role: 'operator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      const middleware = authMiddleware.requireOperator();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject read-only user', async () => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'user',
        email: 'user@example.com',
        role: 'read_only',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };

      const middleware = authMiddleware.requireOperator();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireOwnership', () => {
    beforeEach(() => {
      mockRequest.operator = {
        id: 'operator-1',
        username: 'user',
        email: 'user@example.com',
        role: 'operator',
        isActive: true,
        createdAt: new Date(),
        lastLogin: new Date(),
      };
      mockRequest.operatorId = 'operator-1';
    });

    it('should allow resource owner', async () => {
      const getOwnerId = (req: Request) => req.params?.ownerId;
      mockRequest.params = { ownerId: 'operator-1' };

      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should allow administrator to access any resource', async () => {
      mockRequest.operator!.role = 'administrator';
      const getOwnerId = (req: Request) => req.params?.ownerId;
      mockRequest.params = { ownerId: 'other-operator' };

      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject non-owner', async () => {
      const getOwnerId = (req: Request) => req.params?.ownerId;
      mockRequest.params = { ownerId: 'other-operator' };

      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: not resource owner',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow access when no owner ID can be determined', async () => {
      const getOwnerId = (req: Request) => undefined;

      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated user', async () => {
      mockRequest.operator = undefined;
      const getOwnerId = (req: Request) => 'some-owner';

      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('rateLimitByOperator', () => {
    beforeEach(() => {
      mockRequest.operatorId = 'operator-1';
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should allow requests within limit', () => {
      const middleware = authMiddleware.rateLimitByOperator(5, 60000);

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
      const middleware = authMiddleware.rateLimitByOperator(2, 60000);

      // First two requests should pass
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(2);

      // Third request should be rejected
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: 60,
      });
      expect(mockNext).toHaveBeenCalledTimes(2);
    });

    it('should reset limit after window expires', () => {
      const middleware = authMiddleware.rateLimitByOperator(1, 60000);

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

    it('should allow requests for unauthenticated users', () => {
      mockRequest.operatorId = undefined;

      const middleware = authMiddleware.rateLimitByOperator(1, 60000);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });
});
