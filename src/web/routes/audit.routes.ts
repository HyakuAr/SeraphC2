/**
 * Enhanced Audit routes
 * Handles comprehensive audit log viewing, searching, and management endpoints
 */

import { Router, Request, Response } from 'express';
import { AuthMiddleware } from '../middleware/auth.middleware';
import { AuditLogRepository, AuditLogFilter } from '../../core/repositories/audit-log.repository';
import { AuditService } from '../../core/audit/audit.service';
import { ResourceType, Action } from '../../types/rbac';
const validator = require('express-validator');
const { body, query, validationResult } = validator;

export function createAuditRoutes(
  authMiddleware: AuthMiddleware,
  auditLogRepository: AuditLogRepository
): Router {
  const router = Router();
  const auditService = AuditService.getInstance();

  // Enhanced audit logs search with advanced filtering
  router.get(
    '/logs',
    [
      query('operatorId').optional().isUUID().withMessage('Invalid operator ID'),
      query('action').optional().isString().trim(),
      query('resourceType').optional().isString().trim(),
      query('resourceId').optional().isString().trim(),
      query('success').optional().isBoolean().withMessage('Success must be boolean'),
      query('startDate').optional().isISO8601().withMessage('Invalid start date'),
      query('endDate').optional().isISO8601().withMessage('Invalid end date'),
      query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be 1-1000'),
      query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be >= 0'),
      query('search').optional().isString().trim().withMessage('Search must be string'),
    ],
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.READ),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array(),
          });
        }

        const {
          operatorId,
          action,
          resourceType,
          success,
          startDate,
          endDate,
          limit = 100,
          offset = 0,
          search,
        } = req.query;

        const filter: AuditLogFilter = {
          limit: Math.min(parseInt(limit as string) || 100, 1000),
          offset: parseInt(offset as string) || 0,
        };

        if (operatorId) filter.operatorId = operatorId as string;
        if (action) filter.action = action as string;
        if (resourceType) filter.resourceType = resourceType as string;
        if (success !== undefined) filter.success = success === 'true';
        if (startDate) filter.startDate = new Date(startDate as string);
        if (endDate) filter.endDate = new Date(endDate as string);

        const result = await auditService.searchLogs(filter);

        // Log the audit log access
        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'view_audit_logs',
          resourceType: 'audit',
          details: {
            filter,
            searchTerm: search,
            resultCount: result.logs.length,
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          success: true,
        });

        return res.json({
          success: true,
          data: result.logs,
          pagination: {
            limit: filter.limit,
            offset: filter.offset,
            totalCount: result.totalCount,
            hasMore: result.hasMore,
          },
        });
      } catch (error) {
        console.error('Get audit logs error:', error);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'view_audit_logs',
          resourceType: 'audit',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to get audit logs',
        });
      }
    }
  );

  // Enhanced audit log statistics
  router.get(
    '/statistics',
    [
      query('startDate').optional().isISO8601().withMessage('Invalid start date'),
      query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    ],
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.READ),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array(),
          });
        }

        const { startDate, endDate } = req.query;

        const filter: AuditLogFilter = {};
        if (startDate) filter.startDate = new Date(startDate as string);
        if (endDate) filter.endDate = new Date(endDate as string);

        const statistics = await auditService.getStatistics(filter);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'view_audit_statistics',
          resourceType: 'audit',
          details: { filter, statistics: { totalLogs: statistics.totalLogs } },
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.json({
          success: true,
          data: statistics,
        });
      } catch (error) {
        console.error('Get audit statistics error:', error);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'view_audit_statistics',
          resourceType: 'audit',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to get audit statistics',
        });
      }
    }
  );

  // Generate compliance report
  router.post(
    '/reports/compliance',
    [
      body('startDate').isISO8601().withMessage('Invalid start date'),
      body('endDate').isISO8601().withMessage('Invalid end date'),
      body('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
    ],
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.READ),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array(),
          });
        }

        const { startDate, endDate, format = 'json' } = req.body;

        const report = await auditService.generateComplianceReport(
          new Date(startDate),
          new Date(endDate),
          format
        );

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'generate_compliance_report',
          resourceType: 'audit',
          details: {
            startDate,
            endDate,
            format,
            recordCount: typeof report === 'object' ? (report as any)['auditTrail']?.length : 'N/A',
          },
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="audit-report-${startDate}-${endDate}.csv"`
          );
          return res.send(report);
        } else {
          return res.json({
            success: true,
            data: report,
          });
        }
      } catch (error) {
        console.error('Generate compliance report error:', error);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'generate_compliance_report',
          resourceType: 'audit',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to generate compliance report',
        });
      }
    }
  );

  // Apply retention policy (admin only)
  router.post(
    '/retention/apply',
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.MANAGE),
    async (req: Request, res: Response) => {
      try {
        const deletedCount = await auditService.applyRetentionPolicy();

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'apply_retention_policy',
          resourceType: 'audit',
          details: { deletedCount },
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.json({
          success: true,
          message: `Applied retention policy: deleted ${deletedCount} old audit log entries`,
          deletedCount,
        });
      } catch (error) {
        console.error('Apply retention policy error:', error);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'apply_retention_policy',
          resourceType: 'audit',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to apply retention policy',
        });
      }
    }
  );

  // Update audit configuration (admin only)
  router.put(
    '/configuration',
    [
      body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
      body('retentionDays').optional().isInt({ min: 1 }).withMessage('Retention days must be >= 1'),
    ],
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.MANAGE),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array(),
          });
        }

        const { enabled, retentionDays } = req.body;
        const currentConfig = auditService.getConfiguration();

        if (enabled !== undefined) {
          auditService.setEnabled(enabled);
        }

        if (retentionDays !== undefined) {
          auditService.setRetentionPolicy(retentionDays);
        }

        const newConfig = auditService.getConfiguration();

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'update_audit_configuration',
          resourceType: 'audit',
          details: {
            previousConfig: currentConfig,
            newConfig,
            changes: { enabled, retentionDays },
          },
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.json({
          success: true,
          message: 'Audit configuration updated successfully',
          data: newConfig,
        });
      } catch (error) {
        console.error('Update audit configuration error:', error);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'update_audit_configuration',
          resourceType: 'audit',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to update audit configuration',
        });
      }
    }
  );

  // Get audit configuration
  router.get(
    '/configuration',
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.READ),
    async (req: Request, res: Response) => {
      try {
        const configuration = auditService.getConfiguration();

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'view_audit_configuration',
          resourceType: 'audit',
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.json({
          success: true,
          data: configuration,
        });
      } catch (error) {
        console.error('Get audit configuration error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get audit configuration',
        });
      }
    }
  );

  // Clean up old audit logs (admin only) - Enhanced version
  router.delete(
    '/cleanup',
    [body('olderThanDays').optional().isInt({ min: 1 }).withMessage('olderThanDays must be >= 1')],
    authMiddleware.requirePermission(ResourceType.AUDIT, Action.MANAGE),
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array(),
          });
        }

        const { olderThanDays = 90 } = req.body;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const deletedCount = await auditLogRepository.deleteOlderThan(cutoffDate);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'cleanup_audit_logs',
          resourceType: 'audit',
          details: { olderThanDays, deletedCount, cutoffDate: cutoffDate.toISOString() },
          success: true,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.json({
          success: true,
          message: `Deleted ${deletedCount} audit log entries older than ${olderThanDays} days`,
          deletedCount,
        });
      } catch (error) {
        console.error('Cleanup audit logs error:', error);

        await auditService.logEvent({
          operatorId: req.operatorId,
          action: 'cleanup_audit_logs',
          resourceType: 'audit',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        return res.status(500).json({
          success: false,
          error: 'Failed to cleanup audit logs',
        });
      }
    }
  );

  return router;
}
