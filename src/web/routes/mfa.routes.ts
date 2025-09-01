/**
 * Multi-Factor Authentication routes for SeraphC2 API
 * Handles MFA setup, verification, and management
 */

import { Router, Request, Response } from 'express';
import { MfaService } from '../../core/auth/mfa.service';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { OperatorRole } from '../../types/entities';

export function createMfaRoutes(mfaService: MfaService, authMiddleware: AuthMiddleware): Router {
  const router = Router();

  /**
   * POST /api/mfa/setup
   * Setup MFA for the current operator
   */
  router.post(
    '/setup',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const result = await mfaService.setupMfa(req.operator.id);

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          data: {
            secret: result.secret,
            qrCodeUrl: result.qrCodeUrl,
            backupCodes: result.backupCodes,
          },
        });
      } catch (error) {
        console.error('MFA setup route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/mfa/verify
   * Verify MFA token
   */
  router.post(
    '/verify',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const { token } = req.body;

        if (!token) {
          return res.status(400).json({
            success: false,
            error: 'MFA token is required',
          });
        }

        const result = await mfaService.verifyMfaToken({
          operatorId: req.operator.id,
          token,
        });

        return res.json({
          success: result.success,
          error: result.error,
        });
      } catch (error) {
        console.error('MFA verification route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/mfa/verify-backup-code
   * Verify backup code
   */
  router.post(
    '/verify-backup-code',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const { backupCode } = req.body;

        if (!backupCode) {
          return res.status(400).json({
            success: false,
            error: 'Backup code is required',
          });
        }

        const result = await mfaService.verifyBackupCode({
          operatorId: req.operator.id,
          backupCode,
        });

        return res.json({
          success: result.success,
          error: result.error,
        });
      } catch (error) {
        console.error('Backup code verification route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * GET /api/mfa/status
   * Get MFA status for current operator
   */
  router.get(
    '/status',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const isConfigured = await mfaService.isMfaConfigured(req.operator.id);
        const isRequired = await mfaService.isMfaRequired(req.operator);
        const enforcementPolicy = mfaService.getEnforcementPolicy();

        return res.json({
          success: true,
          data: {
            configured: isConfigured,
            required: isRequired,
            enforcementPolicy,
          },
        });
      } catch (error) {
        console.error('MFA status route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/mfa/regenerate-backup-codes
   * Regenerate backup codes
   */
  router.post(
    '/regenerate-backup-codes',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const result = await mfaService.regenerateBackupCodes(req.operator.id);

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          data: {
            backupCodes: result.backupCodes,
          },
        });
      } catch (error) {
        console.error('Backup code regeneration route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * DELETE /api/mfa/disable
   * Disable MFA for current operator (admin only for other operators)
   */
  router.delete(
    '/disable/:operatorId?',
    authMiddleware.authenticate(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        if (!req.operator) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
          });
        }

        const targetOperatorId = req.params['operatorId'] || req.operator.id;

        // Check if trying to disable MFA for another operator
        if (targetOperatorId !== req.operator.id) {
          // Only administrators can disable MFA for other operators
          if (req.operator.role !== OperatorRole.ADMINISTRATOR) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions',
            });
          }
        }

        const result = await mfaService.disableMfa(targetOperatorId);

        if (!result.success) {
          return res.status(400).json({
            success: false,
            error: result.error,
          });
        }

        return res.json({
          success: true,
          message: 'MFA disabled successfully',
        });
      } catch (error) {
        console.error('MFA disable route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * PUT /api/mfa/enforcement-policy
   * Update MFA enforcement policy (admin only)
   */
  router.put(
    '/enforcement-policy',
    authMiddleware.requireAdmin(),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const { enforceForRole, gracePeriodDays, allowBackupCodes } = req.body;

        // Validate input
        if (enforceForRole && !Array.isArray(enforceForRole)) {
          return res.status(400).json({
            success: false,
            error: 'enforceForRole must be an array',
          });
        }

        if (
          gracePeriodDays !== undefined &&
          (typeof gracePeriodDays !== 'number' || gracePeriodDays < 0)
        ) {
          return res.status(400).json({
            success: false,
            error: 'gracePeriodDays must be a non-negative number',
          });
        }

        if (allowBackupCodes !== undefined && typeof allowBackupCodes !== 'boolean') {
          return res.status(400).json({
            success: false,
            error: 'allowBackupCodes must be a boolean',
          });
        }

        // Update policy
        mfaService.updateEnforcementPolicy({
          enforceForRole,
          gracePeriodDays,
          allowBackupCodes,
        });

        const updatedPolicy = mfaService.getEnforcementPolicy();

        return res.json({
          success: true,
          data: {
            enforcementPolicy: updatedPolicy,
          },
          message: 'MFA enforcement policy updated successfully',
        });
      } catch (error) {
        console.error('MFA policy update route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * GET /api/mfa/enforcement-policy
   * Get current MFA enforcement policy (admin only)
   */
  router.get(
    '/enforcement-policy',
    authMiddleware.requireAdmin(),
    async (_req: Request, res: Response): Promise<Response> => {
      try {
        const enforcementPolicy = mfaService.getEnforcementPolicy();

        return res.json({
          success: true,
          data: {
            enforcementPolicy,
          },
        });
      } catch (error) {
        console.error('MFA policy get route error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  return router;
}
