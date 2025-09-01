/**
 * RBAC Routes Tests
 * Tests for role and permission management endpoints
 */

import request from 'supertest';
import express from 'express';
import { createRBACRoutes } from '../rbac.routes';
import { RBACService } from '../../../core/services/rbac.service';
import { AuthMiddleware } from '../../middleware/auth.middleware';
import { AuditLogRepository } from '../../../core/repositories/audit-log.repository';
import { OperatorRepository } from '../../../core/repositories/operator.repository';
import { OperatorRole } from '../../../types/entities';
import { DEFAULT_ROLE_DEFINITIONS } from '../../../types/rbac';

// Mock services
const mockRBACService = {
  getAllRoles: jest.fn(),
  getRoleDefinition: jest.fn(),
  getOperatorPermissions: jest.fn(),
  updateOperatorPermissions: jest.fn(),
  updateOperatorRole: jest.fn(),
  canManageOperator: jest.fn(),
  checkPermission: jest.fn(),
} as jest.Mocked<Partial<RBACService>>;

const mockAuthMiddleware = {
  authenticate: jest.fn(),
  requirePermission: jest.fn(),
} as jest.Mocked<Partial<AuthMiddleware>>;

const mockAuditLogRepository = {
  create: jest.fn(),
} as jest.Mocked<Partial<AuditLogRepository>>;

const mockOperatorRepository = {
  findAll: jest.fn(),
} as jest.Mocked<Partial<OperatorRepository>>;

