/**
 * Implant management API routes
 * Provides endpoints for implant data and operations
 */

import { Router, Request, Response } from 'express';
import { ImplantManager } from '../../core/engine/implant-manager';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { Logger } from '../../utils/logger';

export interface ImplantRoutesConfig {
  implantManager: ImplantManager;
  authMiddleware: AuthMiddleware;
}

export function createImplantRoutes(config: ImplantRoutesConfig): Router {
  const router = Router();
  const { implantManager, authMiddleware } = config;
  const logger = Logger.getInstance();

  // Apply authentication middleware to all routes
  router.use(authMiddleware.authenticate.bind(authMiddleware));

  /**
   * GET /api/implants - Get all implants
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const implants = await implantManager.getAllImplants();
      const activeSessions = implantManager.getActiveSessions();

      // Enhance implants with session data
      const enhancedImplants = implants.map(implant => {
        const session = activeSessions.find(s => s.implantId === implant.id);
        return {
          ...implant,
          isConnected: !!session && session.isActive,
          lastHeartbeat: session?.lastHeartbeat,
          connectionInfo: session?.connectionInfo,
        };
      });

      res.json({
        success: true,
        data: enhancedImplants,
        count: enhancedImplants.length,
      });
    } catch (error) {
      logger.error('Failed to fetch implants', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch implants',
      });
    }
  });

  /**
   * GET /api/implants/stats - Get implant statistics
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await implantManager.getImplantStats();
      const activeSessions = implantManager.getActiveSessions();

      res.json({
        success: true,
        data: {
          ...stats,
          connected: activeSessions.length,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch implant stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to fetch implant statistics',
      });
    }
  });

  /**
   * GET /api/implants/:id - Get specific implant details
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const implant = await implantManager.getImplant(id);

      if (!implant) {
        return res.status(404).json({
          success: false,
          error: 'Implant not found',
        });
      }

      const session = implantManager.getImplantSession(id);
      const enhancedImplant = {
        ...implant,
        isConnected: !!session && session.isActive,
        lastHeartbeat: session?.lastHeartbeat,
        connectionInfo: session?.connectionInfo,
      };

      return res.json({
        success: true,
        data: enhancedImplant,
      });
    } catch (error) {
      logger.error('Failed to fetch implant details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch implant details',
      });
    }
  });

  /**
   * POST /api/implants/:id/disconnect - Disconnect an implant
   */
  router.post('/:id/disconnect', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const { reason = 'Manual disconnect by operator' } = req.body;

      await implantManager.disconnectImplant(id, reason);

      return res.json({
        success: true,
        message: 'Implant disconnected successfully',
      });
    } catch (error) {
      logger.error('Failed to disconnect implant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to disconnect implant',
      });
    }
  });

  return router;
}
