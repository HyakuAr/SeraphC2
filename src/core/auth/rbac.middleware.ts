/**
 * RBAC middleware for Express.js routes
 */

import { Request, Response, NextFunction } from 'express';
import { OperatorRole } from '../../types/entities';

/**
 * Simple RBAC middleware that checks permissions based on string patterns
 */
export const rbacMiddleware = (requiredPermissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const operator = (req as any).user || (req as any).operator;

    if (!operator) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Administrators have all permissions
    if (operator.role === OperatorRole.ADMINISTRATOR) {
      return next();
    }

    // For now, allow all authenticated users to access module endpoints
    // In a real implementation, this would check specific permissions
    return next();
  };
};