describe('RBAC Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock middleware to always pass
    mockAuthMiddleware.authenticate!.mockReturnValue((req: any, res: any, next: any) => {
      req.operatorId = 'test-operator-id';
      next();
    });

    mockAuthMiddleware.requirePermission!.mockReturnValue([
      (req: any, res: any, next: any) => {
        req.operatorId = 'test-operator-id';
        next();
      },
    ]);

    const router = createRBACRoutes(
      mockRBACService as RBACService,
      mockAuthMiddleware as AuthMiddleware,
      mockAuditLogRepository as AuditLogRepository,
      mockOperatorRepository as OperatorRepository
    );

    app.use('/api/rbac', router);

    jest.clearAllMocks();
  });

  describe('GET /roles', () => {
    it('should return all roles', async () => {
      mockRBACService.getAllRoles!.mockReturnValue(DEFAULT_ROLE_DEFINITIONS);
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app).get('/api/rbac/roles').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(DEFAULT_ROLE_DEFINITIONS);
      expect(mockRBACService.getAllRoles).toHaveBeenCalled();
      expect(mockAuditLogRepository.create).toHaveBeenCalledWith({
        operatorId: 'test-operator-id',
        action: 'view_roles',
        resourceType: 'system',
        success: true,
        ipAddress: expect.any(String),
        userAgent: undefined,
      });
    });

    it('should handle errors gracefully', async () => {
      mockRBACService.getAllRoles!.mockImplementation(() => {
        throw new Error('Service error');
      });
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app).get('/api/rbac/roles').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get roles');
      expect(mockAuditLogRepository.create).toHaveBeenCalledWith({
        operatorId: 'test-operator-id',
        action: 'view_roles',
        resourceType: 'system',
        success: false,
        errorMessage: 'Service error',
        ipAddress: expect.any(String),
        userAgent: undefined,
      });
    });
  });

  describe('GET /roles/:role', () => {
    it('should return specific role definition', async () => {
      const roleDefinition = DEFAULT_ROLE_DEFINITIONS[0];
      mockRBACService.getRoleDefinition!.mockReturnValue(roleDefinition);
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app).get('/api/rbac/roles/operator').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(roleDefinition);
      expect(mockRBACService.getRoleDefinition).toHaveBeenCalledWith('operator');
    });

    it('should return 404 for non-existent role', async () => {
      mockRBACService.getRoleDefinition!.mockReturnValue(undefined);

      const response = await request(app).get('/api/rbac/roles/invalid-role').expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Role not found');
    });
  });

  describe('GET /operators/:operatorId/permissions', () => {
    it('should return operator permissions', async () => {
      const permissions = [{ resource: 'command', actions: ['read', 'execute'] }];
      mockRBACService.getOperatorPermissions!.mockResolvedValue(permissions);
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app)
        .get('/api/rbac/operators/test-operator-id/permissions')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(permissions);
      expect(mockRBACService.getOperatorPermissions).toHaveBeenCalledWith('test-operator-id');
    });
  });

  describe('PUT /operators/:operatorId/permissions', () => {
    it('should update operator permissions', async () => {
      const permissions = [{ resource: 'command', actions: ['read', 'execute'] }];
      mockRBACService.canManageOperator!.mockResolvedValue({ granted: true });
      mockRBACService.updateOperatorPermissions!.mockResolvedValue({ success: true });
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app)
        .put('/api/rbac/operators/test-operator-id/permissions')
        .send({ permissions })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockRBACService.canManageOperator).toHaveBeenCalledWith(
        'test-operator-id',
        'test-operator-id'
      );
      expect(mockRBACService.updateOperatorPermissions).toHaveBeenCalledWith(
        'test-operator-id',
        permissions
      );
    });

    it('should reject invalid permissions format', async () => {
      const response = await request(app)
        .put('/api/rbac/operators/test-operator-id/permissions')
        .send({ permissions: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Permissions must be an array');
    });

    it('should deny unauthorized management', async () => {
      mockRBACService.canManageOperator!.mockResolvedValue({
        granted: false,
        reason: 'Insufficient privileges',
      });

      const response = await request(app)
        .put('/api/rbac/operators/test-operator-id/permissions')
        .send({ permissions: [] })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient privileges');
    });
  });

  describe('PUT /operators/:operatorId/role', () => {
    it('should update operator role', async () => {
      mockRBACService.canManageOperator!.mockResolvedValue({ granted: true });
      mockRBACService.updateOperatorRole!.mockResolvedValue({ success: true });
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app)
        .put('/api/rbac/operators/test-operator-id/role')
        .send({ role: OperatorRole.ADMINISTRATOR })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockRBACService.updateOperatorRole).toHaveBeenCalledWith(
        'test-operator-id',
        OperatorRole.ADMINISTRATOR
      );
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .put('/api/rbac/operators/test-operator-id/role')
        .send({ role: 'invalid-role' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid role');
    });

    it('should handle update failures', async () => {
      mockRBACService.canManageOperator!.mockResolvedValue({ granted: true });
      mockRBACService.updateOperatorRole!.mockResolvedValue({
        success: false,
        error: 'Update failed',
      });
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app)
        .put('/api/rbac/operators/test-operator-id/role')
        .send({ role: OperatorRole.OPERATOR })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Update failed');
    });
  });

  describe('POST /check-permission', () => {
    it('should check permission for current operator', async () => {
      const permissionResult = { granted: true };
      mockRBACService.checkPermission!.mockResolvedValue(permissionResult);

      const response = await request(app)
        .post('/api/rbac/check-permission')
        .send({
          resource: 'command',
          action: 'execute',
          resourceId: 'test-resource',
          metadata: { customField: 'value' },
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(permissionResult);
      expect(mockRBACService.checkPermission).toHaveBeenCalledWith({
        operatorId: 'test-operator-id',
        operatorRole: undefined, // Not set in mock
        resource: 'command',
        action: 'execute',
        resourceId: 'test-resource',
        metadata: {
          clientIp: expect.any(String),
          userAgent: undefined,
          customField: 'value',
        },
      });
    });

    it('should require resource and action', async () => {
      const response = await request(app)
        .post('/api/rbac/check-permission')
        .send({ resource: 'command' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Resource and action are required');
    });
  });

  describe('GET /operators', () => {
    it('should return all operators', async () => {
      const operators = [
        {
          id: 'op1',
          username: 'user1',
          email: 'user1@example.com',
          role: OperatorRole.OPERATOR,
          isActive: true,
          lastLogin: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockOperatorRepository.findAll!.mockResolvedValue(operators as any);
      mockAuditLogRepository.create!.mockResolvedValue({} as any);

      const response = await request(app).get('/api/rbac/operators').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).not.toHaveProperty('passwordHash');
      expect(response.body.data[0]).not.toHaveProperty('sessionToken');
    });

    it('should handle repository errors', async () => {
      mockOperatorRepository.findAll!.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/rbac/operators').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get operators');
    });
  });
});
