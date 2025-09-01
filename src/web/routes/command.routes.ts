/**
 * Command execution API routes
 * Provides endpoints for command execution and management
 */

import { Router, Request, Response } from 'express';
import { CommandManager } from '../../core/engine/command-manager';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { Logger } from '../../utils/logger';
import { CommandType, CommandStatus } from '../../types/entities';

export interface CommandRoutesConfig {
  commandManager: CommandManager;
  authMiddleware: AuthMiddleware;
}

export function createCommandRoutes(config: CommandRoutesConfig): Router {
  const router = Router();
  const { commandManager, authMiddleware } = config;
  const logger = Logger.getInstance();

  // Apply authentication middleware to all routes
  router.use(authMiddleware.authenticate.bind(authMiddleware));

  /**
   * POST /api/commands/execute - Execute a command on an implant
   */
  router.post('/execute', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, type, payload, timeout, priority } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !type || !payload) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, type, payload',
        });
      }

      if (!Object.values(CommandType).includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid command type',
        });
      }

      const command = await commandManager.executeCommand({
        implantId,
        operatorId,
        type,
        payload,
        timeout,
        priority,
      });

      return res.json({
        success: true,
        data: command,
      });
    } catch (error) {
      logger.error('Failed to execute command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute command',
      });
    }
  });

  /**
   * POST /api/commands/shell - Execute a shell command
   */
  router.post('/shell', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, command, timeout } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !command) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, command',
        });
      }

      const result = await commandManager.executeShellCommand(
        implantId,
        operatorId,
        command,
        timeout
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to execute shell command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        implantId: req.body.implantId,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute shell command',
      });
    }
  });

  /**
   * POST /api/commands/powershell - Execute a PowerShell command
   */
  router.post('/powershell', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, command, timeout } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !command) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, command',
        });
      }

      const result = await commandManager.executePowerShellCommand(
        implantId,
        operatorId,
        command,
        timeout
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to execute PowerShell command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        implantId: req.body.implantId,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute PowerShell command',
      });
    }
  });

  /**
   * POST /api/commands/powershell/script - Execute a PowerShell script
   */
  router.post('/powershell/script', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, scriptContent, parameters, timeout } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !scriptContent) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, scriptContent',
        });
      }

      const result = await commandManager.executePowerShellScript(
        implantId,
        operatorId,
        scriptContent,
        parameters,
        timeout
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to execute PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        implantId: req.body.implantId,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute PowerShell script',
      });
    }
  });

  /**
   * POST /api/commands/powershell/module/load - Load a PowerShell module
   */
  router.post('/powershell/module/load', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, moduleName, moduleContent, timeout } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !moduleName) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, moduleName',
        });
      }

      const result = await commandManager.loadPowerShellModule(
        implantId,
        operatorId,
        moduleName,
        moduleContent,
        timeout
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to load PowerShell module', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        implantId: req.body.implantId,
        moduleName: req.body.moduleName,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load PowerShell module',
      });
    }
  });

  /**
   * GET /api/commands/powershell/modules/:implantId - List PowerShell modules
   */
  router.get(
    '/powershell/modules/:implantId',
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const { implantId } = req.params;
        const { timeout } = req.query;
        const operatorId = (req as any).user?.id;

        if (!implantId) {
          return res.status(400).json({
            success: false,
            error: 'Implant ID is required',
          });
        }

        const result = await commandManager.listPowerShellModules(
          implantId,
          operatorId,
          timeout ? parseInt(timeout as string, 10) : undefined
        );

        return res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to list PowerShell modules', {
          error: error instanceof Error ? error.message : 'Unknown error',
          operatorId: (req as any).user?.id,
          implantId: req.params['implantId'],
        });

        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list PowerShell modules',
        });
      }
    }
  );

  /**
   * POST /api/commands/:id/cancel - Cancel a command execution
   */
  router.post('/:id/cancel', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const operatorId = (req as any).user?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Command ID is required',
        });
      }

      await commandManager.cancelCommand(id, operatorId);

      return res.json({
        success: true,
        message: 'Command cancelled successfully',
      });
    } catch (error) {
      logger.error('Failed to cancel command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commandId: req.params['id'],
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel command',
      });
    }
  });

  /**
   * GET /api/commands/:id - Get command status and result
   */
  router.get('/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Command ID is required',
        });
      }

      const command = await commandManager.getCommandStatus(id);

      if (!command) {
        return res.status(404).json({
          success: false,
          error: 'Command not found',
        });
      }

      return res.json({
        success: true,
        data: command,
      });
    } catch (error) {
      logger.error('Failed to get command status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commandId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get command status',
      });
    }
  });

  /**
   * GET /api/commands/history/:implantId - Get command history for an implant
   */
  router.get('/history/:implantId', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId } = req.params;
      const { limit = '50', offset = '0', type, status } = req.query;

      if (!implantId) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const filter = {
        implantId,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        type: type as CommandType,
        status: status as CommandStatus,
      };

      const commands = await commandManager.getCommandHistory(filter);

      return res.json({
        success: true,
        data: commands,
        count: commands.length,
      });
    } catch (error) {
      logger.error('Failed to get command history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params['implantId'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get command history',
      });
    }
  });

  /**
   * GET /api/commands/pending/:implantId - Get pending commands for an implant
   */
  router.get('/pending/:implantId', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId } = req.params;

      if (!implantId) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const commands = await commandManager.getPendingCommands(implantId);

      return res.json({
        success: true,
        data: commands,
        count: commands.length,
      });
    } catch (error) {
      logger.error('Failed to get pending commands', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params['implantId'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get pending commands',
      });
    }
  });

  /**
   * GET /api/commands/active - Get active command executions
   */
  router.get('/active', async (_req: Request, res: Response): Promise<Response> => {
    try {
      const activeCommands = commandManager.getActiveCommands();

      return res.json({
        success: true,
        data: activeCommands,
        count: activeCommands.length,
      });
    } catch (error) {
      logger.error('Failed to get active commands', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get active commands',
      });
    }
  });

  /**
   * GET /api/commands/progress/:id - Get command execution progress
   */
  router.get('/progress/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Command ID is required',
        });
      }

      const progress = commandManager.getCommandProgress(id);

      if (!progress) {
        return res.status(404).json({
          success: false,
          error: 'Command progress not found',
        });
      }

      return res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      logger.error('Failed to get command progress', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commandId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get command progress',
      });
    }
  });

  return router;
}
