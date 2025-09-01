/**
 * Test App Helper
 * Creates Express app instance for testing
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { DatabaseConnection } from '../../src/core/database/connection';
import { AuthService } from '../../src/core/auth/auth.service';
import { AuthMiddleware } from '../../src/web/middleware/auth.middleware';
import { AuditMiddleware } from '../../src/web/middleware/audit.middleware';
import { AuditLogRepository } from '../../src/core/repositories/audit-log.repository';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { RBACService } from '../../src/core/services/rbac.service';
import { createAuditRoutes } from '../../src/web/routes/audit.routes';

export async function createTestApp(): Promise<Express> {
  const app = express();

  // Basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize database connection
  const db = DatabaseConnection.getInstance();
  await db.connect();

  // Initialize services and middleware
  const operatorRepository = new PostgresOperatorRepository();
  const authService = new AuthService(operatorRepository);
  const rbacService = new RBACService(operatorRepository);
  const authMiddleware = new AuthMiddleware(authService, rbacService);
  const auditMiddleware = new AuditMiddleware();

  // Apply audit middleware
  app.use(auditMiddleware.logRequest());
  app.use(auditMiddleware.logAuthentication());
  app.use(auditMiddleware.logCommandExecution());
  app.use(auditMiddleware.logFileOperations());

  // Initialize repositories
  const auditLogRepository = new AuditLogRepository();

  // Setup routes
  app.use('/api/audit', createAuditRoutes(authMiddleware, auditLogRepository));

  // Mock other routes for testing
  app.get('/api/implants', authMiddleware.authenticate(), (_req, res) => {
    res.json({ success: true, data: [] });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (username && password === 'password123') {
      res.json({
        success: true,
        token: 'mock-jwt-token',
        sessionId: 'mock-session-id',
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }
  });

  app.post('/commands/execute', authMiddleware.authenticate(), (_req, res) => {
    res.json({
      success: true,
      commandId: 'mock-command-id',
    });
  });

  app.post('/files/upload', authMiddleware.authenticate(), (_req, res) => {
    res.json({
      success: true,
      data: { checksum: 'mock-checksum' },
    });
  });

  // Error handling
  app.use((error: any, _req: any, res: any, _next: any) => {
    console.error('Test app error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  });

  return app;
}
