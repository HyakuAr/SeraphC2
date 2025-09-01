/**
 * Role-Based Access Control (RBAC) types and definitions for SeraphC2
 * Implements granular permission system for different operations
 */

import { OperatorRole } from './entities';

// Resource types that can be protected
export enum ResourceType {
  IMPLANT = 'implant',
  COMMAND = 'command',
  FILE = 'file',
  PROCESS = 'process',
  SERVICE = 'service',
  SCREEN = 'screen',
  REMOTE_DESKTOP = 'remote_desktop',
  POWERSHELL = 'powershell',
  OPERATOR = 'operator',
  SYSTEM = 'system',
  AUDIT = 'audit',
}

// Actions that can be performed on resources
export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  EXECUTE = 'execute',
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  MANAGE = 'manage',
  VIEW = 'view',
  CONTROL = 'control',
}

// Permission interface
export interface Permission {
  resource: ResourceType;
  actions: Action[];
  conditions?: PermissionCondition[];
}

// Condition types for conditional permissions
export interface PermissionCondition {
  type: 'owner' | 'role' | 'time' | 'ip' | 'custom';
  value: any;
  operator?: 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains';
}

// Role definition with permissions
export interface RoleDefinition {
  role: OperatorRole;
  name: string;
  description: string;
  permissions: Permission[];
  inherits?: OperatorRole[];
}

// Permission check context
export interface PermissionContext {
  operatorId: string;
  operatorRole: OperatorRole;
  resource: ResourceType;
  action: Action;
  resourceId?: string;
  metadata?: Record<string, any>;
}

// Permission check result
export interface PermissionResult {
  granted: boolean;
  reason?: string;
  conditions?: PermissionCondition[];
}

// Default role definitions based on requirements
export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: OperatorRole.READ_ONLY,
    name: 'Read-Only',
    description:
      'Can view implants and command results but cannot execute commands or modify system',
    permissions: [
      {
        resource: ResourceType.IMPLANT,
        actions: [Action.READ, Action.VIEW],
      },
      {
        resource: ResourceType.COMMAND,
        actions: [Action.READ, Action.VIEW],
      },
      {
        resource: ResourceType.FILE,
        actions: [Action.READ, Action.VIEW, Action.DOWNLOAD],
      },
      {
        resource: ResourceType.PROCESS,
        actions: [Action.READ, Action.VIEW],
      },
      {
        resource: ResourceType.SERVICE,
        actions: [Action.READ, Action.VIEW],
      },
      {
        resource: ResourceType.SCREEN,
        actions: [Action.READ, Action.VIEW],
      },
      {
        resource: ResourceType.POWERSHELL,
        actions: [Action.READ, Action.VIEW],
      },
      {
        resource: ResourceType.AUDIT,
        actions: [Action.READ, Action.VIEW],
      },
    ],
  },
  {
    role: OperatorRole.OPERATOR,
    name: 'Operator',
    description:
      'Can execute commands and perform most operations but cannot manage other operators',
    permissions: [
      {
        resource: ResourceType.IMPLANT,
        actions: [Action.READ, Action.VIEW, Action.UPDATE],
      },
      {
        resource: ResourceType.COMMAND,
        actions: [Action.CREATE, Action.READ, Action.VIEW, Action.EXECUTE, Action.DELETE],
      },
      {
        resource: ResourceType.FILE,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.UPDATE,
          Action.DELETE,
          Action.UPLOAD,
          Action.DOWNLOAD,
        ],
      },
      {
        resource: ResourceType.PROCESS,
        actions: [Action.READ, Action.VIEW, Action.MANAGE],
      },
      {
        resource: ResourceType.SERVICE,
        actions: [Action.READ, Action.VIEW, Action.MANAGE],
      },
      {
        resource: ResourceType.SCREEN,
        actions: [Action.READ, Action.VIEW, Action.CONTROL],
      },
      {
        resource: ResourceType.REMOTE_DESKTOP,
        actions: [Action.READ, Action.VIEW, Action.CONTROL],
      },
      {
        resource: ResourceType.POWERSHELL,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.EXECUTE,
          Action.UPDATE,
          Action.DELETE,
        ],
      },
      {
        resource: ResourceType.AUDIT,
        actions: [Action.READ, Action.VIEW],
      },
    ],
  },
  {
    role: OperatorRole.ADMINISTRATOR,
    name: 'Administrator',
    description: 'Full access to all system functions including operator management',
    permissions: [
      {
        resource: ResourceType.IMPLANT,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.UPDATE,
          Action.DELETE,
          Action.MANAGE,
        ],
      },
      {
        resource: ResourceType.COMMAND,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.EXECUTE,
          Action.UPDATE,
          Action.DELETE,
          Action.MANAGE,
        ],
      },
      {
        resource: ResourceType.FILE,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.UPDATE,
          Action.DELETE,
          Action.UPLOAD,
          Action.DOWNLOAD,
          Action.MANAGE,
        ],
      },
      {
        resource: ResourceType.PROCESS,
        actions: [Action.READ, Action.VIEW, Action.MANAGE],
      },
      {
        resource: ResourceType.SERVICE,
        actions: [Action.READ, Action.VIEW, Action.MANAGE],
      },
      {
        resource: ResourceType.SCREEN,
        actions: [Action.READ, Action.VIEW, Action.CONTROL, Action.MANAGE],
      },
      {
        resource: ResourceType.REMOTE_DESKTOP,
        actions: [Action.READ, Action.VIEW, Action.CONTROL, Action.MANAGE],
      },
      {
        resource: ResourceType.POWERSHELL,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.EXECUTE,
          Action.UPDATE,
          Action.DELETE,
          Action.MANAGE,
        ],
      },
      {
        resource: ResourceType.OPERATOR,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.UPDATE,
          Action.DELETE,
          Action.MANAGE,
        ],
      },
      {
        resource: ResourceType.SYSTEM,
        actions: [
          Action.CREATE,
          Action.READ,
          Action.VIEW,
          Action.UPDATE,
          Action.DELETE,
          Action.MANAGE,
        ],
      },
      {
        resource: ResourceType.AUDIT,
        actions: [Action.READ, Action.VIEW, Action.MANAGE],
      },
    ],
  },
];

