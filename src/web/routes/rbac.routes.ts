/**
 * RBAC (Role-Based Access Control) routes
 * Handles role and permission management endpoints
 */

import { Router, Request, Response } from 'express';
import { RBACService } from '../../core/services/rbac.service';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { AuditLogRepository } from '../../core/repositories/audit-log.repository';
import { OperatorRepository } from '../../core/repositories/operator.repository';
import { ResourceType, Action, Permission } from '../../types/rbac';
import { OperatorRole } from '../../types/entities';

export function createRBACRoutes(
  rbacService: RBACService,
  authMiddleware: AuthMiddleware,
  auditLogRepository: AuditLogRepository,
  operatorRepository: OperatorRepository
): Router {
  const router = Router();

  // Get all available roles and their permissions
  router.get('/roles', authMiddleware.authenticate(), async (req: Request, res: Response) => {
    try {
      const roles = rbacService.getAllRoles();

      await auditLogRepository.create({
        operatorId: req.operatorId,
        action: 'view_roles',
        resourceType: 'system',
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      console.error('Get roles error:', error);

      await auditLogRepository.create({
        operatorId: req.operatorId,
        action: 'view_roles',
        resourceType: 'system',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get roles',
      });
    }
  });

  // Get specific role definition
  router.get('/roles/:role', authMiddleware.authenticate(), async (req: Request, res: Response) => {
    try {
      const role = req.params.role as OperatorRole;
      const roleDefinition = rbacService.getRoleDefinition(role);

      if (!roleDefinition) {
        return res.status(404).json({
          success: false,
          error: 'Role not found',
        });
      }

      await auditLogRepository.create({
        operatorId: req.operatorId,
        action: 'view_role',
        resourceType: 'system',
        resourceId: role,
        success: true,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        data: roleDefinition,
      });
    } catch (error) {
      console.error('Get role error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get role',
      });
    }
  });

  // Get operator permissions
  router.get(
    '/operators/:operatorId/permissions',
    authMiddleware.requirePermission(ResourceType.OPERATOR, Action.READ, {
      getResourceId: req => req.params.operatorId,
    }),
    async (req: Request, res: Response) => {
      try {
        const operatorId = req.params.operatorId;
        const permissions = await rbacService.getOperatorPermissions(operatorId);

        await auditLogRepository.create({
          operatorId: req.operatorId,
          action: 'view_operator_permissions',
          resourceType: 'operator',
          resourceId: operatorId,
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        res.json({
          success: true,
          data: permissions,
        });
      } catch (error) {
        console.error('Get operator permissions error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get operator permissions',
        });
      }
    }
  );

  // Update operator permissions
  router.put(
    '/operators/:operatorId/permissions',
    authMiddleware.requirePermission(ResourceType.OPERATOR, Action.MANAGE, {
      getResourceId: req => req.params.operatorId,
    }),
    async (req: Request, res: Response) => {
      try {
        const operatorId = req.params.operatorId;
        const { permissions } = req.body as { permissions: Permission[] };

        if (!Array.isArray(permissions)) {
          return res.status(400).json({
            success: false,
            error: 'Permissions must be an array',
          });
        }

        // Check if operator can manage the target operator
        const canManage = await rbacService.canManageOperator(req.operatorId!, operatorId);
        if (!canManage.granted) {
          return res.status(403).json({
            success: false,
            error: canManage.reason,
          });
        }

        const result = await rbacService.updateOperatorPermissions(operatorId, permissions);

        await auditLogRepository.create({
          operatorId: req.operatorId,
          action: 'update_operator_permissions',
          resourceType: 'operator',
          resourceId: operatorId,
          details: { permissions },
          success: result.success,
          errorMessage: result.error,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        res.json({
          success: true,
          message: 'Operator permissions updated successfully',
        });
      } catch (error) {
        console.error('Update operator permissions error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update operator permissions',
        });
      }
    }
  );

  // Update operator role
  router.put(
    '/operators/:operatorId/role',
    authMiddleware.requirePermission(ResourceType.OPERATOR, Action.MANAGE, {
      getResourceId: req => req.params.operatorId,
    }),
    async (req: Request, res: Response) => {
      try {
        const operatorId = req.params.operatorId;
        const { role } = req.body as { role: OperatorRole };

        if (!Object.values(OperatorRole).includes(role)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid role',
          });
        }

        // Check if operator can manage the target operator
        const canManage = await rbacService.canManageOperator(req.operatorId!, operatorId);
        if (!canManage.granted) {
          return res.status(403).json({
            success: false,
            error: canManage.reason,
          });
        }

        const result = await rbacService.updateOperatorRole(operatorId, role);

        await auditLogRepository.create({
          operatorId: req.operatorId,
          action: 'update_operator_role',
          resourceType: 'operator',
          resourceId: operatorId,
          details: { newRole: role },
          success: result.success,
          errorMessage: result.error,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        res.json({
          success: true,
          message: 'Operator role updated successfully',
        });
      } catch (error) {
        console.error('Update operator role error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update operator role',
        });
      }
    }
  );

  // Check permission for current operator
  router.post(
    '/check-permission',
    authMiddleware.authenticate(),
    async (req: Request, res: Response) => {
      try {
        const { resource, action, resourceId, metadata } = req.body;

        if (!resource || !action) {
          return res.status(400).json({
            success: false,
            error: 'Resource and action are required',
          });
        }

        const context = {
          operatorId: req.operatorId!,
          operatorRole: req.operator!.role,
          resource: resource as ResourceType,
          action: action as Action,
          resourceId,
          metadata: {
            clientIp: req.ip,
            userAgent: req.get('User-Agent'),
            ...metadata,
          },
        };

        const result = await rbacService.checkPermission(context);

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error('Check permission error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to check permission',
        });
      }
    }
  );

  // Get all operators with their roles (admin only)
  router.get(
    '/operators',
    authMiddleware.requirePermission(ResourceType.OPERATOR, Action.READ),
    async (req: Request, res: Response) => {
      try {
        const operators = await operatorRepository.findAll();

        // Remove sensitive information
        const safeOperators = operators.map(op => ({
          id: op.id,
          username: op.username,
          email: op.email,
          role: op.role,
          lastLogin: op.lastLogin,
          isActive: op.isActive,
          createdAt: op.createdAt,
          updatedAt: op.updatedAt,
        }));

        await auditLogRepository.create({
          operatorId: req.operatorId,
          action: 'view_operators',
          resourceType: 'operator',
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        res.json({
          success: true,
          data: safeOperators,
        });
      } catch (error) {
        console.error('Get operators error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get operators',
        });
      }
    }
  );

  return router;
}
