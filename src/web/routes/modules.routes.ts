/**
 * Module management routes for SeraphC2
 * Implements module management interface endpoints
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ModuleManagerService } from '../../core/services/module-manager.service';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { rbacMiddleware } from '../../core/auth/rbac.middleware';
import {
  ModuleCategory,
  ModuleStatus,
  ModuleListFilter,
  ModuleExecutionFilter,
} from '../../types/modules';
import { Logger } from '../../utils/logger';

const router = Router();
const logger = Logger.getInstance();

// Configure multer for module uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Allow executable files and archives
    const allowedTypes = [
      'application/octet-stream',
      'application/x-msdownload',
      'application/x-executable',
      'application/zip',
      'application/x-zip-compressed',
    ];

    if (
      allowedTypes.includes(file.mimetype) ||
      file.originalname.endsWith('.exe') ||
      file.originalname.endsWith('.dll')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only executable files are allowed.'));
    }
  },
});

// Create auth middleware instance
const authMiddleware = new AuthMiddleware({} as any).authenticate();

// Simple validation helpers
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

// Middleware to get module manager service
const getModuleManager = (req: Request): ModuleManagerService => {
  return (req as any).app.locals.moduleManager;
};

/**
 * GET /api/modules
 * List available modules with optional filtering
 */