// Permission validation utilities
export class PermissionUtils {
  /**
   * Check if a role has a specific permission
   */
  static hasPermission(
    roleDefinition: RoleDefinition,
    resource: ResourceType,
    action: Action
  ): boolean {
    return roleDefinition.permissions.some(
      permission => permission.resource === resource && permission.actions.includes(action)
    );
  }

  /**
   * Get all permissions for a role
   */
  static getRolePermissions(role: OperatorRole): Permission[] {
    const roleDefinition = DEFAULT_ROLE_DEFINITIONS.find(def => def.role === role);
    return roleDefinition?.permissions || [];
  }

  /**
   * Get role definition by role
   */
  static getRoleDefinition(role: OperatorRole): RoleDefinition | undefined {
    return DEFAULT_ROLE_DEFINITIONS.find(def => def.role === role);
  }

  /**
   * Check if one role is higher than another
   */
  static isHigherRole(role1: OperatorRole, role2: OperatorRole): boolean {
    const roleHierarchy = {
      [OperatorRole.READ_ONLY]: 1,
      [OperatorRole.OPERATOR]: 2,
      [OperatorRole.ADMINISTRATOR]: 3,
    };

    return roleHierarchy[role1] > roleHierarchy[role2];
  }

  /**
   * Get all available resources
   */
  static getAllResources(): ResourceType[] {
    return Object.values(ResourceType);
  }

  /**
   * Get all available actions
   */
  static getAllActions(): Action[] {
    return Object.values(Action);
  }

  /**
   * Validate permission structure
   */
  static validatePermission(permission: Permission): boolean {
    return (
      Object.values(ResourceType).includes(permission.resource) &&
      permission.actions.length > 0 &&
      permission.actions.every(action => Object.values(Action).includes(action))
    );
  }
}
