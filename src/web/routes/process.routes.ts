/**
 * Process and Service Management Routes
 * Implements requirements 12.1, 12.2, 12.3, 12.5 from the SeraphC2 specification
 */

import { Router, Request, Response } from 'express';
import { ProcessService } from '../../core/services/process.service';
import { CommandManager } from '../../core/engine/command-manager';
import { CommandRouter } from '../../core/engine/command-router';
import { ImplantManager } from '../../core/engine/implant-manager';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { body, param, query } from 'express-validator';
import { Logger } from '../../utils/logger';

const router = Router();
const logger = Logger.getInstance();

// Initialize services (in a real app, these would be injected)
const commandRouter = new CommandRouter();
const implantManager = new ImplantManager();
const commandManager = new CommandManager(commandRouter, implantManager);
const processService = new ProcessService(commandManager);

// Validation schemas
const implantIdValidation = param('implantId').isUUID().withMessage('Invalid implant ID');
const processIdValidation = body('processId').isInt({ min: 1 }).withMessage('Invalid process ID');
const processNameValidation = body('processName')
  .isString()
  .isLength({ min: 1 })
  .withMessage('Invalid process name');
const serviceNameValidation = body('serviceName')
  .isString()
  .isLength({ min: 1 })
  .withMessage('Invalid service name');

/**
 * GET /api/implants/:implantId/processes
 * Get list of processes from an implant
 */
router.get(
  '/:implantId/processes',
  authMiddleware,
  implantIdValidation,
  query('name').optional().isString(),
  query('owner').optional().isString(),
  query('minCpuUsage').optional().isFloat({ min: 0 }),
  query('minMemoryUsage').optional().isInt({ min: 0 }),
  query('status').optional().isIn(['Running', 'Suspended', 'NotResponding']),
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const filter = {
        name: req.query.name as string,
        owner: req.query.owner as string,
        minCpuUsage: req.query.minCpuUsage
          ? parseFloat(req.query.minCpuUsage as string)
          : undefined,
        minMemoryUsage: req.query.minMemoryUsage
          ? parseInt(req.query.minMemoryUsage as string)
          : undefined,
        status: req.query.status as 'Running' | 'Suspended' | 'NotResponding',
      };

      // Remove undefined values
      Object.keys(filter).forEach(key => {
        if (filter[key as keyof typeof filter] === undefined) {
          delete filter[key as keyof typeof filter];
        }
      });

      const result = await processService.getProcessList(
        implantId,
        operatorId,
        Object.keys(filter).length > 0 ? filter : undefined
      );

      logger.info('Process list retrieved', {
        implantId,
        operatorId,
        processCount: result.totalCount,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to get process list', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to get process list',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/implants/:implantId/processes/kill
 * Kill a process on an implant
 */
router.post(
  '/:implantId/processes/kill',
  authMiddleware,
  implantIdValidation,
  body('processId').optional().isInt({ min: 1 }),
  body('processName').optional().isString().isLength({ min: 1 }),
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const { processId, processName } = req.body;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!processId && !processName) {
        return res.status(400).json({ error: 'Either processId or processName must be specified' });
      }

      const result = await processService.killProcess(
        implantId,
        operatorId,
        processId,
        processName
      );

      logger.info('Process kill operation completed', {
        implantId,
        operatorId,
        processId,
        processName,
        success: result.success,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to kill process', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to kill process',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/implants/:implantId/processes/suspend
 * Suspend a process on an implant
 */
router.post(
  '/:implantId/processes/suspend',
  authMiddleware,
  implantIdValidation,
  processIdValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const { processId } = req.body;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await processService.suspendProcess(implantId, operatorId, processId);

      logger.info('Process suspend operation completed', {
        implantId,
        operatorId,
        processId,
        success: result.success,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to suspend process', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to suspend process',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/implants/:implantId/processes/resume
 * Resume a process on an implant
 */
router.post(
  '/:implantId/processes/resume',
  authMiddleware,
  implantIdValidation,
  processIdValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const { processId } = req.body;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await processService.resumeProcess(implantId, operatorId, processId);

      logger.info('Process resume operation completed', {
        implantId,
        operatorId,
        processId,
        success: result.success,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to resume process', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to resume process',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/implants/:implantId/services
 * Get list of services from an implant
 */
router.get(
  '/:implantId/services',
  authMiddleware,
  implantIdValidation,
  query('name').optional().isString(),
  query('status').optional().isIn(['Running', 'Stopped', 'Paused']),
  query('startType').optional().isIn(['Automatic', 'Manual', 'Disabled']),
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const filter = {
        name: req.query.name as string,
        status: req.query.status as 'Running' | 'Stopped' | 'Paused',
        startType: req.query.startType as 'Automatic' | 'Manual' | 'Disabled',
      };

      // Remove undefined values
      Object.keys(filter).forEach(key => {
        if (filter[key as keyof typeof filter] === undefined) {
          delete filter[key as keyof typeof filter];
        }
      });

      const result = await processService.getServiceList(
        implantId,
        operatorId,
        Object.keys(filter).length > 0 ? filter : undefined
      );

      logger.info('Service list retrieved', {
        implantId,
        operatorId,
        serviceCount: result.totalCount,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to get service list', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to get service list',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/implants/:implantId/services/start
 * Start a service on an implant
 */
router.post(
  '/:implantId/services/start',
  authMiddleware,
  implantIdValidation,
  serviceNameValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const { serviceName } = req.body;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await processService.startService(implantId, operatorId, serviceName);

      logger.info('Service start operation completed', {
        implantId,
        operatorId,
        serviceName,
        success: result.success,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to start service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to start service',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/implants/:implantId/services/stop
 * Stop a service on an implant
 */
router.post(
  '/:implantId/services/stop',
  authMiddleware,
  implantIdValidation,
  serviceNameValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const { serviceName } = req.body;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await processService.stopService(implantId, operatorId, serviceName);

      logger.info('Service stop operation completed', {
        implantId,
        operatorId,
        serviceName,
        success: result.success,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to stop service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to stop service',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/implants/:implantId/services/restart
 * Restart a service on an implant
 */
router.post(
  '/:implantId/services/restart',
  authMiddleware,
  implantIdValidation,
  serviceNameValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const { serviceName } = req.body;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await processService.restartService(implantId, operatorId, serviceName);

      logger.info('Service restart operation completed', {
        implantId,
        operatorId,
        serviceName,
        success: result.success,
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to restart service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to restart service',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/implants/:implantId/system/resources
 * Get system resource information from an implant
 */
router.get(
  '/:implantId/system/resources',
  authMiddleware,
  implantIdValidation,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { implantId } = req.params;
      const operatorId = req.user?.id;

      if (!operatorId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const result = await processService.getSystemResources(implantId, operatorId);

      logger.info('System resources retrieved', {
        implantId,
        operatorId,
      });

      res.json(result);
    } catch (error) {
      logger.error('Failed to get system resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params.implantId,
        operatorId: req.user?.id,
      });

      res.status(500).json({
        error: 'Failed to get system resources',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
