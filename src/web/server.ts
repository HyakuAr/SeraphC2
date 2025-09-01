/**
 * Express.js HTTP server for SeraphC2
 * Provides REST API endpoints and web interface
 */

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer, Server as HTTPServer } from 'http';
import { AuthService } from '../core/auth/auth.service';
import { AuthMiddleware } from '../core/auth/auth.middleware';
import { MfaService } from '../core/auth/mfa.service';
import { PostgresBackupCodesRepository } from '../core/repositories/backup-codes.repository';
import { OperatorRepository } from '../core/repositories/interfaces';
import { ImplantManager } from '../core/engine/implant-manager';
import { CommandManager } from '../core/engine/command-manager';
import { FileManager } from '../core/engine/file-manager';
import { TaskSchedulerService } from '../core/services/task-scheduler.service';
import { ModuleManagerService, ModuleManagerConfig } from '../core/services/module-manager.service';
import { createAuthRoutes } from './routes/auth.routes';
import { createMfaRoutes } from './routes/mfa.routes';
import { createHealthRoutes } from './routes/health.routes';
import { createImplantRoutes } from './routes/implant.routes';
import { createCommandRoutes } from './routes/command.routes';
import { createFileRoutes } from './routes/file.routes';
import { createTaskRoutes } from './routes/task.routes';
import processRoutes from './routes/process.routes';
import { createRemoteDesktopRoutes } from './routes/remote-desktop.routes';
import { createCollaborationRoutes } from './routes/collaboration.routes';
import modulesRoutes from './routes/modules.routes';
import { createApiRoutes } from './routes/api.routes';
import { createAuditRoutes } from './routes/audit.routes';
import { createIncidentRoutes } from './routes/incident.routes';
import { WebSocketService } from './websocket/websocket.service';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logging.middleware';
import { securityHeaders } from './middleware/security.middleware';
import { ApiAuthMiddleware } from './middleware/api-auth.middleware';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { AuditMiddleware } from './middleware/audit.middleware';
import { ApiKeyService } from '../core/auth/api-key.service';
import { WebhookService } from '../core/webhooks/webhook.service';
import { ExportService } from '../core/export/export.service';
import { AuditService } from '../core/audit/audit.service';
import { AuditSchedulerService } from '../core/audit/audit-scheduler.service';
import { AuditLogRepository } from '../core/repositories/audit-log.repository';
import { IncidentResponseService } from '../core/incident/incident-response.service';
import { KillSwitchService } from '../core/incident/kill-switch.service';
import { BackupService } from '../core/incident/backup.service';
import { CryptoService } from '../core/crypto/crypto.service';
import { DatabaseService } from '../core/database/database.service';
import { getPool } from '../core/database/connection';
import * as swaggerUi from 'swagger-ui-express';
import { swaggerSpec, swaggerOptions } from './swagger/swagger.config';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  enableRequestLogging: boolean;
  moduleConfig?: ModuleManagerConfig;
}

export class SeraphC2Server {
  private app: Application;
  private httpServer: HTTPServer;
  private authService: AuthService;
  private authMiddleware: AuthMiddleware;
  private mfaService: MfaService;
  private implantManager: ImplantManager;
  private commandManager: CommandManager;
  private fileManager: FileManager;
  private taskSchedulerService: TaskSchedulerService;
  private moduleManagerService: ModuleManagerService;
  private webSocketService?: WebSocketService;
  private apiAuthMiddleware: ApiAuthMiddleware;
  private rateLimitMiddleware: RateLimitMiddleware;
  private apiKeyService: ApiKeyService;
  private webhookService: WebhookService;
  private exportService: ExportService;
  private auditService: AuditService;
  private auditSchedulerService: AuditSchedulerService;
  private auditMiddleware: AuditMiddleware;
  private auditLogRepository: AuditLogRepository;
  private incidentResponseService: IncidentResponseService;
  private killSwitchService: KillSwitchService;
  private backupService: BackupService;
  private cryptoService: CryptoService;
  private databaseService: DatabaseService;

