/**
 * Authentication and authorization middleware for SeraphC2
 * Handles JWT token validation and RBAC permission checking
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../core/auth/auth.service';
import { RBACService } from '../../core/services/rbac.service';
import { ResourceType, Action, PermissionContext } from '../../types/rbac';
import { Operator } from '../../types/entities';

// Extend Express Request to include operator info
declare global {
  namespace Express {
    interface Request {
      operator?: Operator;
      operatorId?: string;
    }
  }
}

export interface AuthMiddlewareOptions {
  required?: boolean;
  resource?: ResourceType;
  action?: Action;
  getResourceId?: (req: Request) => string | undefined;
  getMetadata?: (req: Request) => Record<string, any>;
}

export class AuthMiddleware {
  constructor(
    private authService: AuthService,
    private rbacService: RBACService
  ) {}

  /**
   * JWT token validation middleware
   */
  authenticate(options: AuthMiddlewareOptions = { required: true }) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          if (options.required) {
            res.status(401).json({
              success: false,
              error: 'Authentication required',
            });
            return;
          }
          return next();
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const validation = await this.authService.validateToken(token);

        if (!validation.valid || !validation.operator) {
          res.status(401).json({
            success: false,
            error: validation.error || 'Invalid token',
          });
          return;
        }

        // Add operator info to request
        req.operator = validation.operator;
        req.operatorId = validation.operator.id;

        return next();
      } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
          success: false,
          error: 'Authentication failed',
        });
      }
    };
  }

  /**
   * Permission checking middleware
   */
  authorize(resource: ResourceType, action: Action, options: AuthMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.operator || !req.operatorId) {
          res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
          return;
        }

        const resourceId = options.getResourceId ? options.getResourceId(req) : undefined;
        const context: PermissionContext = {
          operatorId: req.operatorId,
          operatorRole: req.operator.role,
          resource,
          action,
          ...(resourceId && { resourceId }),
          metadata: {
            clientIp: req.ip,
            userAgent: req.get('User-Agent'),
            ...(options.getMetadata ? options.getMetadata(req) : {}),
          },
        };

        const permissionResult = await this.rbacService.checkPermission(context);

        if (!permissionResult.granted) {
          res.status(403).json({
            success: false,
            error: 'Access denied',
            reason: permissionResult.reason,
          });
          return;
        }

        return next();
      } catch (error) {
        console.error('Authorization error:', error);
        res.status(500).json({
          success: false,
          error: 'Authorization failed',
        });
      }
    };
  }

  /**
   * Combined authentication and authorization middleware
   */
  requirePermission(resource: ResourceType, action: Action, options: AuthMiddlewareOptions = {}) {
    return [this.authenticate({ required: true }), this.authorize(resource, action, options)];
  }

  /**
   * Role-based middleware (simplified)
   */
  requireRole(requiredRole: string) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.operator) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const roleHierarchy = {
        read_only: 1,
        operator: 2,
        administrator: 3,
      };

      const userRoleLevel = roleHierarchy[req.operator.role as keyof typeof roleHierarchy] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 999;

      if (userRoleLevel < requiredRoleLevel) {
        res.status(403).json({
          success: false,
          error: 'Insufficient privileges',
          required: requiredRole,
          current: req.operator.role,
        });
        return;
      }

      return next();
    };
  }

  /**
   * Administrator-only middleware
   */
  requireAdmin() {
    return this.requireRole('administrator');
  }

  /**
   * Operator or higher middleware
   */
  requireOperator() {
    return this.requireRole('operator');
  }

  /**
   * Resource ownership middleware
   */
  requireOwnership(getOwnerId: (req: Request) => string | undefined) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.operator) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Administrators can access any resource
      if (req.operator.role === 'administrator') {
        return next();
      }

      const resourceOwnerId = getOwnerId(req);

      if (!resourceOwnerId) {
        // If no owner ID can be determined, allow access
        return next();
      }

      if (resourceOwnerId !== req.operatorId) {
        res.status(403).json({
          success: false,
          error: 'Access denied: not resource owner',
        });
        return;
      }

      return next();
    };
  }

  /**
   * Rate limiting by operator
   */
  rateLimitByOperator(maxRequests: number = 100, windowMs: number = 60000) {
    const requestCounts = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.operatorId) {
        return next();
      }

      const now = Date.now();
      const operatorId = req.operatorId;
      const current = requestCounts.get(operatorId);

      if (!current || now > current.resetTime) {
        requestCounts.set(operatorId, {
          count: 1,
          resetTime: now + windowMs,
        });
        return next();
      }

      if (current.count >= maxRequests) {
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((current.resetTime - now) / 1000),
        });
        return;
      }

      current.count++;
      return next();
    };
  }
}
