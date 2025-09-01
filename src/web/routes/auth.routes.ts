/**
 * Authentication routes for SeraphC2 API
 * Handles login, logout, token refresh, and user management
 */

import { Router, Request, Response } from 'express';
import { AuthService, LoginRequest, RefreshTokenRequest } from '../../core/auth/auth.service';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { OperatorRole } from '../../types/entities';

export function createAuthRoutes(authService: AuthService, authMiddleware: AuthMiddleware): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Authenticate operator and return tokens
   */
  router.post(
    '/login',
    authMiddleware.rateLimitAuth(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const loginRequest: LoginRequest = {
          username: req.body.username,
          password: req.body.password,
          mfaToken: req.body.mfaToken,
        };

        // Validate required fields
        if (!loginRequest.username || !loginRequest.password) {
          return res.status(400).json({
            success: false,
            error: 'Username and password are required',
          });
        }

        const result = await authService.login(loginRequest);

        if (!result.success) {
          const statusCode = result.requiresMfa ? 200 : 401;
          return res.status(statusCode).json({
            success: false,
            requiresMfa: result.requiresMfa,
            operator: result.operator,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          data: {
            operator: result.operator,
            tokens: result.tokens,
          },
        });
      } catch (error) {
        console.error('Login route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/auth/logout
   * Logout operator and invalidate session
   */
  router.post(
    '/logout',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const result = await authService.logout(req.operator.id);

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        console.error('Logout route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   */
  router.post(
    '/refresh',
    authMiddleware.validateRefreshToken(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const refreshRequest: RefreshTokenRequest = {
          refreshToken: req.body.refreshToken,
        };

        const result = await authService.refreshToken(refreshRequest);

        if (!result.success) {
          return res.status(401).json({
            success: false,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          data: {
            accessToken: result.accessToken,
          },
        });
      } catch (error) {
        console.error('Token refresh route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * GET /api/auth/me
   * Get current operator information
   */
  router.get(
    '/me',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        return res.json({
          success: true,
          data: {
            operator: {
              id: req.operator.id,
              username: req.operator.username,
              email: req.operator.email,
              role: req.operator.role,
              permissions: req.operator.permissions,
              lastLogin: req.operator.lastLogin,
              isActive: req.operator.isActive,
            },
          },
        });
      } catch (error) {
        console.error('Get current operator route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/auth/create-operator
   * Create a new operator account (admin only)
   */
  router.post(
    '/create-operator',
    authMiddleware.requireAdmin(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const { username, email, password, role } = req.body;

        // Validate required fields
        if (!username || !email || !password) {
          return res.status(400).json({
            success: false,
            error: 'Username, email, and password are required',
          });
        }

        // Validate role
        const validRoles = Object.values(OperatorRole);
        if (role && !validRoles.includes(role)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid role specified',
          });
        }

        const result = await authService.createOperator(
          username,
          email,
          password,
          role || OperatorRole.OPERATOR
        );

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        return res.status(201).json({
          success: true,
          data: {
            operatorId: result.operatorId,
          },
          message: 'Operator created successfully',
        });
      } catch (error) {
        console.error('Create operator route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/auth/change-password
   * Change operator password
   */
  router.post(
    '/change-password',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const { currentPassword, newPassword } = req.body;

        // Validate required fields
        if (!currentPassword || !newPassword) {
          return res.status(400).json({
            success: false,
            error: 'Current password and new password are required',
          });
        }

        const result = await authService.changePassword(
          req.operator.id,
          currentPassword,
          newPassword
        );

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        console.error('Change password route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/auth/validate
   * Validate access token (for client-side token validation)
   */
  router.post('/validate', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token is required',
        });
      }

      const result = await authService.validateToken(token);

      if (!result.valid) {
        return res.status(401).json({
          success: false,
          error: result.error,
        });
      }

      return res.json({
        success: true,
        data: {
          valid: true,
          operator: result.operator
            ? {
                id: result.operator.id,
                username: result.operator.username,
                email: result.operator.email,
                role: result.operator.role,
                permissions: result.operator.permissions,
              }
            : undefined,
        },
      });
    } catch (error) {
      console.error('Token validation route error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}