  constructor(
    private config: ServerConfig,
    private operatorRepository: OperatorRepository
  ) {
    this.app = express();
    this.httpServer = createServer(this.app);

    // Initialize MFA service
    const backupCodesRepository = new PostgresBackupCodesRepository(getPool());
    this.mfaService = new MfaService(this.operatorRepository, backupCodesRepository);

    // Initialize auth service with MFA support
    this.authService = new AuthService(this.operatorRepository, this.mfaService);
    this.authMiddleware = new AuthMiddleware(this.authService);
    this.implantManager = new ImplantManager();
    this.commandManager = new CommandManager(
      // We'll need to create a command router - for now using placeholder
      {} as any,
      this.implantManager
    );
    this.fileManager = new FileManager(this.implantManager, this.commandManager);
    this.taskSchedulerService = new TaskSchedulerService(getPool(), this.commandManager, {
      maxConcurrentTasks: 10,
      taskTimeoutMs: 300000, // 5 minutes
      cleanupIntervalMs: 3600000, // 1 hour
      maxExecutionHistoryDays: 30,
      enableEventTriggers: true,
      enableConditionalTriggers: true,
      conditionalCheckIntervalMs: 60000, // 1 minute
    });

    // Initialize module manager service
    const defaultModuleConfig: ModuleManagerConfig = {
      moduleStoragePath: path.join(process.cwd(), 'modules'),
      enableBuiltinModules: true,
      autoLoadBuiltinModules: true,
      moduleLoaderConfig: {
        moduleDirectory: path.join(process.cwd(), 'modules'),
        sandboxDirectory: path.join(process.cwd(), 'sandbox'),
        trustedPublicKeys: ['builtin-key'], // In production, use real trusted keys
        defaultSandboxConfig: {
          enabled: true,
          isolateNetwork: true,
          isolateFileSystem: true,
          isolateRegistry: true,
          isolateProcesses: true,
          resourceLimits: {
            maxMemory: 512 * 1024 * 1024, // 512MB
            maxExecutionTime: 600000, // 10 minutes
          },
          timeoutMs: 600000, // 10 minutes
        },
        maxConcurrentExecutions: 5,
        executionTimeoutMs: 600000, // 10 minutes
        signatureVerificationRequired: false, // Set to true in production
        allowUnsignedModules: true, // Set to false in production
        moduleCleanupIntervalMs: 300000, // 5 minutes
      },
    };

    this.moduleManagerService = new ModuleManagerService(
      this.config.moduleConfig || defaultModuleConfig
    );

    // Initialize API services
    this.apiKeyService = new ApiKeyService(getPool());
    this.webhookService = new WebhookService(getPool());
    this.exportService = new ExportService(getPool());
    this.apiAuthMiddleware = new ApiAuthMiddleware(this.authService, this.apiKeyService);
    this.rateLimitMiddleware = new RateLimitMiddleware();

    // Initialize audit services
    this.auditLogRepository = new AuditLogRepository();
    this.auditService = AuditService.getInstance();
    this.auditSchedulerService = AuditSchedulerService.getInstance();
    this.auditMiddleware = new AuditMiddleware();

    // Initialize incident response services
    this.databaseService = new DatabaseService(getPool());
    this.cryptoService = new CryptoService({
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 100000,
    });

    const backupConfig = {
      backupDirectory: path.join(process.cwd(), 'backups'),
      retentionDays: 30,
      compressionLevel: 6,
      encryptionEnabled: true,
      maxBackupSize: 1024 * 1024 * 1024, // 1GB
      scheduledBackupInterval: 24 * 60 * 60 * 1000, // 24 hours
    };

    const killSwitchConfig = {
      defaultTimeout: 300000, // 5 minutes
      checkInterval: 30000, // 30 seconds
      maxMissedHeartbeats: 3,
      gracePeriod: 5000, // 5 seconds
    };

    const incidentConfig = {
      emergencyShutdownTimeout: 30000,
      selfDestructTimeout: 10000,
      backupRetentionDays: 30,
      secureWipeIterations: 3,
      emergencyContactEndpoints: process.env.EMERGENCY_CONTACTS?.split(',') || [],
    };

    this.backupService = new BackupService(backupConfig, this.databaseService, this.cryptoService);
    this.killSwitchService = new KillSwitchService(
      killSwitchConfig,
      this.implantManager,
      this.databaseService
    );
    this.incidentResponseService = new IncidentResponseService(
      incidentConfig,
      this.implantManager,
      this.databaseService,
      this.cryptoService,
      this.backupService,
      this.killSwitchService
    );

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware
   */
  private setupMiddleware(): void {
    // Security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      })
    );

    // CORS configuration
    this.app.use(
      cors({
        origin: this.config.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom security headers
    this.app.use(securityHeaders());

    // Request logging
    if (this.config.enableRequestLogging) {
      this.app.use(requestLogger());
    }

    // Audit middleware for comprehensive logging
    this.app.use(this.auditMiddleware.logRequest());
    this.app.use(this.auditMiddleware.logAuthentication());
    this.app.use(this.auditMiddleware.logCommandExecution());
    this.app.use(this.auditMiddleware.logFileOperations());

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  /**
   * Setup API routes and web client serving
   */
  private setupRoutes(): void {
    // Health check routes (no authentication required)
    this.app.use('/api/health', createHealthRoutes());

    // Authentication routes
    this.app.use('/api/auth', createAuthRoutes(this.authService, this.authMiddleware));

    // Multi-Factor Authentication routes
    this.app.use('/api/mfa', createMfaRoutes(this.mfaService, this.authMiddleware));

    // Implant management routes
    this.app.use(
      '/api/implants',
      createImplantRoutes({
        implantManager: this.implantManager,
        authMiddleware: this.authMiddleware,
      })
    );

    // Command execution routes
    this.app.use(
      '/api/commands',
      createCommandRoutes({
        commandManager: this.commandManager,
        authMiddleware: this.authMiddleware,
      })
    );

    // File operations routes
    this.app.use(
      '/api/files',
      createFileRoutes({
        fileManager: this.fileManager,
        authMiddleware: this.authMiddleware,
      })
    );

    // Process and service management routes
    this.app.use('/api/implants', processRoutes);

    // Remote desktop interaction routes
    this.app.use('/api/remote-desktop', createRemoteDesktopRoutes(this.commandManager));

    // Task scheduler routes
    this.app.use('/api/tasks', createTaskRoutes(this.taskSchedulerService, this.authMiddleware));

    // Module management routes
    this.app.locals.moduleManager = this.moduleManagerService;
    this.app.use('/api/modules', modulesRoutes);

    // Collaboration routes
    this.app.use(
      '/api/collaboration',
      createCollaborationRoutes({
        collaborationService: this.webSocketService?.getCollaborationService()!,
        authMiddleware: this.authMiddleware,
      })
    );

    // Audit routes
    this.app.use('/api/audit', createAuditRoutes(this.authMiddleware, this.auditLogRepository));

    // Incident response routes
    this.app.use(
      '/api/incident',
      createIncidentRoutes(this.incidentResponseService, this.killSwitchService, this.backupService)
    );

    // Comprehensive API routes
    this.app.use(
      '/api',
      createApiRoutes({
        authMiddleware: this.apiAuthMiddleware,
        rateLimitMiddleware: this.rateLimitMiddleware,
        webhookService: this.webhookService,
        exportService: this.exportService,
        apiKeyService: this.apiKeyService,
      })
    );

    // API documentation
    this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));

    // API root endpoint
    this.app.get('/api', (_req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'SeraphC2 API Server',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        documentation: '/api/docs',
      });
    });

    // Catch-all for undefined API routes
    this.app.use('/api/*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        path: req.originalUrl || req.path,
      });
    });

    // Serve static files from the React app build directory
    const webClientPath = path.join(__dirname, '../../web-client/build');
    this.app.use(express.static(webClientPath));

    // Catch all handler: send back React's index.html file for client-side routing
    this.app.get('*', (req: Request, res: Response) => {
      // Skip API routes (already handled above)
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({
          success: false,
          error: 'API endpoint not found',
          path: req.path,
        });
      }

      // Serve React app for all other routes
      return res.sendFile(path.join(webClientPath, 'index.html'));
    });
  }

  /**
   * Setup WebSocket service
   */
  private setupWebSocket(): void {
    this.webSocketService = new WebSocketService(
      this.httpServer,
      {
        corsOrigins: this.config.corsOrigins,
      },
      this.implantManager,
      this.authService
    );
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(errorHandler());
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer.listen(this.config.port, this.config.host, async () => {
          console.log(
            `🌐 SeraphC2 HTTP Server listening on ${this.config.host}:${this.config.port}`
          );
          console.log(`📡 API available at http://${this.config.host}:${this.config.port}/api`);
          console.log(
            `❤️  Health check at http://${this.config.host}:${this.config.port}/api/health`
          );
          console.log(
            `🔌 WebSocket available at ws://${this.config.host}:${this.config.port}/socket.io/`
          );

          // Start the task scheduler
          try {
            await this.taskSchedulerService.start();
            console.log('⏰ Task Scheduler started successfully');
          } catch (error) {
            console.error('❌ Failed to start Task Scheduler:', error);
          }

          // Start the audit scheduler
          try {
            this.auditSchedulerService.start();
            console.log('📋 Audit Scheduler started successfully');
          } catch (error) {
            console.error('❌ Failed to start Audit Scheduler:', error);
          }

          // Start the kill switch service
          try {
            this.killSwitchService.start();
            console.log('🔪 Kill Switch Service started successfully');
          } catch (error) {
            console.error('❌ Failed to start Kill Switch Service:', error);
          }

          resolve();
        });

        this.httpServer.on('error', (error: Error) => {
          console.error('❌ Failed to start HTTP server:', error);
          reject(error);
        });

        // Graceful shutdown
        const shutdown = () => {
          console.log('🛑 Shutting down gracefully...');

          // Close WebSocket service
          if (this.webSocketService) {
            this.webSocketService.close();
          }

          // Stop managers
          this.implantManager.stop();
          this.commandManager.stop();
          this.fileManager.stop();

          // Stop task scheduler
          try {
            await this.taskSchedulerService.stop();
            console.log('⏰ Task Scheduler stopped');
          } catch (error) {
            console.error('❌ Error stopping Task Scheduler:', error);
          }

          // Stop audit scheduler
          try {
            this.auditSchedulerService.stop();
            console.log('📋 Audit Scheduler stopped');
          } catch (error) {
            console.error('❌ Error stopping Audit Scheduler:', error);
          }

          // Stop kill switch service
          try {
            this.killSwitchService.stop();
            console.log('🔪 Kill Switch Service stopped');
          } catch (error) {
            console.error('❌ Error stopping Kill Switch Service:', error);
          }

          // Stop module manager
          this.moduleManagerService.stop();
          console.log('🧩 Module Manager stopped');

          // Cleanup rate limiter
          this.rateLimitMiddleware.destroy();
          console.log('⏱️  Rate limiter cleaned up');

          // Close HTTP server
          this.httpServer.close(() => {
            console.log('✅ SeraphC2 server closed');
            process.exit(0);
          });
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get Express application instance
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Get authentication service instance
   */
  getAuthService(): AuthService {
    return this.authService;
  }

  /**
   * Get authentication middleware instance
   */
  getAuthMiddleware(): AuthMiddleware {
    return this.authMiddleware;
  }

  /**
   * Get implant manager instance
   */
  getImplantManager(): ImplantManager {
    return this.implantManager;
  }

  /**
   * Get WebSocket service instance
   */
  getWebSocketService(): WebSocketService | undefined {
    return this.webSocketService;
  }

  /**
   * Get command manager instance
   */
  getCommandManager(): CommandManager {
    return this.commandManager;
  }

  /**
   * Get file manager instance
   */
  getFileManager(): FileManager {
    return this.fileManager;
  }

  /**
   * Get task scheduler service instance
   */
  getTaskSchedulerService(): TaskSchedulerService {
    return this.taskSchedulerService;
  }

  /**
   * Get module manager service instance
   */
  getModuleManagerService(): ModuleManagerService {
    return this.moduleManagerService;
  }
}
