/**
 * Task Scheduler API Routes
 * Implements requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { TaskSchedulerService } from '../../core/services/task-scheduler.service';
import { AuthMiddleware } from '../middleware/auth.middleware';
import {
  CreateTaskData,
  UpdateTaskData,
  TaskFilter,
  TaskPriority,
  TriggerType,
  EventTriggerType,
} from '../../types/task-scheduler';
import { Logger } from '../../utils/logger';

export function createTaskRoutes(
  taskScheduler: TaskSchedulerService,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();
  const logger = Logger.getInstance();

  // Apply authentication to all routes
  router.use(authMiddleware.authenticate());

  /**
   * Get all tasks with filtering and pagination
   */
  router.get(
    '/',
    [
      query('page').optional().isInt({ min: 1 }).toInt(),
      query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
      query('name').optional().isString().trim(),
      query('priority').optional().isIn(Object.values(TaskPriority)),
      query('isActive').optional().isBoolean().toBoolean(),
      query('implantId').optional().isUUID(),
      query('createdBy').optional().isUUID(),
      query('tags').optional().isString(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const page = (req.query.page as number | undefined) || 1;
        const pageSize = (req.query.pageSize as number | undefined) || 50;

        const filter: TaskFilter = {};
        if (req.query.name) filter.name = req.query.name as string;
        if (req.query.priority) filter.priority = req.query.priority as TaskPriority;
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive as boolean;
        if (req.query.implantId) filter.implantId = req.query.implantId as string;
        if (req.query.createdBy) filter.createdBy = req.query.createdBy as string;
        if (req.query.tags) {
          filter.tags = (req.query.tags as string).split(',').map(tag => tag.trim());
        }

        const result = await taskScheduler.getTasks(filter, page, pageSize);
        res.json(result);
      } catch (error) {
        logger.error('Failed to get tasks', {
          error: error instanceof Error ? error.message : 'Unknown error',
          query: req.query,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get task by ID
   */
  router.get('/:id', [param('id').isUUID()], async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const task = await taskScheduler.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      logger.error('Failed to get task', {
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId: req.params.id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * Create new task
   */
  router.post(
    '/',
    authMiddleware.requireOperator(),
    [
      body('name').isString().trim().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().trim(),
      body('priority').isIn(Object.values(TaskPriority)),
      body('triggers').isArray({ min: 1 }),
      body('triggers.*.type').isIn(Object.values(TriggerType)),
      body('triggers.*.isActive').isBoolean(),
      body('commands').isArray({ min: 1 }),
      body('commands.*.type').isString().trim(),
      body('commands.*.payload').isString(),
      body('implantIds').isArray(),
      body('implantIds.*').optional().isUUID(),
      body('tags').optional().isArray(),
      body('tags.*').optional().isString().trim(),
      body('isActive').optional().isBoolean(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const data: CreateTaskData = {
          name: req.body.name,
          description: req.body.description,
          priority: req.body.priority,
          triggers: req.body.triggers,
          commands: req.body.commands,
          implantIds: req.body.implantIds || [],
          tags: req.body.tags || [],
          isActive: req.body.isActive ?? true,
        };

        const task = await taskScheduler.createTask(data, req.operator!.id);
        res.status(201).json(task);
      } catch (error) {
        logger.error('Failed to create task', {
          error: error instanceof Error ? error.message : 'Unknown error',
          data: req.body,
          userId: req.operator?.id,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Update task
   */
  router.put(
    '/:id',
    authMiddleware.requireOperator(),
    [
      param('id').isUUID(),
      body('name').optional().isString().trim().isLength({ min: 1, max: 255 }),
      body('description').optional().isString().trim(),
      body('priority').optional().isIn(Object.values(TaskPriority)),
      body('triggers').optional().isArray(),
      body('commands').optional().isArray(),
      body('implantIds').optional().isArray(),
      body('tags').optional().isArray(),
      body('isActive').optional().isBoolean(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const data: UpdateTaskData = {};
        if (req.body.name !== undefined) data.name = req.body.name;
        if (req.body.description !== undefined) data.description = req.body.description;
        if (req.body.priority !== undefined) data.priority = req.body.priority;
        if (req.body.triggers !== undefined) data.triggers = req.body.triggers;
        if (req.body.commands !== undefined) data.commands = req.body.commands;
        if (req.body.implantIds !== undefined) data.implantIds = req.body.implantIds;
        if (req.body.tags !== undefined) data.tags = req.body.tags;
        if (req.body.isActive !== undefined) data.isActive = req.body.isActive;

        const task = await taskScheduler.updateTask(req.params.id, data, req.operator!.id);
        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        res.json(task);
      } catch (error) {
        logger.error('Failed to update task', {
          error: error instanceof Error ? error.message : 'Unknown error',
          taskId: req.params.id,
          data: req.body,
          userId: req.operator?.id,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Delete task
   */
  router.delete(
    '/:id',
    authMiddleware.requireOperator(),
    [param('id').isUUID()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const deleted = await taskScheduler.deleteTask(req.params.id, req.operator!.id);
        if (!deleted) {
          return res.status(404).json({ error: 'Task not found' });
        }

        res.status(204).send();
      } catch (error) {
        logger.error('Failed to delete task', {
          error: error instanceof Error ? error.message : 'Unknown error',
          taskId: req.params.id,
          userId: req.operator?.id,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Execute task manually
   */
  router.post(
    '/:id/execute',
    authMiddleware.requireOperator(),
    [param('id').isUUID()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const execution = await taskScheduler.executeTask(req.params.id, req.operator!.id);
        res.json(execution);
      } catch (error) {
        logger.error('Failed to execute task', {
          error: error instanceof Error ? error.message : 'Unknown error',
          taskId: req.params.id,
          userId: req.operator?.id,
        });

        if (error instanceof Error && error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
        } else if (error instanceof Error && error.message.includes('not active')) {
          res.status(400).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    }
  );

  /**
   * Get task executions
   */
  router.get(
    '/:id/executions',
    [
      param('id').isUUID(),
      query('page').optional().isInt({ min: 1 }).toInt(),
      query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const page = (req.query.page as number | undefined) || 1;
        const pageSize = (req.query.pageSize as number | undefined) || 50;

        const result = await taskScheduler.getTaskExecutions(req.params.id, page, pageSize);
        res.json(result);
      } catch (error) {
        logger.error('Failed to get task executions', {
          error: error instanceof Error ? error.message : 'Unknown error',
          taskId: req.params.id,
          query: req.query,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Pause task execution
   */
  router.post(
    '/executions/:executionId/pause',
    authMiddleware.requireOperator(),
    [param('executionId').isUUID()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        await taskScheduler.pauseTaskExecution(req.params.executionId);
        res.status(204).send();
      } catch (error) {
        logger.error('Failed to pause task execution', {
          error: error instanceof Error ? error.message : 'Unknown error',
          executionId: req.params.executionId,
          userId: req.operator?.id,
        });

        if (error instanceof Error && error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    }
  );

  /**
   * Resume task execution
   */
  router.post(
    '/executions/:executionId/resume',
    authMiddleware.requireOperator(),
    [param('executionId').isUUID()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        await taskScheduler.resumeTaskExecution(req.params.executionId);
        res.status(204).send();
      } catch (error) {
        logger.error('Failed to resume task execution', {
          error: error instanceof Error ? error.message : 'Unknown error',
          executionId: req.params.executionId,
          userId: req.operator?.id,
        });

        if (error instanceof Error && error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
        } else if (error instanceof Error && error.message.includes('not paused')) {
          res.status(400).json({ error: error.message });
        } else {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    }
  );

  /**
   * Cancel task execution
   */
  router.post(
    '/executions/:executionId/cancel',
    authMiddleware.requireOperator(),
    [param('executionId').isUUID()],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        await taskScheduler.cancelTaskExecution(req.params.executionId);
        res.status(204).send();
      } catch (error) {
        logger.error('Failed to cancel task execution', {
          error: error instanceof Error ? error.message : 'Unknown error',
          executionId: req.params.executionId,
          userId: req.operator?.id,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Trigger event
   */
  router.post(
    '/events/trigger',
    authMiddleware.requireOperator(),
    [
      body('eventType').isIn(Object.values(EventTriggerType)),
      body('eventData').optional().isObject(),
    ],
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        await taskScheduler.triggerEvent(req.body.eventType, req.body.eventData || {});
        res.status(204).send();
      } catch (error) {
        logger.error('Failed to trigger event', {
          error: error instanceof Error ? error.message : 'Unknown error',
          eventType: req.body.eventType,
          userId: req.operator?.id,
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  /**
   * Get scheduler statistics
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await taskScheduler.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get scheduler stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
