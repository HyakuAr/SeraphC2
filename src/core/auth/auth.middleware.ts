/**
 * Authentication middleware for Express.js
 * Validates JWT tokens and enforces role-based access control
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { JwtUtils } from './jwt.utils';
import { OperatorRole, Operator } from '../../types/entities';

// Extend Express Request interface to include operator info
declare global {
  namespace Express {
    interface Request {
      operator?: Operator;
    }
  }
}

export interface AuthMiddlewareOptions {
  requiredRole?: OperatorRole;
  requiredPermissions?: string[];
  optional?: boolean;
}

export class AuthMiddleware {
  constructor(private authService: AuthService) {}

  /**
   * Basic authentication middleware that validates JWT tokens
   */
  authenticate = (options: AuthMiddlewareOptions = {}) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        const token = JwtUtils.extractTokenFromHeader(authHeader);

        if (!token) {
          if (options.optional) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: 'Authentication token required',
          });
        }

        // Validate token
        const validation = await this.authService.validateToken(token);

        if (!validation.valid || !validation.operator) {
          return res.status(401).json({
            success: false,
            error: validation.error || 'Invalid authentication token',
          });
        }

        // Attach operator to request
        req.operator = validation.operator;

        // Check role requirements
        if (
          options.requiredRole &&
          !this.hasRequiredRole(validation.operator.role, options.requiredRole)
        ) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
          });
        }

        // Check permission requirements
        if (
          options.requiredPermissions &&
          !this.hasRequiredPermissions(validation.operator, options.requiredPermissions)
        ) {
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
          });
        }

        next();
      } catch (error) {
        console.error('Authentication middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Authentication failed',
        });
      }
    };
  };

  /**
   * Middleware that requires administrator role
   */
  requireAdmin = () => {
    return this.authenticate({ requiredRole: OperatorRole.ADMINISTRATOR });
  };

  /**
   * Middleware that requires operator role or higher
   */
  requireOperator = () => {
    return this.authenticate({ requiredRole: OperatorRole.OPERATOR });
  };

  /**
   * Middleware that allows read-only access
   */
  requireReadOnly = () => {
    return this.authenticate({ requiredRole: OperatorRole.READ_ONLY });
  };

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  optionalAuth = () => {
    return this.authenticate({ optional: true });
  };

  /**
   * Middleware that requires specific permissions
   */
  requirePermissions = (permissions: string[]) => {
    return this.authenticate({ requiredPermissions: permissions });
  };

  /**
   * Check if operator has required role
   */
  private hasRequiredRole(operatorRole: OperatorRole, requiredRole: OperatorRole): boolean {
    const roleHierarchy = {
      [OperatorRole.READ_ONLY]: 1,
      [OperatorRole.OPERATOR]: 2,
      [OperatorRole.ADMINISTRATOR]: 3,
    };

    return roleHierarchy[operatorRole] >= roleHierarchy[requiredRole];
  }

  /**
   * Check if operator has required permissions
   */
  private hasRequiredPermissions(operator: Operator, requiredPermissions: string[]): boolean {
    // Administrator has all permissions
    if (operator.role === OperatorRole.ADMINISTRATOR) {
      return true;
    }

    // Check if operator has all required permissions
    const operatorPermissions = operator.permissions.flatMap(p =>
      p.actions.map(action => `${p.resource}:${action}`)
    );

    return requiredPermissions.every(permission => {
      // Check for exact permission match
      if (operatorPermissions.includes(permission)) {
        return true;
      }

      // Check for wildcard permissions (e.g., "implants:*")
      const [resource] = permission.split(':');
      const wildcardPermission = `${resource}:*`;

      return operatorPermissions.includes(wildcardPermission);
    });
  }

  /**
   * Middleware to validate refresh token
   */
  validateRefreshToken = () => {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          return res.status(400).json({
            success: false,
            error: 'Refresh token required',
          });
        }

        const decoded = JwtUtils.validateRefreshToken(refreshToken);

        if (!decoded) {
          return res.status(401).json({
            success: false,
            error: 'Invalid refresh token',
          });
        }

        // Attach decoded info to request for use in route handler
        req.body.decodedRefreshToken = decoded;
        return next();
      } catch (error) {
        console.error('Refresh token validation error:', error);
        return res.status(500).json({
          success: false,
          error: 'Token validation failed',
        });
      }
    };
  };

  /**
   * Rate limiting middleware for authentication endpoints
   */
  rateLimitAuth = () => {
    const attempts = new Map<string, { count: number; resetTime: number }>();
    const maxAttempts = 5;
    const windowMs = 15 * 60 * 1000; // 15 minutes

    return (req: Request, res: Response, next: NextFunction) => {
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();

      const clientAttempts = attempts.get(clientIp);

      if (clientAttempts) {
        if (now > clientAttempts.resetTime) {
          // Reset window
          attempts.set(clientIp, { count: 1, resetTime: now + windowMs });
        } else if (clientAttempts.count >= maxAttempts) {
          return res.status(429).json({
            success: false,
            error: 'Too many authentication attempts. Please try again later.',
          });
        } else {
          clientAttempts.count++;
        }
      } else {
        attempts.set(clientIp, { count: 1, resetTime: now + windowMs });
      }

      return next();
    };
  };
}
