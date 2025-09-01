/**
 * Role-based access control middleware
 */

import { Request, Response, NextFunction } from 'express';
import { OperatorRole } from '../../types/entities';

export interface RoleMiddlewareOptions {
  requiredRole: OperatorRole;
  allowHigherRoles?: boolean;
}

export class RoleMiddleware {
  static requireRole(options: RoleMiddlewareOptions) {
    return (req: Request, res: Response, next: NextFunction) => {
      const operator = (req as any).operator;

      if (!operator) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasRequiredRole = this.checkRole(
        operator.role,
        options.requiredRole,
        options.allowHigherRoles
      );

      if (!hasRequiredRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  private static checkRole(
    userRole: OperatorRole,
    requiredRole: OperatorRole,
    allowHigher = true
  ): boolean {
    const roleHierarchy = {
      [OperatorRole.READ_ONLY]: 1,
      [OperatorRole.OPERATOR]: 2,
      [OperatorRole.ADMINISTRATOR]: 3,
    };

    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    return allowHigher ? userLevel >= requiredLevel : userLevel === requiredLevel;
  }
}

export const roleMiddleware = RoleMiddleware.requireRole;
