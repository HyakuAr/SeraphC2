/**
 * RBAC Service for web client
 * Handles role and permission management API calls
 */

import { apiClient } from './apiClient';

export interface Permission {
  resource: string;
  actions: string[];
}

export interface RoleDefinition {
  role: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface Operator {
  id: string;
  username: string;
  email: string;
  role: string;
  lastLogin?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class RBACService {
  /**
   * Get all available roles and their definitions
   */
  async getRoles(): Promise<ApiResponse<RoleDefinition[]>> {
    try {
      const response = await apiClient.get('/api/rbac/roles');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get roles',
      };
    }
  }

  /**
   * Get specific role definition
   */
  async getRole(role: string): Promise<ApiResponse<RoleDefinition>> {
    try {
      const response = await apiClient.get(`/api/rbac/roles/${role}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get role',
      };
    }
  }

  /**
   * Get all operators
   */
  async getOperators(): Promise<ApiResponse<Operator[]>> {
    try {
      const response = await apiClient.get('/api/rbac/operators');
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get operators',
      };
    }
  }

  /**
   * Get operator permissions
   */
  async getOperatorPermissions(operatorId: string): Promise<ApiResponse<Permission[]>> {
    try {
      const response = await apiClient.get(`/api/rbac/operators/${operatorId}/permissions`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get operator permissions',
      };
    }
  }

  /**
   * Update operator permissions
   */
  async updateOperatorPermissions(
    operatorId: string,
    permissions: Permission[]
  ): Promise<ApiResponse<void>> {
    try {
      const response = await apiClient.put(`/api/rbac/operators/${operatorId}/permissions`, {
        permissions,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update operator permissions',
      };
    }
  }

  /**
   * Update operator role
   */
  async updateOperatorRole(operatorId: string, role: string): Promise<ApiResponse<void>> {
    try {
      const response = await apiClient.put(`/api/rbac/operators/${operatorId}/role`, {
        role,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update operator role',
      };
    }
  }

  /**
   * Check if current user has permission
   */
  async checkPermission(
    resource: string,
    action: string,
    resourceId?: string,
    metadata?: Record<string, any>
  ): Promise<ApiResponse<PermissionCheckResult>> {
    try {
      const response = await apiClient.post('/api/rbac/check-permission', {
        resource,
        action,
        resourceId,
        metadata,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to check permission',
      };
    }
  }

  /**
   * Check if current user has any of the specified permissions
   */
  async hasAnyPermission(
    permissions: Array<{ resource: string; action: string }>
  ): Promise<boolean> {
    try {
      const results = await Promise.all(
        permissions.map(({ resource, action }) => this.checkPermission(resource, action))
      );

      return results.some(result => result.success && result.data?.granted);
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Check if current user has all of the specified permissions
   */
  async hasAllPermissions(
    permissions: Array<{ resource: string; action: string }>
  ): Promise<boolean> {
    try {
      const results = await Promise.all(
        permissions.map(({ resource, action }) => this.checkPermission(resource, action))
      );

      return results.every(result => result.success && result.data?.granted);
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  }

  /**
   * Check if current user can manage operators
   */
  async canManageOperators(): Promise<boolean> {
    return this.hasAnyPermission([
      { resource: 'operator', action: 'manage' },
      { resource: 'operator', action: 'update' },
    ]);
  }

  /**
   * Check if current user can view audit logs
   */
  async canViewAuditLogs(): Promise<boolean> {
    return this.hasAnyPermission([
      { resource: 'audit', action: 'read' },
      { resource: 'audit', action: 'view' },
    ]);
  }

  /**
   * Check if current user is administrator
   */
  async isAdministrator(): Promise<boolean> {
    return this.hasAnyPermission([{ resource: 'system', action: 'manage' }]);
  }
}

export const rbacService = new RBACService();
