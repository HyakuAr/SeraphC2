/**
 * PowerShell management API routes
 * Provides endpoints for PowerShell scripts, favorites, and sessions
 */

import { Router, Request, Response } from 'express';
import { PowerShellService } from '../../core/services/powershell.service';
import { PostgresPowerShellScriptRepository } from '../../core/repositories/powershell-script.repository';
import { PostgresPowerShellFavoriteRepository } from '../../core/repositories/powershell-favorite.repository';
import { PostgresPowerShellSessionRepository } from '../../core/repositories/powershell-session.repository';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { Logger } from '../../utils/logger';
import { CommandManager } from '../../core/engine/command-manager';
import { CommandType } from '../../types/entities';

export interface PowerShellRoutesConfig {
  authMiddleware: AuthMiddleware;
  commandManager: CommandManager;
}

export function createPowerShellRoutes(config: PowerShellRoutesConfig): Router {
  const router = Router();
  const { authMiddleware, commandManager } = config;
  const logger = Logger.getInstance();

  // Initialize PowerShell service with repositories
  const scriptRepository = new PostgresPowerShellScriptRepository();
  const favoriteRepository = new PostgresPowerShellFavoriteRepository();
  const sessionRepository = new PostgresPowerShellSessionRepository();

  const powerShellService = new PowerShellService(
    scriptRepository,
    favoriteRepository,
    sessionRepository
  );

  // Use provided command manager for execution

  // Apply authentication middleware to all routes
  router.use(authMiddleware.authenticate.bind(authMiddleware));

  // Script Management Routes

  /**
   * POST /api/powershell/scripts - Create a new PowerShell script
   */
  router.post('/scripts', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { name, content, description, parameters, tags } = req.body;
      const operatorId = (req as any).user?.id;

      if (!name || !content) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, content',
        });
      }

      // Validate script syntax
      const validation = powerShellService.validateScriptSyntax(content);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Script syntax validation failed',
          details: validation.errors,
        });
      }

      const script = await powerShellService.createScript(
        name,
        content,
        operatorId,
        description,
        parameters,
        tags
      );

      return res.status(201).json({
        success: true,
        data: script,
      });
    } catch (error) {
      logger.error('Failed to create PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PowerShell script',
      });
    }
  });

  /**
   * GET /api/powershell/scripts - Get PowerShell scripts for the current operator
   */
  router.get('/scripts', async (req: Request, res: Response): Promise<Response> => {
    try {
      const operatorId = (req as any).user?.id;
      const { tags, search } = req.query;

      let scripts;
      if (search) {
        scripts = await powerShellService.searchScripts(search as string);
      } else if (tags) {
        const tagArray = Array.isArray(tags) ? (tags as string[]) : [tags as string];
        scripts = await powerShellService.getScriptsByTags(tagArray);
      } else {
        scripts = await powerShellService.getScriptsByOperator(operatorId);
      }

      return res.json({
        success: true,
        data: scripts,
        count: scripts.length,
      });
    } catch (error) {
      logger.error('Failed to get PowerShell scripts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get PowerShell scripts',
      });
    }
  });

  /**
   * GET /api/powershell/scripts/:id - Get a specific PowerShell script
   */
  router.get('/scripts/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Script ID is required',
        });
      }

      const script = await powerShellService.getScript(id);
      if (!script) {
        return res.status(404).json({
          success: false,
          error: 'PowerShell script not found',
        });
      }

      return res.json({
        success: true,
        data: script,
      });
    } catch (error) {
      logger.error('Failed to get PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        scriptId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get PowerShell script',
      });
    }
  });

  /**
   * PUT /api/powershell/scripts/:id - Update a PowerShell script
   */
  router.put('/scripts/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Script ID is required',
        });
      }

      // Validate script syntax if content is being updated
      if (updates.content) {
        const validation = powerShellService.validateScriptSyntax(updates.content);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            error: 'Script syntax validation failed',
            details: validation.errors,
          });
        }
      }

      const script = await powerShellService.updateScript(id, updates);

      return res.json({
        success: true,
        data: script,
      });
    } catch (error) {
      logger.error('Failed to update PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        scriptId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update PowerShell script',
      });
    }
  });

  /**
   * DELETE /api/powershell/scripts/:id - Delete a PowerShell script
   */
  router.delete('/scripts/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Script ID is required',
        });
      }

      await powerShellService.deleteScript(id);

      return res.json({
        success: true,
        message: 'PowerShell script deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        scriptId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete PowerShell script',
      });
    }
  });

  // Favorites Management Routes

  /**
   * POST /api/powershell/favorites - Create a new PowerShell favorite
   */
  router.post('/favorites', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { name, command, description, category } = req.body;
      const operatorId = (req as any).user?.id;

      if (!name || !command) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, command',
        });
      }

      const favorite = await powerShellService.createFavorite(
        name,
        command,
        operatorId,
        description,
        category
      );

      return res.status(201).json({
        success: true,
        data: favorite,
      });
    } catch (error) {
      logger.error('Failed to create PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PowerShell favorite',
      });
    }
  });

  /**
   * GET /api/powershell/favorites - Get PowerShell favorites for the current operator
   */
  router.get('/favorites', async (req: Request, res: Response): Promise<Response> => {
    try {
      const operatorId = (req as any).user?.id;
      const { category, mostUsed } = req.query;

      let favorites;
      if (mostUsed === 'true') {
        const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10;
        favorites = await powerShellService.getMostUsedFavorites(operatorId, limit);
      } else if (category) {
        favorites = await powerShellService.getFavoritesByCategory(category as string);
      } else {
        favorites = await powerShellService.getFavoritesByOperator(operatorId);
      }

      return res.json({
        success: true,
        data: favorites,
        count: favorites.length,
      });
    } catch (error) {
      logger.error('Failed to get PowerShell favorites', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get PowerShell favorites',
      });
    }
  });

  /**
   * POST /api/powershell/favorites/:id/use - Mark a favorite as used
   */
  router.post('/favorites/:id/use', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Favorite ID is required',
        });
      }

      const favorite = await powerShellService.useFavorite(id);

      return res.json({
        success: true,
        data: favorite,
      });
    } catch (error) {
      logger.error('Failed to use PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favoriteId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to use PowerShell favorite',
      });
    }
  });

  /**
   * PUT /api/powershell/favorites/:id - Update a PowerShell favorite
   */
  router.put('/favorites/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Favorite ID is required',
        });
      }

      const favorite = await powerShellService.updateFavorite(id, updates);

      return res.json({
        success: true,
        data: favorite,
      });
    } catch (error) {
      logger.error('Failed to update PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favoriteId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update PowerShell favorite',
      });
    }
  });

  /**
   * DELETE /api/powershell/favorites/:id - Delete a PowerShell favorite
   */
  router.delete('/favorites/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Favorite ID is required',
        });
      }

      await powerShellService.deleteFavorite(id);

      return res.json({
        success: true,
        message: 'PowerShell favorite deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favoriteId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete PowerShell favorite',
      });
    }
  });

  // PowerShell Execution Routes

  /**
   * POST /api/powershell/execute - Execute a PowerShell command
   */
  router.post('/execute', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, command, timeout = 30000 } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !command) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, command',
        });
      }

      const commandResult = await commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.POWERSHELL,
        payload: command,
        timeout,
      });

      return res.json({
        success: true,
        data: commandResult,
      });
    } catch (error) {
      logger.error('Failed to execute PowerShell command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute PowerShell command',
      });
    }
  });

  /**
   * POST /api/powershell/execute-script - Execute a PowerShell script
   */
  router.post('/execute-script', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, scriptId, scriptContent, parameters, timeout = 60000 } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || (!scriptId && !scriptContent)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, and either scriptId or scriptContent',
        });
      }

      let script = scriptContent;
      if (scriptId && !scriptContent) {
        const scriptObj = await powerShellService.getScript(scriptId);
        if (!scriptObj) {
          return res.status(404).json({
            success: false,
            error: 'PowerShell script not found',
          });
        }
        script = scriptObj.content;
      }

      const payload = JSON.stringify({
        script,
        parameters: parameters || {},
      });

      const commandResult = await commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.POWERSHELL_SCRIPT,
        payload,
        timeout,
      });

      return res.json({
        success: true,
        data: commandResult,
      });
    } catch (error) {
      logger.error('Failed to execute PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute PowerShell script',
      });
    }
  });

  /**
   * POST /api/powershell/load-module - Load a PowerShell module
   */
  router.post('/load-module', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, moduleName, moduleContent, timeout = 30000 } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || (!moduleName && !moduleContent)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, and either moduleName or moduleContent',
        });
      }

      const payload = JSON.stringify({
        moduleName: moduleName || '',
        moduleContent: moduleContent || '',
      });

      const commandResult = await commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.POWERSHELL_MODULE_LOAD,
        payload,
        timeout,
      });

      return res.json({
        success: true,
        data: commandResult,
      });
    } catch (error) {
      logger.error('Failed to load PowerShell module', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load PowerShell module',
      });
    }
  });

  /**
   * GET /api/powershell/modules/:implantId - List PowerShell modules on implant
   */
  router.get('/modules/:implantId', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId } = req.params;
      const operatorId = (req as any).user?.id;

      if (!implantId) {
        return res.status(400).json({
          success: false,
          error: 'Implant ID is required',
        });
      }

      const commandResult = await commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.POWERSHELL_MODULE_LIST,
        payload: '',
        timeout: 30000,
      });

      return res.json({
        success: true,
        data: commandResult,
      });
    } catch (error) {
      logger.error('Failed to list PowerShell modules', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: req.params['implantId'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list PowerShell modules',
      });
    }
  });

  // Session Management Routes

  /**
   * POST /api/powershell/sessions - Create a new PowerShell session
   */
  router.post('/sessions', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, runspaceId } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: implantId',
        });
      }

      const session = await powerShellService.createSession(implantId, operatorId, runspaceId);

      return res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error('Failed to create PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PowerShell session',
      });
    }
  });

  /**
   * GET /api/powershell/sessions - Get PowerShell sessions
   */
  router.get('/sessions', async (req: Request, res: Response): Promise<Response> => {
    try {
      const operatorId = (req as any).user?.id;
      const { implantId } = req.query;

      let sessions;
      if (implantId) {
        sessions = await powerShellService.getSessionsByImplant(implantId as string);
      } else {
        sessions = await powerShellService.getSessionsByOperator(operatorId);
      }

      return res.json({
        success: true,
        data: sessions,
        count: sessions.length,
      });
    } catch (error) {
      logger.error('Failed to get PowerShell sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get PowerShell sessions',
      });
    }
  });

  /**
   * GET /api/powershell/sessions/:id - Get a specific PowerShell session
   */
  router.get('/sessions/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
      }

      const session = await powerShellService.getSession(id);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'PowerShell session not found',
        });
      }

      return res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error('Failed to get PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get PowerShell session',
      });
    }
  });

  /**
   * PUT /api/powershell/sessions/:id - Update a PowerShell session
   */
  router.put('/sessions/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
      }

      const session = await powerShellService.updateSession(id, updates);

      return res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error('Failed to update PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update PowerShell session',
      });
    }
  });

  /**
   * DELETE /api/powershell/sessions/:id - Close and delete a PowerShell session
   */
  router.delete('/sessions/:id', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required',
        });
      }

      await powerShellService.closeSession(id);
      await powerShellService.deleteSession(id);

      return res.json({
        success: true,
        message: 'PowerShell session closed and deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete PowerShell session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete PowerShell session',
      });
    }
  });

  return router;
}
