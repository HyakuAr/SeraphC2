/**
 * Comprehensive REST API routes for SeraphC2
 */

import { Router, Request, Response } from 'express';
import { ApiAuthMiddleware, AuthenticatedRequest } from '../middleware/api-auth.middleware';
import { RateLimitMiddleware, rateLimiters } from '../middleware/rate-limit.middleware';
import { WebhookService } from '../../core/webhooks/webhook.service';
import { ExportService } from '../../core/export/export.service';
import { ApiKeyService } from '../../core/auth/api-key.service';

export interface ApiRoutesConfig {
  authMiddleware: ApiAuthMiddleware;
  rateLimitMiddleware: RateLimitMiddleware;
  webhookService: WebhookService;
  exportService: ExportService;
  apiKeyService: ApiKeyService;
}

export function createApiRoutes(config: ApiRoutesConfig): Router {
  const router = Router();
  const { authMiddleware, rateLimitMiddleware, webhookService, exportService, apiKeyService } =
    config;

  // Apply rate limiting to all API routes
  router.use(rateLimitMiddleware.create(rateLimiters.api));

  /**
   * @swagger
   * /api/info:
   *   get:
   *     summary: Get API information
   *     description: Returns basic information about the SeraphC2 API
   *     tags: [General]
   *     responses:
   *       200:
   *         description: API information
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/Success'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         name:
   *                           type: string
   *                           example: SeraphC2 API
   *                         version:
   *                           type: string
   *                           example: 1.0.0
   *                         description:
   *                           type: string
   *                         supportedFormats:
   *                           type: array
   *                           items:
   *                             type: string
   *                         supportedAuthMethods:
   *                           type: array
   *                           items:
   *                             type: string
   */
  router.get('/info', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'SeraphC2 API',
        version: '1.0.0',
        description: 'Comprehensive REST API for SeraphC2 Command and Control Framework',
        supportedFormats: ['json', 'xml', 'csv'],
        supportedAuthMethods: ['Bearer token', 'API key', 'Basic auth'],
        endpoints: {
          authentication: '/api/auth',
          implants: '/api/implants',
          commands: '/api/commands',
          files: '/api/files',
          tasks: '/api/tasks',
          modules: '/api/modules',
          webhooks: '/api/webhooks',
          exports: '/api/exports',
          apiKeys: '/api/api-keys',
        },
        documentation: '/api/docs',
      },
    });
  });

  // API Key Management Routes
  /**
   * @swagger
   * /api/api-keys:
   *   post:
   *     summary: Create new API key
   *     description: Generate a new API key for external integrations
   *     tags: [API Keys]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, permissions]
   *             properties:
   *               name:
   *                 type: string
   *                 description: Descriptive name for the API key
   *               permissions:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: List of permissions for this API key
   *               expiresAt:
   *                 type: string
   *                 format: date-time
   *                 description: Optional expiration date
   *     responses:
   *       201:
   *         description: API key created successfully
   *       400:
   *         description: Invalid request data
   *       401:
   *         description: Authentication required
   */
  router.post(
    '/api-keys',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['api-keys:create']),
    async (req, res) => {
      try {
        const { name, permissions, expiresAt } = req.body;

        if (!name || !permissions || !Array.isArray(permissions)) {
          return res.status(400).json({
            success: false,
            error: 'Name and permissions array are required',
            code: 'INVALID_REQUEST',
          });
        }

        const apiKey = await apiKeyService.generateApiKey({
          name,
          permissions,
          operatorId: (req as any).user.id,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });

        res.status(201).json({
          success: true,
          message: 'API key created successfully',
          data: apiKey,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'API_KEY_CREATION_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/api-keys:
   *   get:
   *     summary: List API keys
   *     description: Get list of API keys for the authenticated user
   *     tags: [API Keys]
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: List of API keys
   */
  router.get('/api-keys', authMiddleware.authenticate(), async (req, res) => {
    try {
      const apiKeys = await apiKeyService.listApiKeys((req as any).user.id);

      res.json({
        success: true,
        data: apiKeys,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'API_KEY_LIST_FAILED',
      });
    }
  });

  /**
   * @swagger
   * /api/api-keys/{keyId}:
   *   delete:
   *     summary: Revoke API key
   *     description: Revoke an existing API key
   *     tags: [API Keys]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: keyId
   *         required: true
   *         schema:
   *           type: string
   *         description: API key ID to revoke
   *     responses:
   *       200:
   *         description: API key revoked successfully
   *       404:
   *         description: API key not found
   */
  router.delete(
    '/api-keys/:keyId',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['api-keys:delete']),
    async (req, res) => {
      try {
        const { keyId } = req.params;
        const success = await apiKeyService.revokeApiKey(keyId, (req as any).user.id);

        if (!success) {
          return res.status(404).json({
            success: false,
            error: 'API key not found',
            code: 'API_KEY_NOT_FOUND',
          });
        }

        res.json({
          success: true,
          message: 'API key revoked successfully',
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'API_KEY_REVOCATION_FAILED',
        });
      }
    }
  );

  // Webhook Management Routes
  /**
   * @swagger
   * /api/webhooks:
   *   post:
   *     summary: Create webhook
   *     description: Create a new webhook for external integrations
   *     tags: [Webhooks]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/WebhookConfig'
   *     responses:
   *       201:
   *         description: Webhook created successfully
   */
  router.post(
    '/webhooks',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['webhooks:create']),
    async (req, res) => {
      try {
        const webhook = await webhookService.createWebhook(req.body);

        res.status(201).json({
          success: true,
          message: 'Webhook created successfully',
          data: webhook,
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message,
          code: 'WEBHOOK_CREATION_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/webhooks:
   *   get:
   *     summary: List webhooks
   *     description: Get list of all webhooks
   *     tags: [Webhooks]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     responses:
   *       200:
   *         description: List of webhooks
   */
  router.get(
    '/webhooks',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['webhooks:read']),
    async (req, res) => {
      try {
        const webhooks = await webhookService.listWebhooks();

        res.json({
          success: true,
          data: webhooks,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'WEBHOOK_LIST_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/webhooks/{webhookId}:
   *   get:
   *     summary: Get webhook
   *     description: Get webhook by ID
   *     tags: [Webhooks]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: webhookId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Webhook details
   *       404:
   *         description: Webhook not found
   */
  router.get(
    '/webhooks/:webhookId',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['webhooks:read']),
    async (req, res) => {
      try {
        const webhook = await webhookService.getWebhook(req.params.webhookId);

        if (!webhook) {
          return res.status(404).json({
            success: false,
            error: 'Webhook not found',
            code: 'WEBHOOK_NOT_FOUND',
          });
        }

        res.json({
          success: true,
          data: webhook,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'WEBHOOK_GET_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/webhooks/{webhookId}:
   *   put:
   *     summary: Update webhook
   *     description: Update webhook configuration
   *     tags: [Webhooks]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: webhookId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/WebhookConfig'
   *     responses:
   *       200:
   *         description: Webhook updated successfully
   *       404:
   *         description: Webhook not found
   */
  router.put(
    '/webhooks/:webhookId',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['webhooks:update']),
    async (req, res) => {
      try {
        const webhook = await webhookService.updateWebhook(req.params.webhookId, req.body);

        if (!webhook) {
          return res.status(404).json({
            success: false,
            error: 'Webhook not found',
            code: 'WEBHOOK_NOT_FOUND',
          });
        }

        res.json({
          success: true,
          message: 'Webhook updated successfully',
          data: webhook,
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message,
          code: 'WEBHOOK_UPDATE_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/webhooks/{webhookId}:
   *   delete:
   *     summary: Delete webhook
   *     description: Delete webhook configuration
   *     tags: [Webhooks]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: webhookId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Webhook deleted successfully
   *       404:
   *         description: Webhook not found
   */
  router.delete(
    '/webhooks/:webhookId',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['webhooks:delete']),
    async (req, res) => {
      try {
        const success = await webhookService.deleteWebhook(req.params.webhookId);

        if (!success) {
          return res.status(404).json({
            success: false,
            error: 'Webhook not found',
            code: 'WEBHOOK_NOT_FOUND',
          });
        }

        res.json({
          success: true,
          message: 'Webhook deleted successfully',
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'WEBHOOK_DELETE_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/webhooks/{webhookId}/deliveries:
   *   get:
   *     summary: Get webhook deliveries
   *     description: Get delivery history for a webhook
   *     tags: [Webhooks]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: webhookId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *     responses:
   *       200:
   *         description: Webhook delivery history
   */
  router.get(
    '/webhooks/:webhookId/deliveries',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['webhooks:read']),
    async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const deliveries = await webhookService.getWebhookDeliveries(req.params.webhookId, limit);

        res.json({
          success: true,
          data: deliveries,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'WEBHOOK_DELIVERIES_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/webhooks/events:
   *   get:
   *     summary: Get supported webhook events
   *     description: Get list of supported webhook events
   *     tags: [Webhooks]
   *     responses:
   *       200:
   *         description: List of supported events
   */
  router.get('/webhooks/events', (req, res) => {
    res.json({
      success: true,
      data: webhookService.getSupportedEvents(),
    });
  });

  // Data Export Routes
  /**
   * @swagger
   * /api/exports:
   *   post:
   *     summary: Start data export
   *     description: Start an asynchronous data export job
   *     tags: [Data Export]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [type, format]
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [implants, commands, operators, audit_logs, tasks, modules]
   *               format:
   *                 type: string
   *                 enum: [json, xml, csv]
   *               filters:
   *                 type: object
   *               fields:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       202:
   *         description: Export job started
   */
  router.post(
    '/exports',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['exports:create']),
    async (req, res) => {
      try {
        const jobId = await exportService.startExport({
          ...req.body,
          operatorId: (req as any).user.id,
        });

        res.status(202).json({
          success: true,
          message: 'Export job started',
          data: { jobId },
        });
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message,
          code: 'EXPORT_START_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/exports/sync:
   *   post:
   *     summary: Synchronous data export
   *     description: Export data synchronously (for small datasets)
   *     tags: [Data Export]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [type, format]
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [implants, commands, operators, audit_logs, tasks, modules]
   *               format:
   *                 type: string
   *                 enum: [json, xml, csv]
   *               filters:
   *                 type: object
   *               fields:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Exported data
   */
  router.post(
    '/exports/sync',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['exports:create']),
    rateLimitMiddleware.create(rateLimiters.sensitive),
    async (req, res) => {
      try {
        const result = await exportService.exportData({
          ...req.body,
          operatorId: (req as any).user.id,
        });

        // Set appropriate content type
        const contentTypes = {
          json: 'application/json',
          xml: 'application/xml',
          csv: 'text/csv',
        };

        res.setHeader('Content-Type', contentTypes[req.body.format as keyof typeof contentTypes]);
        res.setHeader('Content-Disposition', `attachment; filename="export.${req.body.format}"`);

        res.send(result.data);
      } catch (error: any) {
        res.status(400).json({
          success: false,
          error: error.message,
          code: 'EXPORT_SYNC_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/exports/{jobId}:
   *   get:
   *     summary: Get export job status
   *     description: Get status and details of an export job
   *     tags: [Data Export]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: jobId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Export job details
   *       404:
   *         description: Export job not found
   */
  router.get(
    '/exports/:jobId',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['exports:read']),
    async (req, res) => {
      try {
        const job = await exportService.getExportJob(req.params.jobId);

        if (!job) {
          return res.status(404).json({
            success: false,
            error: 'Export job not found',
            code: 'EXPORT_JOB_NOT_FOUND',
          });
        }

        res.json({
          success: true,
          data: job,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'EXPORT_JOB_GET_FAILED',
        });
      }
    }
  );

  /**
   * @swagger
   * /api/exports:
   *   get:
   *     summary: List export jobs
   *     description: Get list of export jobs for the authenticated user
   *     tags: [Data Export]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *     responses:
   *       200:
   *         description: List of export jobs
   */
  router.get(
    '/exports',
    authMiddleware.authenticate(),
    authMiddleware.requirePermissions(['exports:read']),
    async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const jobs = await exportService.listExportJobs((req as any).user.id, limit);

        res.json({
          success: true,
          data: jobs,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'EXPORT_JOBS_LIST_FAILED',
        });
      }
    }
  );

  return router;
}
