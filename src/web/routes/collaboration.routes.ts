/**
 * Collaboration routes for multi-operator features
 * Implements requirements 16.2, 16.3, 16.6, 16.7
 */

import { Router, Request, Response } from 'express';
import { CollaborationService } from '../../core/services/collaboration.service';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { OperatorRole } from '../../types/entities';

export interface CollaborationRoutesConfig {
  collaborationService: CollaborationService;
  authMiddleware: AuthMiddleware;
}

export function createCollaborationRoutes(config: CollaborationRoutesConfig): Router {
  const router = Router();
  const { collaborationService, authMiddleware } = config;

  // Apply authentication to all routes
  router.use(authMiddleware.authenticate());

  /**
   * Get operator presence information
   */
  router.get('/presence', async (_req: Request, res: Response) => {
    try {
      const presence = collaborationService.getAllOperatorPresence();

      res.json({
        success: true,
        data: {
          presence,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to get operator presence:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get operator presence',
      });
    }
  });

  /**
   * Update operator presence
   */
  router.put('/presence', async (req: Request, res: Response) => {
    try {
      const { status, currentImplant, currentAction } = req.body;
      const operatorId = req.operator!.id;

      collaborationService.updateOperatorPresence(operatorId, {
        status,
        currentImplant,
        currentAction,
      });

      // Log activity
      collaborationService.logActivity({
        operatorId,
        username: req.operator!.username,
        action: 'presence_update',
        resource: 'operator_presence',
        details: { status, currentImplant, currentAction },
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: true,
      });

      res.json({
        success: true,
        message: 'Presence updated successfully',
      });
    } catch (error) {
      console.error('Failed to update presence:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update presence',
      });
    }
  });

  /**
   * Send message to operator(s)
   */
  router.post('/messages', async (req: Request, res: Response) => {
    try {
      const { toOperatorId, message, type = 'direct', priority = 'normal', metadata } = req.body;
      const fromOperatorId = req.operator!.id;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message content is required',
        });
      }

      const sentMessage = collaborationService.sendMessage({
        fromOperatorId,
        toOperatorId,
        message: message.trim(),
        type,
        priority,
        metadata,
      });

      // Log activity
      collaborationService.logActivity({
        operatorId: fromOperatorId,
        username: req.operator!.username,
        action: 'message_sent',
        resource: 'operator_message',
        resourceId: sentMessage.id,
        details: { toOperatorId, type, priority },
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: true,
      });

      return res.json({
        success: true,
        data: sentMessage,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to send message',
      });
    }
  });

  /**
   * Get messages for current operator
   */
  router.get('/messages', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query['limit'] as string) || 50;
      const operatorId = req.operator!.id;

      const messages = collaborationService.getMessagesForOperator(operatorId, limit);

      res.json({
        success: true,
        data: {
          messages,
          count: messages.length,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to get messages:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get messages',
      });
    }
  });

  /**
   * Check for session conflicts before accessing implant
   */
  router.post('/conflicts/check', async (req: Request, res: Response) => {
    try {
      const { implantId, action } = req.body;
      const operatorId = req.operator!.id;

      if (!implantId || !action) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID and action are required',
        });
      }

      const conflict = collaborationService.checkSessionConflict(operatorId, implantId, action);

      if (conflict) {
        // Log conflict detection
        collaborationService.logActivity({
          operatorId,
          username: req.operator!.username,
          action: 'conflict_detected',
          resource: 'implant_access',
          resourceId: implantId,
          details: { conflictId: conflict.id, action },
          timestamp: new Date(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          success: true,
        });

        return res.status(409).json({
          success: false,
          conflict,
          error: 'Session conflict detected',
        });
      }

      // Try to acquire lock
      const lockAcquired = collaborationService.acquireImplantLock(
        implantId,
        operatorId,
        req.operator!.username,
        action
      );

      if (!lockAcquired) {
        return res.status(423).json({
          success: false,
          error: 'Unable to acquire implant lock',
        });
      }

      // Log successful access
      collaborationService.logActivity({
        operatorId,
        username: req.operator!.username,
        action: 'implant_access_granted',
        resource: 'implant_access',
        resourceId: implantId,
        details: { action },
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: true,
      });

      return res.json({
        success: true,
        message: 'Access granted',
        implantId,
        action,
      });
    } catch (error) {
      console.error('Failed to check session conflict:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check session conflict',
      });
    }
  });

  /**
   * Resolve session conflict
   */
  router.post('/conflicts/:conflictId/resolve', async (req: Request, res: Response) => {
    try {
      const { conflictId } = req.params;
      const { resolution } = req.body;
      const operatorId = req.operator!.id;

      if (!conflictId) {
        return res.status(400).json({
          success: false,
          error: 'Conflict ID is required',
        });
      }

      if (!resolution || !['takeover', 'queue', 'abort', 'share'].includes(resolution)) {
        return res.status(400).json({
          success: false,
          error: 'Valid resolution is required (takeover, queue, abort, share)',
        });
      }

      const resolved = collaborationService.resolveSessionConflict(
        conflictId,
        resolution,
        operatorId
      );

      if (!resolved) {
        return res.status(404).json({
          success: false,
          error: 'Conflict not found or already resolved',
        });
      }

      // Log conflict resolution
      collaborationService.logActivity({
        operatorId,
        username: req.operator!.username,
        action: 'conflict_resolved',
        resource: 'session_conflict',
        resourceId: conflictId,
        details: { resolution },
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: true,
      });

      return res.json({
        success: true,
        message: 'Conflict resolved successfully',
        resolution,
      });
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to resolve conflict',
      });
    }
  });

  /**
   * Release implant access lock
   */
  router.delete('/locks/:implantId', async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const operatorId = req.operator!.id;

      if (!implantId) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const released = collaborationService.releaseImplantLock(implantId, operatorId);

      // Log lock release
      collaborationService.logActivity({
        operatorId,
        username: req.operator!.username,
        action: 'implant_lock_released',
        resource: 'implant_access',
        resourceId: implantId,
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        success: released,
      });

      return res.json({
        success: true,
        message: released ? 'Lock released successfully' : 'No lock found to release',
      });
    } catch (error) {
      console.error('Failed to release lock:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to release lock',
      });
    }
  });

  /**
   * Get implant lock status
   */
  router.get('/locks/:implantId', async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;

      if (!implantId) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const lock = collaborationService.getImplantLock(implantId);

      return res.json({
        success: true,
        data: {
          implantId,
          lock,
          isLocked: !!lock,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to get lock status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get lock status',
      });
    }
  });

  /**
   * Initiate session takeover (admin only)
   */
  router.post('/takeover', authMiddleware.authenticate(), async (req: Request, res: Response) => {
    try {
      const { targetOperatorId, reason, implantId } = req.body;
      const adminOperatorId = req.operator!.id;

      // Check if user is admin
      if (req.operator!.role !== OperatorRole.ADMINISTRATOR) {
        return res.status(403).json({
          success: false,
          error: 'Administrator role required',
        });
      }

      if (!targetOperatorId || !reason) {
        return res.status(400).json({
          success: false,
          error: 'Target operator ID and reason are required',
        });
      }

      const takeover = collaborationService.initiateSessionTakeover(
        adminOperatorId,
        targetOperatorId,
        reason,
        implantId
      );

      if (!takeover) {
        return res.status(400).json({
          success: false,
          error: 'Unable to initiate session takeover',
        });
      }

      return res.json({
        success: true,
        data: takeover,
        message: 'Session takeover initiated',
      });
    } catch (error) {
      console.error('Failed to initiate session takeover:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to initiate session takeover',
      });
    }
  });

  /**
   * Complete session takeover (admin only)
   */
  router.post(
    '/takeover/:takeoverId/complete',
    authMiddleware.authenticate(),
    async (req: Request, res: Response) => {
      try {
        const { takeoverId } = req.params;
        const adminOperatorId = req.operator!.id;

        // Check if user is admin
        if (req.operator!.role !== OperatorRole.ADMINISTRATOR) {
          return res.status(403).json({
            success: false,
            error: 'Administrator role required',
          });
        }

        if (!takeoverId) {
          return res.status(400).json({
            success: false,
            error: 'Takeover ID is required',
          });
        }

        const completed = collaborationService.completeSessionTakeover(takeoverId);

        if (!completed) {
          return res.status(404).json({
            success: false,
            error: 'Takeover not found or already completed',
          });
        }

        // Log takeover completion
        collaborationService.logActivity({
          operatorId: adminOperatorId,
          username: req.operator!.username,
          action: 'session_takeover_completed',
          resource: 'session_takeover',
          resourceId: takeoverId,
          timestamp: new Date(),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          success: true,
        });

        return res.json({
          success: true,
          message: 'Session takeover completed',
        });
      } catch (error) {
        console.error('Failed to complete session takeover:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to complete session takeover',
        });
      }
    }
  );

  /**
   * Get activity logs (admin only)
   */
  router.get('/activity', authMiddleware.authenticate(), async (req: Request, res: Response) => {
    try {
      // Check if user is admin
      if (req.operator!.role !== OperatorRole.ADMINISTRATOR) {
        return res.status(403).json({
          success: false,
          error: 'Administrator role required',
        });
      }

      const { operatorId, action, resource, startDate, endDate, limit = '100' } = req.query;

      const filters: any = {};
      if (operatorId) filters.operatorId = operatorId as string;
      if (action) filters.action = action as string;
      if (resource) filters.resource = resource as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      filters.limit = parseInt(limit as string);

      const logs = collaborationService.getActivityLogs(filters);

      return res.json({
        success: true,
        data: {
          logs,
          count: logs.length,
          filters,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to get activity logs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get activity logs',
      });
    }
  });

  return router;
}
