/**
 * API authentication middleware supporting multiple authentication methods
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../core/auth/auth.service';
import { ApiKeyService } from '../../core/auth/api-key.service';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    permissions: string[];
    authMethod: 'jwt' | 'apikey' | 'basic';
  };
}

export class ApiAuthMiddleware {
  constructor(
    private authService: AuthService,
    private apiKeyService: ApiKeyService
  ) {}

  /**
   * Middleware that supports multiple authentication methods
   */
  authenticate() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        // Try JWT authentication first
        const jwtResult = await this.tryJwtAuth(req);
        if (jwtResult) {
          req.user = jwtResult;
          return next();
        }

        // Try API key authentication
        const apiKeyResult = await this.tryApiKeyAuth(req);
        if (apiKeyResult) {
          req.user = apiKeyResult;
          return next();
        }

        // Try basic authentication
        const basicResult = await this.tryBasicAuth(req);
        if (basicResult) {
          req.user = basicResult;
          return next();
        }

        // No valid authentication found
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          details: {
            supportedMethods: ['Bearer token', 'API key', 'Basic auth'],
          },
        });
      } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
          success: false,
          error: 'Authentication service error',
          code: 'AUTH_ERROR',
        });
      }
    };
  }

  /**
   * Middleware that requires specific permissions
   */
  requirePermissions(requiredPermissions: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const hasPermission = requiredPermissions.every(
        permission =>
          req.user!.permissions.includes(permission) || req.user!.permissions.includes('*')
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          details: {
            required: requiredPermissions,
            current: req.user.permissions,
          },
        });
      }

      next();
    };
  }

  /**
   * Try JWT authentication
   */
  private async tryJwtAuth(req: Request): Promise<any | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    try {
      const validation = await this.authService.validateToken(token);
      const decoded = validation.valid ? validation.operator : null;
      if (!decoded) {
        return null;
      }

      // Get user permissions from database or token
      const permissions = await this.getUserPermissions(decoded.id);

      return {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        permissions,
        authMethod: 'jwt' as const,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Try API key authentication
   */
  private async tryApiKeyAuth(req: Request): Promise<any | null> {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return null;
    }

    try {
      const keyInfo = await this.apiKeyService.validateApiKey(apiKey);
      if (!keyInfo) {
        return null;
      }

      // Get operator information
      const operator = await this.getOperatorById(keyInfo.operatorId);
      if (!operator) {
        return null;
      }

      return {
        id: operator.id,
        username: operator.username,
        role: operator.role,
        permissions: keyInfo.permissions,
        authMethod: 'apikey' as const,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Try basic authentication
   */
  private async tryBasicAuth(req: Request): Promise<any | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return null;
    }

    try {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      if (!username || !password) {
        return null;
      }

      const loginResult = await this.authService.login({ username, password });
      if (!loginResult.success || !loginResult.operator) {
        return null;
      }

      const permissions = await this.getUserPermissions(loginResult.operator.id);

      return {
        id: loginResult.operator.id,
        username: loginResult.operator.username,
        role: loginResult.operator.role,
        permissions,
        authMethod: 'basic' as const,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user permissions based on role and custom permissions
   */
  private async getUserPermissions(userId: string): Promise<string[]> {
    // This would typically query the database for user-specific permissions
    // For now, return basic permissions based on role
    // In a real implementation, this would be more sophisticated
    return [
      'implants:read',
      'implants:write',
      'commands:execute',
      'files:read',
      'files:write',
      'tasks:read',
      'tasks:write',
    ];
  }

  /**
   * Get operator by ID
   */
  private async getOperatorById(operatorId: string): Promise<any | null> {
    // This would query the operator repository
    // For now, return a mock operator
    return {
      id: operatorId,
      username: 'api-user',
      role: 'operator',
    };
  }
}
