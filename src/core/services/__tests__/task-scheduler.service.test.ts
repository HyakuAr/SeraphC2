/**
 * TaskSchedulerService Tests
 * Tests for requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import { Pool } from 'pg';
import { TaskSchedulerService } from '../task-scheduler.service';
import { CommandManager } from '../../engine/command-manager';
import { TaskRepository } from '../../repositories/task.repository';
import {
  TaskPriority,
  TriggerType,
  TaskStatus,
  EventTriggerType,
  CreateTaskData,
} from '../../../types/task-scheduler';

// Mock dependencies
jest.mock('../../repositories/task.repository');
jest.mock('../../engine/command-manager');
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

describe('TaskSchedulerService', () => {
  let taskScheduler: TaskSchedulerService;
  let mockPool: jest.Mocked<Pool>;
  let mockCommandManager: jest.Mocked<CommandManager>;
  let mockTaskRepository: jest.Mocked<TaskRepository>;

  beforeEach(() => {
    mockPool = {
      connect: jest.fn(),
      end: jest.fn(),
    } as any;

    mockCommandManager = {
      executeCommand: jest.fn(),
    } as any;

    mockTaskRepository = {
      createTask: jest.fn(),
      getTaskById: jest.fn(),
      getTasks: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      createTaskExecution: jest.fn(),
      updateTaskExecution: jest.fn(),
      getTaskExecutionById: jest.fn(),
      getTaskExecutions: jest.fn(),
      getTasksReadyForExecution: jest.fn(),
      updateTaskNextExecution: jest.fn(),
      addExecutionLog: jest.fn(),
      cleanupOldExecutions: jest.fn(),
    } as any;

    (TaskRepository as jest.Mock).mockImplementation(() => mockTaskRepository);

    taskScheduler = new TaskSchedulerService(mockPool, mockCommandManager, {
      maxConcurrentTasks: 5,
      taskTimeoutMs: 30000,
      cleanupIntervalMs: 3600000,
      maxExecutionHistoryDays: 7,
      enableEventTriggers: true,
      enableConditionalTriggers: true,
      conditionalCheckIntervalMs: 60000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task Management', () => {
    it('should create a new task', async () => {
      const taskData: CreateTaskData = {
        name: 'Test Task',
        description: 'A test task',
        priority: TaskPriority.NORMAL,
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
        implantIds: [],
        tags: ['test'],
        isActive: true,
      };

      const mockTask = {
        id: 'task-1',
        ...taskData,
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        commands: [{ id: 'cmd-1', ...taskData.commands[0] }],
      };

      mockTaskRepository.createTask.mockResolvedValue(mockTask as any);

      const result = await taskScheduler.createTask(taskData, 'user-1');

      expect(mockTaskRepository.createTask).toHaveBeenCalledWith(taskData, 'user-1');
      expect(mockTaskRepository.updateTaskNextExecution).toHaveBeenCalled();
      expect(result).toEqual(mockTask);
    });

    it('should update an existing task', async () => {
      const updateData = {
        name: 'Updated Task',
        priority: TaskPriority.HIGH,
      };

      const mockTask = {
        id: 'task-1',
        name: 'Updated Task',
        priority: TaskPriority.HIGH,
        triggers: [],
        commands: [],
        implantIds: [],
      };

      mockTaskRepository.updateTask.mockResolvedValue(mockTask as any);

      const result = await taskScheduler.updateTask('task-1', updateData, 'user-1');

      expect(mockTaskRepository.updateTask).toHaveBeenCalledWith('task-1', updateData);
      expect(result).toEqual(mockTask);
    });

    it('should delete a task', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
      };

      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);
      mockTaskRepository.deleteTask.mockResolvedValue(true);

      const result = await taskScheduler.deleteTask('task-1', 'user-1');

      expect(mockTaskRepository.getTaskById).toHaveBeenCalledWith('task-1');
      expect(mockTaskRepository.deleteTask).toHaveBeenCalledWith('task-1');
      expect(result).toBe(true);
    });

    it('should execute a task manually', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        isActive: true,
        commands: [
          {
            id: 'cmd-1',
            type: 'shell',
            payload: 'echo "test"',
            timeout: 30000,
          },
        ],
        implantIds: ['implant-1'],
      };

      const mockExecution = {
        id: 'exec-1',
        taskId: 'task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        commands: [],
        logs: [],
        retryCount: 0,
      };

      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);
      mockTaskRepository.createTaskExecution.mockResolvedValue(mockExecution as any);
      mockCommandManager.executeCommand.mockResolvedValue({
        id: 'cmd-result-1',
        type: 'shell',
        payload: 'echo "test"',
        timestamp: new Date(),
        status: 'completed',
        result: { output: 'test', exitCode: 0 },
      } as any);

      const result = await taskScheduler.executeTask('task-1', 'user-1');

      expect(mockTaskRepository.getTaskById).toHaveBeenCalledWith('task-1');
      expect(mockTaskRepository.createTaskExecution).toHaveBeenCalledWith(
        'task-1',
        TriggerType.MANUAL,
        { operatorId: 'user-1' }
      );
      expect(result).toEqual(mockExecution);
    });

    it('should throw error when executing inactive task', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        isActive: false,
      };

      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);

      await expect(taskScheduler.executeTask('task-1', 'user-1')).rejects.toThrow(
        'Task is not active: task-1'
      );
    });

    it('should throw error when executing non-existent task', async () => {
      mockTaskRepository.getTaskById.mockResolvedValue(null);

      await expect(taskScheduler.executeTask('task-1', 'user-1')).rejects.toThrow(
        'Task not found: task-1'
      );
    });
  });

  describe('Task Execution Control', () => {
    it('should pause a running task execution', async () => {
      const mockExecution = {
        id: 'exec-1',
        status: TaskStatus.RUNNING,
      };

      // Simulate running task
      (taskScheduler as any).runningTasks.set('exec-1', mockExecution);

      await taskScheduler.pauseTaskExecution('exec-1');

      expect(mockTaskRepository.updateTaskExecution).toHaveBeenCalledWith('exec-1', {
        status: TaskStatus.PAUSED,
      });
    });

    it('should resume a paused task execution', async () => {
      const mockExecution = {
        id: 'exec-1',
        taskId: 'task-1',
        status: TaskStatus.PAUSED,
      };

      const mockTask = {
        id: 'task-1',
        commands: [],
      };

      mockTaskRepository.getTaskExecutionById.mockResolvedValue(mockExecution as any);
      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);

      await taskScheduler.resumeTaskExecution('exec-1');

      expect(mockTaskRepository.updateTaskExecution).toHaveBeenCalledWith('exec-1', {
        status: TaskStatus.RUNNING,
      });
    });

    it('should cancel a task execution', async () => {
      const mockExecution = {
        id: 'exec-1',
        status: TaskStatus.RUNNING,
      };

      // Simulate running task
      (taskScheduler as any).runningTasks.set('exec-1', mockExecution);

      await taskScheduler.cancelTaskExecution('exec-1');

      expect(mockTaskRepository.updateTaskExecution).toHaveBeenCalledWith('exec-1', {
        status: TaskStatus.CANCELLED,
        endTime: expect.any(Date),
      });
    });
  });

  describe('Event Triggers', () => {
    it('should trigger event-based tasks', async () => {
      const mockTasks = {
        tasks: [
          {
            id: 'task-1',
            name: 'Event Task',
            isActive: true,
            triggers: [
              {
                type: TriggerType.EVENT,
                eventTrigger: {
                  type: EventTriggerType.IMPLANT_CONNECTED,
                },
                isActive: true,
              },
            ],
            commands: [
              {
                id: 'cmd-1',
                type: 'shell',
                payload: 'echo "implant connected"',
              },
            ],
            implantIds: [],
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 1000,
        totalPages: 1,
      };

      mockTaskRepository.getTasks.mockResolvedValue(mockTasks as any);
      mockTaskRepository.createTaskExecution.mockResolvedValue({
        id: 'exec-1',
        taskId: 'task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        commands: [],
        logs: [],
        retryCount: 0,
      } as any);

      await taskScheduler.triggerEvent(EventTriggerType.IMPLANT_CONNECTED, {
        implantId: 'implant-1',
      });

      expect(mockTaskRepository.getTasks).toHaveBeenCalledWith({ isActive: true }, 1, 1000);
      expect(mockTaskRepository.createTaskExecution).toHaveBeenCalledWith(
        'task-1',
        TriggerType.EVENT,
        {
          eventType: EventTriggerType.IMPLANT_CONNECTED,
          implantId: 'implant-1',
        }
      );
    });
  });

  describe('Scheduler Lifecycle', () => {
    it('should start the scheduler', async () => {
      jest.spyOn(global, 'setInterval').mockImplementation(jest.fn());
      mockTaskRepository.getTasksReadyForExecution.mockResolvedValue([]);

      await taskScheduler.start();

      expect(setInterval).toHaveBeenCalledTimes(3); // Main scheduler, cleanup, conditional
      expect(mockTaskRepository.getTasksReadyForExecution).toHaveBeenCalled();
    });

    it('should stop the scheduler', async () => {
      const setIntervalSpy = jest
        .spyOn(global, 'setInterval')
        .mockImplementation(() => 'mock-id' as any);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(jest.fn());

      // Start first
      await taskScheduler.start();

      // Then stop
      await taskScheduler.stop();

      expect(setIntervalSpy).toHaveBeenCalledTimes(3);
      expect(clearIntervalSpy).toHaveBeenCalledTimes(3);
    });

    it('should get scheduler statistics', async () => {
      // Start the scheduler to initialize the start time
      await taskScheduler.start();

      const mockTasksResponse = {
        tasks: [{ isActive: true }, { isActive: false }, { isActive: true }],
        totalCount: 3,
      };

      const mockExecutionsResponse = {
        executions: [
          {
            status: TaskStatus.COMPLETED,
            startTime: new Date(),
            endTime: new Date(Date.now() + 5000),
          },
          {
            status: TaskStatus.FAILED,
            startTime: new Date(),
          },
        ],
      };

      mockTaskRepository.getTasks.mockResolvedValue(mockTasksResponse as any);
      mockTaskRepository.getTaskExecutions.mockResolvedValue(mockExecutionsResponse as any);

      // Wait a bit to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const stats = await taskScheduler.getStats();

      expect(stats.totalTasks).toBe(3);
      expect(stats.activeTasks).toBe(2);
      expect(stats.runningTasks).toBe(0);
      expect(stats.completedTasksToday).toBe(1);
      expect(stats.failedTasksToday).toBe(1);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.uptime).toBeGreaterThan(0);

      await taskScheduler.stop();
    });
  });

  describe('Error Handling', () => {
    it('should handle task creation errors', async () => {
      const taskData: CreateTaskData = {
        name: 'Test Task',
        priority: TaskPriority.NORMAL,
        triggers: [],
        commands: [],
        implantIds: [],
      };

      mockTaskRepository.createTask.mockRejectedValue(new Error('Database error'));

      await expect(taskScheduler.createTask(taskData, 'user-1')).rejects.toThrow('Database error');
    });

    it('should handle command execution errors gracefully', async () => {
      const mockTask = {
        id: 'task-1',
        name: 'Test Task',
        isActive: true,
        commands: [
          {
            id: 'cmd-1',
            type: 'shell',
            payload: 'invalid-command',
            timeout: 30000,
          },
        ],
        implantIds: ['implant-1'],
      };

      const mockExecution = {
        id: 'exec-1',
        taskId: 'task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        commands: [],
        logs: [],
        retryCount: 0,
      };

      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);
      mockTaskRepository.createTaskExecution.mockResolvedValue(mockExecution as any);
      mockCommandManager.executeCommand.mockRejectedValue(new Error('Command failed'));

      const result = await taskScheduler.executeTask('task-1', 'user-1');

      // Wait for async execution to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result).toEqual(mockExecution);
      expect(mockTaskRepository.addExecutionLog).toHaveBeenCalledWith(
        'exec-1',
        'error',
        expect.stringContaining('Command execution failed'),
        expect.any(Object)
      );
    });
  });
});