router.get(
  '/',
  authMiddleware,
  rbacMiddleware(['modules:read']),
  async (req: Request, res: Response) => {
    try {
      const moduleManager = getModuleManager(req);

      const filter: ModuleListFilter = {};
      if (req.query['category']) filter.category = req.query['category'] as ModuleCategory;
      if (req.query['status']) filter.status = req.query['status'] as ModuleStatus;
      if (req.query['author']) filter.author = req.query['author'] as string;
      if (req.query['tags']) filter.tags = (req.query['tags'] as string).split(',');
      if (req.query['namePattern']) filter.namePattern = req.query['namePattern'] as string;
      if (req.query['loadedOnly']) filter.loadedOnly = req.query['loadedOnly'] === 'true';
      if (req.query['implantId']) filter.implantId = req.query['implantId'] as string;

      const modules = moduleManager.listModules(filter);

      logger.info('Modules listed', {
        operatorId: (req as any).user.id,
        count: modules.length,
        filter,
      });

      return res.json({
        modules,
        count: modules.length,
      });
    } catch (error) {
      logger.error('Failed to list modules', {
        operatorId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to list modules' });
    }
  }
);

/**
 * GET /api/modules/categories
 * Get available module categories
 */
router.get(
  '/categories',
  authMiddleware,
  rbacMiddleware(['modules:read']),
  async (req: Request, res: Response) => {
    try {
      const moduleManager = getModuleManager(req);
      const categories = moduleManager.getModuleCategories();

      return res.json({ categories });
    } catch (error) {
      logger.error('Failed to get module categories', {
        operatorId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to get module categories' });
    }
  }
);

/**
 * GET /api/modules/search
 * Search modules by query
 */
router.get(
  '/search',
  authMiddleware,
  rbacMiddleware(['modules:read']),
  async (req: Request, res: Response) => {
    try {
      const query = req.query['q'] as string;
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      const moduleManager = getModuleManager(req);
      const modules = moduleManager.searchModules(query);

      logger.info('Modules searched', {
        operatorId: (req as any).user.id,
        query,
        results: modules.length,
      });

      return res.json({
        modules,
        count: modules.length,
        query,
      });
    } catch (error) {
      logger.error('Failed to search modules', {
        operatorId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to search modules' });
    }
  }
);

/**
 * GET /api/modules/:moduleId
 * Get module details by ID
 */
router.get(
  '/:moduleId',
  authMiddleware,
  rbacMiddleware(['modules:read']),
  async (req: Request, res: Response) => {
    try {
      const moduleManager = getModuleManager(req);
      const moduleId = req.params['moduleId'];
      if (!moduleId) {
        return res.status(400).json({ error: 'Module ID is required' });
      }

      const module = moduleManager.getModule(moduleId);

      if (!module) {
        return res.status(404).json({ error: 'Module not found' });
      }

      // Don't include binary data in response
      const { binary, ...moduleData } = module;

      return res.json({ module: moduleData });
    } catch (error) {
      logger.error('Failed to get module', {
        operatorId: (req as any).user?.id,
        moduleId: req.params['moduleId'],
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to get module' });
    }
  }
);

/**
 * POST /api/modules/:moduleId/load
 * Load a module on an implant
 */
router.post(
  '/:moduleId/load',
  authMiddleware,
  rbacMiddleware(['modules:execute']),
  async (req: Request, res: Response) => {
    try {
      const moduleManager = getModuleManager(req);
      const { implantId, verifySignature, sandboxed, resourceLimits } = req.body;

      const moduleId = req.params['moduleId'];
      if (!moduleId) {
        return res.status(400).json({ error: 'Module ID is required' });
      }

      const loadRequest = {
        moduleId,
        implantId,
        operatorId: (req as any).user.id,
        verifySignature,
        sandboxed,
        resourceLimits,
      };

      const module = await moduleManager.loadModule(loadRequest);

      logger.info('Module loaded', {
        operatorId: (req as any).user.id,
        moduleId,
        implantId,
        moduleName: module.metadata.name,
      });

      // Don't include binary data in response
      const { binary, ...moduleData } = module;

      return res.json({
        success: true,
        module: moduleData,
        message: 'Module loaded successfully',
      });
    } catch (error) {
      logger.error('Failed to load module', {
        operatorId: (req as any).user?.id,
        moduleId: req.params['moduleId'],
        implantId: req.body.implantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to load module' });
    }
  }
);

/**
 * POST /api/modules/:moduleId/execute
 * Execute a module capability
 */
router.post(
  '/:moduleId/execute',
  authMiddleware,
  rbacMiddleware(['modules:execute']),
  async (req: Request, res: Response) => {
    try {
      const moduleManager = getModuleManager(req);
      const { implantId, capability, parameters, timeout, resourceLimits } = req.body;

      const moduleId = req.params['moduleId'];
      if (!moduleId) {
        return res.status(400).json({ error: 'Module ID is required' });
      }

      const executeRequest = {
        moduleId,
        implantId,
        operatorId: (req as any).user.id,
        capability,
        parameters,
        timeout,
        resourceLimits,
      };

      const execution = await moduleManager.executeModule(executeRequest);

      logger.info('Module executed', {
        operatorId: (req as any).user.id,
        moduleId,
        implantId,
        capability,
        executionId: execution.id,
        success: execution.result?.success,
      });

      return res.json({
        success: true,
        execution,
        message: 'Module executed successfully',
      });
    } catch (error) {
      logger.error('Failed to execute module', {
        operatorId: (req as any).user?.id,
        moduleId: req.params['moduleId'],
        implantId: req.body.implantId,
        capability: req.body.capability,
        error: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to execute module' });
    }
  }
);

/**
 * POST /api/modules/:moduleId/unload
 * Unload a module from an implant
 */
router.post(
  '/:moduleId/unload',
  authMiddleware,
  rbacMiddleware(['modules:execute']),
  async (req: Request, res: Response) => {
    try {
      const moduleManager = getModuleManager(req);
      const { implantId, force } = req.body;

      const moduleId = req.params['moduleId'];
      if (!moduleId) {
        return res.status(400).json({ error: 'Module ID is required' });
      }

      const unloadRequest = {
        moduleId,
        implantId,
        operatorId: (req as any).user.id,
        force,
      };

      const success = await moduleManager.unloadModule(unloadRequest);

      if (!success) {
        return res.status(404).json({ error: 'Module not loaded or unload failed' });
      }

      logger.info('Module unloaded', {
        operatorId: (req as any).user.id,
        moduleId,
        implantId,
        force,
      });

      return res.json({
        success: true,
        message: 'Module unloaded successfully',
      });
    } catch (error) {
      logger.error('Failed to unload module', {
        operatorId: (req as any).user?.id,
        moduleId: req.params['moduleId'],
        implantId: req.body.implantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to unload module' });
    }
  }
);

/**
 * GET /api/modules/loaded/:implantId
 * Get loaded modules for an implant
 */
router.get(
  '/loaded/:implantId',
  authMiddleware,
  rbacMiddleware(['modules:read']),
  validateImplantId,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const moduleManager = getModuleManager(req);
      const implantId = req.params['implantId'];
      if (!implantId) {
        return res.status(400).json({ error: 'Implant ID is required' });
      }

      const modules = moduleManager.getLoadedModules(implantId);

      // Don't include binary data in response
      const modulesData = modules.map(({ binary, ...module }) => module);

      return res.json({
        modules: modulesData,
        count: modules.length,
        implantId,
      });
    } catch (error) {
      logger.error('Failed to get loaded modules', {
        operatorId: (req as any).user?.id,
        implantId: req.params['implantId'],
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to get loaded modules' });
    }
  }
);

/**
 * GET /api/modules/executions
 * Get module executions with optional filtering
 */
router.get(
  '/executions',
  authMiddleware,
  rbacMiddleware(['modules:read']),
  [
    query('moduleId').optional().isUUID().withMessage('Invalid module ID'),
    query('implantId').optional().isUUID().withMessage('Invalid implant ID'),
    query('operatorId').optional().isUUID().withMessage('Invalid operator ID'),
    query('status').optional().isIn(Object.values(ModuleStatus)).withMessage('Invalid status'),
    query('capability').optional().isString().withMessage('Capability must be string'),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const moduleManager = getModuleManager(req);

      const filter: ModuleExecutionFilter = {};
      if (req.query['moduleId']) filter.moduleId = req.query['moduleId'] as string;
      if (req.query['implantId']) filter.implantId = req.query['implantId'] as string;
      if (req.query['operatorId']) filter.operatorId = req.query['operatorId'] as string;
      if (req.query['status']) filter.status = req.query['status'] as ModuleStatus;
      if (req.query['capability']) filter.capability = req.query['capability'] as string;
      if (req.query['startDate']) filter.startDate = new Date(req.query['startDate'] as string);
      if (req.query['endDate']) filter.endDate = new Date(req.query['endDate'] as string);

      const executions = moduleManager.getModuleExecutions(filter);

      return res.json({
        executions,
        count: executions.length,
      });
    } catch (error) {
      logger.error('Failed to get module executions', {
        operatorId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to get module executions' });
    }
  }
);

/**
 * POST /api/modules/executions/:executionId/stop
 * Stop a running module execution
 */
router.post(
  '/executions/:executionId/stop',
  authMiddleware,
  rbacMiddleware(['modules:execute']),
  validateExecutionId,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const moduleManager = getModuleManager(req);
      const executionId = req.params['executionId'];
      if (!executionId) {
        return res.status(400).json({ error: 'Execution ID is required' });
      }

      const success = await moduleManager.stopExecution(executionId);

      if (!success) {
        return res.status(404).json({ error: 'Execution not found or not running' });
      }

      logger.info('Module execution stopped', {
        operatorId: (req as any).user.id,
        executionId,
      });

      return res.json({
        success: true,
        message: 'Execution stopped successfully',
      });
    } catch (error) {
      logger.error('Failed to stop module execution', {
        operatorId: (req as any).user?.id,
        executionId: req.params['executionId'],
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to stop execution' });
    }
  }
);

/**
 * POST /api/modules/install
 * Install a new module
 */
router.post(
  '/install',
  authMiddleware,
  rbacMiddleware(['modules:admin']),
  upload.single('module'),
  [body('metadata').notEmpty().withMessage('Module metadata is required')],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'Module file is required' });
      }

      const moduleManager = getModuleManager(req);
      const metadata = JSON.parse(req.body.metadata);
      const signature = req.body.signature ? JSON.parse(req.body.signature) : undefined;

      const module = await moduleManager.installModule(req.file.buffer, metadata, signature);

      logger.info('Module installed', {
        operatorId: (req as any).user.id,
        moduleId: module.id,
        moduleName: module.metadata.name,
        size: req.file.size,
      });

      // Don't include binary data in response
      const { binary, ...moduleData } = module;

      return res.json({
        success: true,
        module: moduleData,
        message: 'Module installed successfully',
      });
    } catch (error) {
      logger.error('Failed to install module', {
        operatorId: (req as any).user?.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to install module' });
    }
  }
);

/**
 * DELETE /api/modules/:moduleId
 * Uninstall a module
 */
router.delete(
  '/:moduleId',
  authMiddleware,
  rbacMiddleware(['modules:admin']),
  validateModuleId,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const moduleManager = getModuleManager(req);
      const moduleId = req.params['moduleId'];
      if (!moduleId) {
        return res.status(400).json({ error: 'Module ID is required' });
      }

      const success = await moduleManager.uninstallModule(moduleId);

      if (!success) {
        return res.status(404).json({ error: 'Module not found' });
      }

      logger.info('Module uninstalled', {
        operatorId: (req as any).user.id,
        moduleId,
      });

      return res.json({
        success: true,
        message: 'Module uninstalled successfully',
      });
    } catch (error) {
      logger.error('Failed to uninstall module', {
        operatorId: (req as any).user?.id,
        moduleId: req.params['moduleId'],
        error: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Failed to uninstall module' });
    }
  }
);

export default router;
