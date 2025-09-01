/**
 * Task Routes Tests
 * Tests for requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import request from 'supertest';
import express from 'express';
import { TaskSchedulerService } from '../../../core/services/task-scheduler.service';
import { createTaskRoutes } from '../task.routes';
import { AuthMiddleware } from '../../middleware/auth.middleware';
import {
  TaskPriority,
  TriggerType,
  TaskStatus,
  EventTriggerType,
  CreateTaskData,
} from '../../../types/task-scheduler';

// Mock dependencies
jest.mock('../../../core/services/task-scheduler.service');
jest.mock('../../middleware/auth.middleware');
jest.mock('../../../utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('Task Routes', () => {
  let app: express.Application;
  let mockTaskScheduler: jest.Mocked<TaskSchedulerService>;
  let mockAuthMiddleware: jest.Mocked<AuthMiddleware>;

  const mockOperator = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    role: 'operator',
    passwordHash: 'hash',
    permissions: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Create mock task scheduler
    mockTaskScheduler = {
      getTasks: jest.fn(),
      getTask: jest.fn(),
      createTask: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      executeTask: jest.fn(),
      getTaskExecutions: jest.fn(),
      pauseTaskExecution: jest.fn(),
      resumeTaskExecution: jest.fn(),
      cancelTaskExecution: jest.fn(),
      triggerEvent: jest.fn(),
      getStats: jest.fn(),
    } as any;

    // Create mock auth middleware
    mockAuthMiddleware = {
      authenticate: jest.fn(() => (req: any, _res: any, next: any) => {
        req.operator = mockOperator;
        req.operatorId = mockOperator.id;
        next();
      }),
      requireOperator: jest.fn(() => (req: any, _res: any, next: any) => {
        req.operator = mockOperator;
        req.operatorId = mockOperator.id;
        next();
      }),
    } as any;

    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/tasks', createTaskRoutes(mockTaskScheduler, mockAuthMiddleware));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/tasks', () => {
    it('should get all tasks with default pagination', async () => {
      const mockResponse = {
        tasks: [
          {
            id: 'task-1',
            name: 'Test Task',
            priority: TaskPriority.NORMAL,
            isActive: true,
            triggers: [],
            commands: [],
            implantIds: [],
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
            executionCount: 0,
            successCount: 0,
            failureCount: 0,
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      };

      mockTaskScheduler.getTasks.mockResolvedValue(mockResponse);

      const response = await request(app).get('/api/tasks').expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockTaskScheduler.getTasks).toHaveBeenCalledWith({}, 1, 50);
    });

    it('should get tasks with filtering and pagination', async () => {
      const mockResponse = {
        tasks: [],
        totalCount: 0,
        page: 2,
        pageSize: 25,
        totalPages: 0,
      };

      mockTaskScheduler.getTasks.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get('/api/tasks')
        .query({
          page: 2,
          pageSize: 25,
          name: 'test',
          priority: TaskPriority.HIGH,
          isActive: true,
          implantId: 'implant-1',
          tags: 'tag1,tag2',
        })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockTaskScheduler.getTasks).toHaveBeenCalledWith(
        {
          name: 'test',
          priority: TaskPriority.HIGH,
          isActive: true,
          implantId: 'implant-1',
          tags: ['tag1', 'tag2'],
        },
        2,
        25
      );
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .query({
          page: 0, // Invalid page
          pageSize: 200, // Invalid page size
          priority: 'invalid', // Invalid priority
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should get task by ID', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        priority: TaskPriority.NORMAL,
        isActive: true,
      };

      mockTaskScheduler.getTask.mockResolvedValue(mockTask as any);

      const response = await request(app).get('/api/tasks/task-1').expect(200);

      expect(response.body).toEqual(mockTask);
      expect(mockTaskScheduler.getTask).toHaveBeenCalledWith('task-1');
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskScheduler.getTask.mockResolvedValue(null);

      const response = await request(app).get('/api/tasks/non-existent').expect(404);

      expect(response.body.error).toBe('Task not found');
    });

    it('should validate UUID format', async () => {
      const response = await request(app).get('/api/tasks/invalid-uuid').expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      const taskData: CreateTaskData = {
        name: 'New Task',
        description: 'A new test task',
        priority: TaskPriority.HIGH,
        triggers: [
          {
            type: TriggerType.CRON,
            cronSchedule: { expression: '0 * * * *' },
            isActive: true,
          },
        ],
        commands: [
          {
            type: 'shell',
            payload: 'echo "test"',
            timeout: 30000,
          },
        ],
        implantIds: ['implant-1'],
        tags: ['test'],
        isActive: true,
      };

      const mockTask = {
        id: 'task-1',
        ...taskData,
        createdBy: mockOperator.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
      };

      mockTaskScheduler.createTask.mockResolvedValue(mockTask as any);

      const response = await request(app).post('/api/tasks').send(taskData).expect(201);

      expect(response.body).toEqual(mockTask);
      expect(mockTaskScheduler.createTask).toHaveBeenCalledWith(taskData, mockOperator.id);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing required fields
        description: 'Invalid task',
      };

      const response = await request(app).post('/api/tasks').send(invalidData).expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should validate trigger types', async () => {
      const invalidData = {
        name: 'Test Task',
        priority: TaskPriority.NORMAL,
        triggers: [
          {
            type: 'invalid_trigger_type',
            isActive: true,
          },
        ],
        commands: [
          {
            type: 'shell',
            payload: 'echo "test"',
          },
        ],
        implantIds: [],
      };

      const response = await request(app).post('/api/tasks').send(invalidData).expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('should update an existing task', async () => {
      const updateData = {
        name: 'Updated Task',
        priority: TaskPriority.CRITICAL,
      };

      const mockTask = {
        id: 'task-1',
        name: 'Updated Task',
        priority: TaskPriority.CRITICAL,
      };

      mockTaskScheduler.updateTask.mockResolvedValue(mockTask as any);

      const response = await request(app).put('/api/tasks/task-1').send(updateData).expect(200);

      expect(response.body).toEqual(mockTask);
      expect(mockTaskScheduler.updateTask).toHaveBeenCalledWith(
        'task-1',
        updateData,
        mockOperator.id
      );
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskScheduler.updateTask.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/tasks/non-existent')
        .send({ name: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task', async () => {
      mockTaskScheduler.deleteTask.mockResolvedValue(true);

      await request(app).delete('/api/tasks/task-1').expect(204);

      expect(mockTaskScheduler.deleteTask).toHaveBeenCalledWith('task-1', mockOperator.id);
    });

    it('should return 404 for non-existent task', async () => {
      mockTaskScheduler.deleteTask.mockResolvedValue(false);

      const response = await request(app).delete('/api/tasks/non-existent').expect(404);

      expect(response.body.error).toBe('Task not found');
    });
  });

  describe('POST /api/tasks/:id/execute', () => {
    it('should execute a task manually', async () => {
      const mockExecution = {
        id: 'exec-1',
        taskId: 'task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        commands: [],
        logs: [],
        retryCount: 0,
      };

      mockTaskScheduler.executeTask.mockResolvedValue(mockExecution as any);

      const response = await request(app).post('/api/tasks/task-1/execute').expect(200);

      expect(response.body).toEqual(mockExecution);
      expect(mockTaskScheduler.executeTask).toHaveBeenCalledWith('task-1', mockOperator.id);
    });

    it('should handle task not found error', async () => {
      mockTaskScheduler.executeTask.mockRejectedValue(new Error('Task not found: task-1'));

      const response = await request(app).post('/api/tasks/task-1/execute').expect(404);

      expect(response.body.error).toBe('Task not found: task-1');
    });

    it('should handle inactive task error', async () => {
      mockTaskScheduler.executeTask.mockRejectedValue(new Error('Task is not active: task-1'));

      const response = await request(app).post('/api/tasks/task-1/execute').expect(400);

      expect(response.body.error).toBe('Task is not active: task-1');
    });
  });

  describe('GET /api/tasks/:id/executions', () => {
    it('should get task executions', async () => {
      const mockResponse = {
        executions: [
          {
            id: 'exec-1',
            taskId: 'task-1',
            status: TaskStatus.COMPLETED,
            startTime: new Date(),
            triggeredBy: 'manual' as any,
            commands: [],
            logs: [],
            retryCount: 0,
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      };

      mockTaskScheduler.getTaskExecutions.mockResolvedValue(mockResponse);

      const response = await request(app).get('/api/tasks/task-1/executions').expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockTaskScheduler.getTaskExecutions).toHaveBeenCalledWith('task-1', 1, 50);
    });
  });

  describe('Task Execution Control', () => {
    it('should pause task execution', async () => {
      mockTaskScheduler.pauseTaskExecution.mockResolvedValue();

      await request(app).post('/api/tasks/executions/exec-1/pause').expect(204);

      expect(mockTaskScheduler.pauseTaskExecution).toHaveBeenCalledWith('exec-1');
    });

    it('should resume task execution', async () => {
      mockTaskScheduler.resumeTaskExecution.mockResolvedValue();

      await request(app).post('/api/tasks/executions/exec-1/resume').expect(204);

      expect(mockTaskScheduler.resumeTaskExecution).toHaveBeenCalledWith('exec-1');
    });

    it('should cancel task execution', async () => {
      mockTaskScheduler.cancelTaskExecution.mockResolvedValue();

      await request(app).post('/api/tasks/executions/exec-1/cancel').expect(204);

      expect(mockTaskScheduler.cancelTaskExecution).toHaveBeenCalledWith('exec-1');
    });

    it('should handle execution not found errors', async () => {
      mockTaskScheduler.pauseTaskExecution.mockRejectedValue(
        new Error('Task execution not found: exec-1')
      );

      const response = await request(app).post('/api/tasks/executions/exec-1/pause').expect(404);

      expect(response.body.error).toBe('Task execution not found: exec-1');
    });

    it('should handle execution not paused errors', async () => {
      mockTaskScheduler.resumeTaskExecution.mockRejectedValue(
        new Error('Task execution is not paused: exec-1')
      );

      const response = await request(app).post('/api/tasks/executions/exec-1/resume').expect(400);

      expect(response.body.error).toBe('Task execution is not paused: exec-1');
    });
  });

  describe('POST /api/tasks/events/trigger', () => {
    it('should trigger an event', async () => {
      mockTaskScheduler.triggerEvent.mockResolvedValue();

      await request(app)
        .post('/api/tasks/events/trigger')
        .send({
          eventType: EventTriggerType.IMPLANT_CONNECTED,
          eventData: { implantId: 'implant-1' },
        })
        .expect(204);

      expect(mockTaskScheduler.triggerEvent).toHaveBeenCalledWith(
        EventTriggerType.IMPLANT_CONNECTED,
        { implantId: 'implant-1' }
      );
    });

    it('should validate event type', async () => {
      const response = await request(app)
        .post('/api/tasks/events/trigger')
        .send({
          eventType: 'invalid_event_type',
          eventData: {},
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/tasks/stats', () => {
    it('should get scheduler statistics', async () => {
      const mockStats = {
        totalTasks: 10,
        activeTasks: 8,
        runningTasks: 2,
        completedTasksToday: 15,
        failedTasksToday: 1,
        averageExecutionTime: 5000,
        uptime: 86400000,
      };

      mockTaskScheduler.getStats.mockResolvedValue(mockStats);

      const response = await request(app).get('/api/tasks/stats').expect(200);

      expect(response.body).toEqual(mockStats);
      expect(mockTaskScheduler.getStats).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle internal server errors', async () => {
      mockTaskScheduler.getTasks.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/tasks').expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should handle task scheduler service errors', async () => {
      mockTaskScheduler.createTask.mockRejectedValue(new Error('Invalid task configuration'));

      const taskData = {
        name: 'Test Task',
        priority: TaskPriority.NORMAL,
        triggers: [],
        commands: [],
        implantIds: [],
      };

      const response = await request(app).post('/api/tasks').send(taskData).expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });
});
