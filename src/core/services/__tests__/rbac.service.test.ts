/**
 * RBAC Service Tests
 * Tests for Role-Based Access Control functionality
 */

import { RBACService } from '../rbac.service';
import { OperatorRepository } from '../../repositories/interfaces';
import { Operator, OperatorRole } from '../../../types/entities';
import { ResourceType, Action, PermissionContext } from '../../../types/rbac';

// Mock operator repository
const mockOperatorRepository: jest.Mocked<OperatorRepository> = {
  create: jest.fn(),
  findById: jest.fn(),
  findByUsername: jest.fn(),
  findByEmail: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findBySessionToken: jest.fn(),
  findActiveOperators: jest.fn(),
  updateLastLogin: jest.fn(),
  updateSessionToken: jest.fn(),
  deactivateOperator: jest.fn(),
  activateOperator: jest.fn(),
};

describe('RBACService', () => {
  let rbacService: RBACService;
  let mockOperator: Operator;

  beforeEach(() => {
    rbacService = new RBACService(mockOperatorRepository);

    mockOperator = {
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

    jest.clearAllMocks();
  });

  describe('checkPermission', () => {
    it('should grant permission for valid operator with appropriate role', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const context: PermissionContext = {
        operatorId: 'test-operator-id',
        operatorRole: OperatorRole.OPERATOR,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(true);
      expect(mockOperatorRepository.findById).toHaveBeenCalledWith('test-operator-id');
    });

    it('should deny permission for inactive operator', async () => {
      const inactiveOperator = { ...mockOperator, isActive: false };
      mockOperatorRepository.findById.mockResolvedValue(inactiveOperator);

      const context: PermissionContext = {
        operatorId: 'test-operator-id',
        operatorRole: OperatorRole.OPERATOR,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Operator not found or inactive');
    });

    it('should deny permission for non-existent operator', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const context: PermissionContext = {
        operatorId: 'non-existent-id',
        operatorRole: OperatorRole.OPERATOR,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Operator not found or inactive');
    });

    it('should deny permission for insufficient role privileges', async () => {
      const readOnlyOperator = { ...mockOperator, role: OperatorRole.READ_ONLY };
      mockOperatorRepository.findById.mockResolvedValue(readOnlyOperator);

      const context: PermissionContext = {
        operatorId: 'test-operator-id',
        operatorRole: OperatorRole.READ_ONLY,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('does not have execute permission on command');
    });

    it('should grant permission for administrator on any resource', async () => {
      const adminOperator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };
      mockOperatorRepository.findById.mockResolvedValue(adminOperator);

      const context: PermissionContext = {
        operatorId: 'test-operator-id',
        operatorRole: OperatorRole.ADMINISTRATOR,
        resource: ResourceType.OPERATOR,
        action: Action.MANAGE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(true);
    });

    it('should deny permission for read-only user trying to execute commands', async () => {
      const readOnlyOperator = {
        ...mockOperator,
        role: OperatorRole.READ_ONLY,
      };
      mockOperatorRepository.findById.mockResolvedValue(readOnlyOperator);

      const context: PermissionContext = {
        operatorId: 'test-operator-id',
        operatorRole: OperatorRole.READ_ONLY,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('does not have execute permission on command');
    });
  });

  describe('getOperatorPermissions', () => {
    it('should return role-based permissions', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const permissions = await rbacService.getOperatorPermissions('test-operator-id');

      expect(permissions.length).toBeGreaterThan(0);
      // Should include role permissions for operator
      expect(permissions.some(p => p.resource === ResourceType.COMMAND)).toBe(true);
    });

    it('should return empty array for non-existent operator', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const permissions = await rbacService.getOperatorPermissions('non-existent-id');

      expect(permissions).toEqual([]);
    });
  });

  describe('updateOperatorPermissions', () => {
    it('should update operator permissions successfully', async () => {
      mockOperatorRepository.update.mockResolvedValue(mockOperator);

      const newPermissions = [
        {
          resource: ResourceType.SYSTEM,
          actions: [Action.READ, Action.UPDATE],
        },
      ];

      const result = await rbacService.updateOperatorPermissions(
        'test-operator-id',
        newPermissions
      );

      expect(result.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith('test-operator-id', {
        permissions: newPermissions,
      });
    });

    it('should reject invalid permissions', async () => {
      const invalidPermissions = [
        {
          resource: 'invalid-resource' as ResourceType,
          actions: [Action.READ],
        },
      ];

      const result = await rbacService.updateOperatorPermissions(
        'test-operator-id',
        invalidPermissions
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid permissions');
      expect(mockOperatorRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('updateOperatorRole', () => {
    it('should update operator role successfully', async () => {
      mockOperatorRepository.update.mockResolvedValue(mockOperator);

      const result = await rbacService.updateOperatorRole(
        'test-operator-id',
        OperatorRole.ADMINISTRATOR
      );

      expect(result.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith('test-operator-id', {
        role: OperatorRole.ADMINISTRATOR,
      });
    });
  });

  describe('canManageOperator', () => {
    it('should allow administrator to manage other operators', async () => {
      const adminOperator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };
      const targetOperator = { ...mockOperator, id: 'target-id', role: OperatorRole.OPERATOR };

      mockOperatorRepository.findById
        .mockResolvedValueOnce(adminOperator)
        .mockResolvedValueOnce(targetOperator);

      const result = await rbacService.canManageOperator('test-operator-id', 'target-id');

      expect(result.granted).toBe(true);
    });

    it('should deny non-administrator from managing operators', async () => {
      const operatorUser = { ...mockOperator, role: OperatorRole.OPERATOR };
      const targetOperator = { ...mockOperator, id: 'target-id', role: OperatorRole.READ_ONLY };

      mockOperatorRepository.findById
        .mockResolvedValueOnce(operatorUser)
        .mockResolvedValueOnce(targetOperator);

      const result = await rbacService.canManageOperator('test-operator-id', 'target-id');

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Only administrators can manage operators');
    });

    it('should prevent administrator from demoting themselves', async () => {
      const adminOperator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };

      mockOperatorRepository.findById
        .mockResolvedValueOnce(adminOperator)
        .mockResolvedValueOnce(adminOperator);

      const result = await rbacService.canManageOperator('test-operator-id', 'test-operator-id');

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Cannot modify your own administrator role');
    });
  });

  describe('getRoleDefinition', () => {
    it('should return role definition for valid role', () => {
      const roleDefinition = rbacService.getRoleDefinition(OperatorRole.OPERATOR);

      expect(roleDefinition).toBeDefined();
      expect(roleDefinition?.role).toBe(OperatorRole.OPERATOR);
      expect(roleDefinition?.permissions.length).toBeGreaterThan(0);
    });

    it('should return undefined for invalid role', () => {
      const roleDefinition = rbacService.getRoleDefinition('invalid-role' as OperatorRole);

      expect(roleDefinition).toBeUndefined();
    });
  });

  describe('getAllRoles', () => {
    it('should return all available roles', () => {
      const roles = rbacService.getAllRoles();

      expect(roles.length).toBe(3); // READ_ONLY, OPERATOR, ADMINISTRATOR
      expect(roles.map(r => r.role)).toContain(OperatorRole.READ_ONLY);
      expect(roles.map(r => r.role)).toContain(OperatorRole.OPERATOR);
      expect(roles.map(r => r.role)).toContain(OperatorRole.ADMINISTRATOR);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockOperatorRepository.findById.mockRejectedValue(new Error('Database error'));

      const context: PermissionContext = {
        operatorId: 'test-operator-id',
        operatorRole: OperatorRole.OPERATOR,
        resource: ResourceType.COMMAND,
        action: Action.EXECUTE,
      };

      const result = await rbacService.checkPermission(context);

      expect(result.granted).toBe(false);
      expect(result.reason).toBe('Permission check failed');
    });

    it('should handle update errors gracefully', async () => {
      mockOperatorRepository.update.mockRejectedValue(new Error('Update failed'));

      const result = await rbacService.updateOperatorRole(
        'test-operator-id',
        OperatorRole.ADMINISTRATOR
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update role');
    });
  });
});
