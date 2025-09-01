/**
 * Enhanced Health check and status routes for SeraphC2 API
 * Provides comprehensive system status and monitoring endpoints
 */

import { Router, Request, Response } from 'express';
import { DatabaseConnection } from '../../core/database/connection';
import { log } from '../../utils/logger';
import { systemDiagnostics } from '../../utils/diagnostics';

export function createHealthRoutes(): Router {
  const router = Router();

  /**
   * GET /api/health
   * Basic health check endpoint
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        service: 'SeraphC2',
        checks: {
          server: 'healthy',
          database: 'unknown',
          memory: 'healthy',
        },
      };

      // Check database connectivity
      try {
        const db = DatabaseConnection.getInstance();
        await db.query('SELECT 1');
        healthStatus.checks.database = 'healthy';
      } catch (error) {
        healthStatus.checks.database = 'unhealthy';
        healthStatus.status = 'degraded';
      }

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      };

      // Consider memory unhealthy if heap usage is over 500MB
      if (memoryUsageMB.heapUsed > 500) {
        healthStatus.checks.memory = 'warning';
        if (healthStatus.status === 'healthy') {
          healthStatus.status = 'degraded';
        }
      }

      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        success: healthStatus.status === 'healthy',
        data: healthStatus,
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
        },
      });
    }
  });

  /**
   * GET /api/health/detailed
   * Detailed system status information
   */
  router.get('/detailed', async (_req: Request, res: Response) => {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const detailedStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        service: 'SeraphC2',
        system: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          pid: process.pid,
        },
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        checks: {
          server: 'healthy',
          database: 'unknown',
          memory: 'healthy',
          disk: 'healthy',
        },
      };

      // Check database connectivity with more details
      try {
        const db = DatabaseConnection.getInstance();
        const startTime = Date.now();
        await db.query('SELECT version(), current_database(), current_user');
        const responseTime = Date.now() - startTime;

        detailedStatus.checks.database = 'healthy';
        (detailedStatus as any).database = {
          status: 'connected',
          responseTime: `${responseTime}ms`,
        };
      } catch (error) {
        detailedStatus.checks.database = 'unhealthy';
        detailedStatus.status = 'degraded';
        (detailedStatus as any).database = {
          status: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }

      // Memory health assessment
      if (detailedStatus.memory.heapUsed > 500) {
        detailedStatus.checks.memory = 'warning';
        if (detailedStatus.status === 'healthy') {
          detailedStatus.status = 'degraded';
        }
      }

      const statusCode = detailedStatus.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        success: detailedStatus.status === 'healthy',
        data: detailedStatus,
      });
    } catch (error) {
      console.error('Detailed health check error:', error);
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Detailed health check failed',
        },
      });
    }
  });

  /**
   * GET /api/health/ready
   * Readiness probe for container orchestration
   */
  router.get('/ready', async (_req: Request, res: Response) => {
    try {
      // Check if all critical services are ready
      let isReady = true;
      const checks: Record<string, boolean> = {};

      // Database readiness check
      try {
        const db = DatabaseConnection.getInstance();
        await db.query('SELECT 1');
        checks['database'] = true;
      } catch (error) {
        checks['database'] = false;
        isReady = false;
      }

      // Add more readiness checks here as needed
      checks['server'] = true;

      const statusCode = isReady ? 200 : 503;

      res.status(statusCode).json({
        success: isReady,
        data: {
          ready: isReady,
          timestamp: new Date().toISOString(),
          checks,
        },
      });
    } catch (error) {
      console.error('Readiness check error:', error);
      res.status(503).json({
        success: false,
        data: {
          ready: false,
          timestamp: new Date().toISOString(),
          error: 'Readiness check failed',
        },
      });
    }
  });

  /**
   * GET /api/health/live
   * Liveness probe for container orchestration
   */
  router.get('/live', (_req: Request, res: Response) => {
    // Simple liveness check - if we can respond, we're alive
    res.json({
      success: true,
      data: {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  });

  /**
   * GET /api/health/metrics
   * System metrics endpoint for monitoring
   */
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const metrics = await systemDiagnostics.getSystemMetrics();

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      log.error('Failed to get system metrics', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system metrics',
      });
    }
  });

  /**
   * GET /api/health/diagnostics
   * Comprehensive system diagnostics
   */
  router.get('/diagnostics', async (_req: Request, res: Response) => {
    try {
      const diagnostics = await systemDiagnostics.getComprehensiveDiagnostics();

      res.json({
        success: true,
        data: diagnostics,
      });
    } catch (error) {
      log.error('Failed to get system diagnostics', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system diagnostics',
      });
    }
  });

  /**
   * GET /api/health/dependencies
   * Check status of external dependencies
   */
  router.get('/dependencies', async (_req: Request, res: Response) => {
    try {
      const dependencies = await systemDiagnostics.checkDependencies();
      const allHealthy = Object.values(dependencies).every(dep => dep.status === 'healthy');

      res.status(allHealthy ? 200 : 503).json({
        success: allHealthy,
        data: dependencies,
      });
    } catch (error) {
      log.error('Failed to check dependencies', error as Error);
      res.status(503).json({
        success: false,
        error: 'Failed to check dependencies',
      });
    }
  });

  /**
   * POST /api/health/test
   * Test endpoint for health check validation
   */
  router.post('/test', async (req: Request, res: Response) => {
    try {
      const { component } = req.body;

      if (!component) {
        return res.status(400).json({
          success: false,
          error: 'Component parameter required',
        });
      }

      const testResult = await systemDiagnostics.testComponent(component);

      res.json({
        success: testResult.success,
        data: testResult,
      });
    } catch (error) {
      log.error('Health test failed', error as Error);
      res.status(500).json({
        success: false,
        error: 'Health test failed',
      });
    }
  });

  return router;
}
