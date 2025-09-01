/**
 * Auth Middleware Tests
 * Tests for authentication and authorization middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AuthMiddleware } from '../auth.middleware';
import { AuthService } from '../../../core/auth/auth.service';
import { RBACService } from '../../../core/services/rbac.service';
import { ResourceType, Action } from '../../../types/rbac';
import { Operator, OperatorRole } from '../../../types/entities';

// Mock services
const mockAuthService = {
  validateToken: jest.fn(),
} as jest.Mocked<Partial<AuthService>>;

const mockRBACService = {
  checkPermission: jest.fn(),
} as jest.Mocked<Partial<RBACService>>;

// Mock Express objects
const mockRequest = () =>
  ({
    headers: {},
    ip: '127.0.0.1',
    get: jest.fn(),
    operator: undefined,
    operatorId: undefined,
  }) as Partial<Request>;

const mockResponse = () => {
  const res = {} as Partial<Response>;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as NextFunction;

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  const mockOperator: Operator = {
    id: 'test-operator-id',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    role: OperatorRole.OPERATOR,
    permissions: [],
    lastLogin: new Date(),
    isActive: true,
    sessionToken: 'test-token',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    authMiddleware = new AuthMiddleware(
      mockAuthService as unknown as AuthService,
      mockRBACService as unknown as RBACService
    );
    req = mockRequest();
    res = mockResponse();
    next = mockNext;

    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate valid token', async () => {
      req.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken!.mockResolvedValue({
        valid: true,
        operator: mockOperator,
      });

      const middleware = authMiddleware.authenticate();
      await middleware(req as Request, res as Response, next);

      expect(mockAuthService.validateToken).toHaveBeenCalledWith('valid-token');
      expect(req.operator).toBe(mockOperator);
      expect(req.operatorId).toBe(mockOperator.id);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject missing authorization header', async () => {
      const middleware = authMiddleware.authenticate();
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      req.headers = { authorization: 'Invalid token-format' };

      const middleware = authMiddleware.authenticate();
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      req.headers = { authorization: 'Bearer invalid-token' };
      mockAuthService.validateToken!.mockResolvedValue({
        valid: false,
        error: 'Token expired',
      });

      const middleware = authMiddleware.authenticate();
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Token expired',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow optional authentication when not required', async () => {
      const middleware = authMiddleware.authenticate({ required: false });
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle authentication errors gracefully', async () => {
      req.headers = { authorization: 'Bearer valid-token' };
      mockAuthService.validateToken!.mockRejectedValue(new Error('Service error'));

      const middleware = authMiddleware.authenticate();
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication failed',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    beforeEach(() => {
      req.operator = mockOperator;
      req.operatorId = mockOperator.id;
      Object.defineProperty(req, 'ip', { value: '127.0.0.1', writable: true });
      (req.get as jest.Mock).mockReturnValue('test-user-agent');
    });

    it('should authorize valid permission', async () => {
      mockRBACService.checkPermission!.mockResolvedValue({
        granted: true,
      });

      const middleware = authMiddleware.authorize(ResourceType.COMMAND, Action.EXECUTE);
      await middleware(req as Request, res as Response, next);

      expect(mockRBACService.checkPermission).toHaveBeenCalledWith({
        operatorId: mockOperator.id,
        operatorRole: mockOperator.role,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
        resourceId: undefined,
        metadata: {
          clientIp: '127.0.0.1',
          userAgent: 'test-user-agent',
        },
      });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny insufficient permissions', async () => {
      mockRBACService.checkPermission!.mockResolvedValue({
        granted: false,
        reason: 'Insufficient privileges',
      });

      const middleware = authMiddleware.authorize(ResourceType.OPERATOR, Action.MANAGE);
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied',
        reason: 'Insufficient privileges',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should require authentication before authorization', async () => {
      req.operator = undefined;
      req.operatorId = undefined;

      const middleware = authMiddleware.authorize(ResourceType.COMMAND, Action.EXECUTE);
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle authorization errors gracefully', async () => {
      mockRBACService.checkPermission!.mockRejectedValue(new Error('Service error'));

      const middleware = authMiddleware.authorize(ResourceType.COMMAND, Action.EXECUTE);
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authorization failed',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should include resource ID and metadata when provided', async () => {
      mockRBACService.checkPermission!.mockResolvedValue({
        granted: true,
      });

      const options = {
        getResourceId: (req: Request) => 'resource-123',
        getMetadata: (req: Request) => ({ customField: 'value' }),
      };

      const middleware = authMiddleware.authorize(ResourceType.IMPLANT, Action.READ, options);
      await middleware(req as Request, res as Response, next);

      expect(mockRBACService.checkPermission).toHaveBeenCalledWith({
        operatorId: mockOperator.id,
        operatorRole: mockOperator.role,
        resource: ResourceType.IMPLANT,
        action: Action.READ,
        resourceId: 'resource-123',
        metadata: {
          clientIp: '127.0.0.1',
          userAgent: 'test-user-agent',
          customField: 'value',
        },
      });
    });
  });

  describe('requirePermission', () => {
    it('should combine authentication and authorization', () => {
      const middlewares = authMiddleware.requirePermission(ResourceType.COMMAND, Action.EXECUTE);

      expect(middlewares).toHaveLength(2);
      expect(typeof middlewares[0]).toBe('function');
      expect(typeof middlewares[1]).toBe('function');
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      req.operator = mockOperator;
    });

    it('should allow operator with sufficient role', async () => {
      const middleware = authMiddleware.requireRole('operator');
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny operator with insufficient role', async () => {
      req.operator = { ...mockOperator, role: OperatorRole.READ_ONLY };

      const middleware = authMiddleware.requireRole('administrator');
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient privileges',
        required: 'administrator',
        current: 'read_only',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      req.operator = undefined;

      const middleware = authMiddleware.requireRole('operator');
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow administrator', async () => {
      req.operator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };

      const middleware = authMiddleware.requireAdmin();
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny non-administrator', async () => {
      const middleware = authMiddleware.requireAdmin();
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireOwnership', () => {
    beforeEach(() => {
      req.operator = mockOperator;
      req.operatorId = mockOperator.id;
    });

    it('should allow resource owner', async () => {
      const getOwnerId = (req: Request) => mockOperator.id;
      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should deny non-owner', async () => {
      const getOwnerId = (req: Request) => 'different-owner-id';
      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: not resource owner',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow administrator regardless of ownership', async () => {
      req.operator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };
      const getOwnerId = (req: Request) => 'different-owner-id';
      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow when no owner ID is available', async () => {
      const getOwnerId = (req: Request) => undefined;
      const middleware = authMiddleware.requireOwnership(getOwnerId);
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('rateLimitByOperator', () => {
    beforeEach(() => {
      req.operatorId = mockOperator.id;
    });

    it('should allow requests within limit', () => {
      const middleware = authMiddleware.rateLimitByOperator(5, 60000);

      // Make multiple requests within limit
      for (let i = 0; i < 5; i++) {
        middleware(req as Request, res as Response, next);
      }

      expect(next).toHaveBeenCalledTimes(5);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding limit', () => {
      const middleware = authMiddleware.rateLimitByOperator(2, 60000);

      // Make requests up to limit
      middleware(req as Request, res as Response, next);
      middleware(req as Request, res as Response, next);

      // This should be blocked
      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: expect.any(Number),
      });
    });

    it('should allow requests when no operator ID', () => {
      req.operatorId = undefined;
      const middleware = authMiddleware.rateLimitByOperator(1, 60000);

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
