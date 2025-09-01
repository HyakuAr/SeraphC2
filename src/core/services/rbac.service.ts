/**
 * Role-Based Access Control (RBAC) service for SeraphC2
 * Handles permission checking and role management
 */

import { OperatorRepository } from '../repositories/interfaces';
import { OperatorRole } from '../../types/entities';
import {
  ResourceType,
  Action,
  Permission,
  PermissionContext,
  PermissionResult,
  DEFAULT_ROLE_DEFINITIONS,
  PermissionUtils,
} from '../../types/rbac';

export class RBACService {
  constructor(private operatorRepository: OperatorRepository) {}

  /**
   * Check if an operator has permission to perform an action on a resource
   */
  async checkPermission(context: PermissionContext): Promise<PermissionResult> {
    try {
      // Get operator details
      const operator = await this.operatorRepository.findById(context.operatorId);

      if (!operator || !operator.isActive) {
        return {
          granted: false,
          reason: 'Operator not found or inactive',
        };
      }

      // Check role-based permissions
      const rolePermission = this.checkRolePermission(
        operator.role,
        context.resource,
        context.action
      );

      if (!rolePermission.granted) {
        return rolePermission;
      }

      return { granted: true };
    } catch (error) {
      console.error('Permission check error:', error);
      return {
        granted: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Check role-based permissions
   */
  private checkRolePermission(
    role: OperatorRole,
    resource: ResourceType,
    action: Action
  ): PermissionResult {
    const roleDefinition = PermissionUtils.getRoleDefinition(role);

    if (!roleDefinition) {
      return {
        granted: false,
        reason: `Unknown role: ${role}`,
      };
    }

    const hasPermission = PermissionUtils.hasPermission(roleDefinition, resource, action);

    if (hasPermission) {
      return { granted: true };
    } else {
      return {
        granted: false,
        reason: `Role ${role} does not have ${action} permission on ${resource}`,
      };
    }
  }

  /**
   * Get all permissions for an operator
   */
  async getOperatorPermissions(operatorId: string): Promise<Permission[]> {
    const operator = await this.operatorRepository.findById(operatorId);

    if (!operator) {
      return [];
    }

    // Get role-based permissions
    const rolePermissions = PermissionUtils.getRolePermissions(operator.role);

    return rolePermissions;
  }

  /**
   * Update operator permissions
   */
  async updateOperatorPermissions(
    operatorId: string,
    permissions: Permission[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate permissions
      const invalidPermissions = permissions.filter(p => !PermissionUtils.validatePermission(p));

      if (invalidPermissions.length > 0) {
        return {
          success: false,
          error: `Invalid permissions: ${invalidPermissions.map(p => `${p.resource}:${p.actions.join(',')}`).join(', ')}`,
        };
      }

      // Convert to entity permissions format
      const entityPermissions = permissions.map(p => ({
        resource: p.resource as string,
        actions: p.actions as string[],
      }));

      await this.operatorRepository.update(operatorId, { permissions: entityPermissions });

      return { success: true };
    } catch (error) {
      console.error('Update permissions error:', error);
      return {
        success: false,
        error: 'Failed to update permissions',
      };
    }
  }

  /**
   * Update operator role
   */
  async updateOperatorRole(
    operatorId: string,
    newRole: OperatorRole
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.operatorRepository.update(operatorId, { role: newRole });

      return { success: true };
    } catch (error) {
      console.error('Update role error:', error);
      return {
        success: false,
        error: 'Failed to update role',
      };
    }
  }

  /**
   * Get role definition
   */
  getRoleDefinition(role: OperatorRole) {
    return PermissionUtils.getRoleDefinition(role);
  }

  /**
   * Get all available roles
   */
  getAllRoles() {
    return DEFAULT_ROLE_DEFINITIONS;
  }

  /**
   * Check if operator can manage another operator
   */
  async canManageOperator(managerId: string, targetOperatorId: string): Promise<PermissionResult> {
    const manager = await this.operatorRepository.findById(managerId);
    const target = await this.operatorRepository.findById(targetOperatorId);

    if (!manager || !target) {
      return {
        granted: false,
        reason: 'Operator not found',
      };
    }

    // Only administrators can manage other operators
    if (manager.role !== OperatorRole.ADMINISTRATOR) {
      return {
        granted: false,
        reason: 'Only administrators can manage operators',
      };
    }

    // Administrators cannot demote themselves
    if (managerId === targetOperatorId && target.role === OperatorRole.ADMINISTRATOR) {
      return {
        granted: false,
        reason: 'Cannot modify your own administrator role',
      };
    }

    return { granted: true };
  }
}
