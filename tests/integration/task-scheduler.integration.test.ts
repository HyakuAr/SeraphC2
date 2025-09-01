/**
 * Task Scheduler Integration Tests
 * Tests for requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import { Pool } from 'pg';
import { TaskSchedulerService } from '../../src/core/services/task-scheduler.service';
import { CommandManager } from '../../src/core/engine/command-manager';
import { TaskRepository } from '../../src/core/repositories/task.repository';
import {
  TaskPriority,
  TriggerType,
  EventTriggerType,
  TaskStatus,
  CreateTaskData,
} from '../../src/types/task-scheduler';

// Mock dependencies
jest.mock('../../src/core/repositories/task.repository');
jest.mock('../../src/core/engine/command-manager');
jest.mock('../../src/utils/logger');

describe('Task Scheduler Integration', () => {
  let taskScheduler: TaskSchedulerService;
  let mockPool: jest.Mocked<Pool>;
  let mockCommandManager: jest.Mocked<CommandManager>;
  let mockTaskRepository: jest.Mocked<TaskRepository>;

  beforeAll(async () => {
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
      getTasksReadyForExecution: jest.fn(),
      updateTaskNextExecution: jest.fn(),
      addExecutionLog: jest.fn(),
      cleanupOldExecutions: jest.fn(),
      getTaskExecutions: jest.fn(),
    } as any;

    (TaskRepository as jest.Mock).mockImplementation(() => mockTaskRepository);

    taskScheduler = new TaskSchedulerService(mockPool, mockCommandManager, {
      maxConcurrentTasks: 2,
      taskTimeoutMs: 10000,
      cleanupIntervalMs: 60000,
      maxExecutionHistoryDays: 1,
      enableEventTriggers: true,
      enableConditionalTriggers: false,
      conditionalCheckIntervalMs: 30000,
    });
  });

  afterAll(async () => {
    await taskScheduler.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Task Workflow', () => {
    it('should create, execute, and track a complete task workflow', async () => {
      // Setup mock data
      const taskData: CreateTaskData = {
        name: 'E2E Test Task',
        description: 'End-to-end test task',
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
            payload: 'echo "e2e test"',
            timeout: 30000,
          },
        ],
        implantIds: [],
        tags: ['e2e', 'test'],
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

      const mockExecution = {
        id: 'exec-1',
        taskId: 'task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        triggeredBy: TriggerType.MANUAL,
        commands: [],
        logs: [],
        retryCount: 0,
      };

      // Mock repository responses
      mockTaskRepository.createTask.mockResolvedValue(mockTask as any);
      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);
      mockTaskRepository.createTaskExecution.mockResolvedValue(mockExecution as any);
      mockCommandManager.executeCommand.mockResolvedValue({
        id: 'cmd-result-1',
        type: 'shell',
        payload: 'echo "e2e test"',
        timestamp: new Date(),
        status: 'completed',
        result: { output: 'e2e test', exitCode: 0 },
      } as any);

      // 1. Create task
      const createdTask = await taskScheduler.createTask(taskData, 'user-1');
      expect(createdTask).toEqual(mockTask);
      expect(mockTaskRepository.createTask).toHaveBeenCalledWith(taskData, 'user-1');

      // 2. Execute task manually
      const execution = await taskScheduler.executeTask('task-1', 'user-1');
      expect(execution).toEqual(mockExecution);
      expect(mockTaskRepository.createTaskExecution).toHaveBeenCalledWith(
        'task-1',
        TriggerType.MANUAL,
        { operatorId: 'user-1' }
      );

      // 3. Verify task execution was logged
      expect(mockTaskRepository.addExecutionLog).toHaveBeenCalled();
    });

    it('should handle scheduled task execution', async () => {
      const mockTask = {
        id: 'scheduled-task-1',
        name: 'Scheduled Task',
        isActive: true,
        triggers: [
          {
            type: TriggerType.CRON,
            cronSchedule: { expression: '0 * * * *' },
            isActive: true,
          },
        ],
        commands: [
          {
            id: 'cmd-1',
            type: 'shell',
            payload: 'echo "scheduled"',
            timeout: 30000,
          },
        ],
        implantIds: [],
      };

      const mockExecution = {
        id: 'exec-scheduled-1',
        taskId: 'scheduled-task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        triggeredBy: TriggerType.CRON,
        commands: [],
        logs: [],
        retryCount: 0,
      };

      // Mock scheduled tasks ready for execution
      mockTaskRepository.getTasksReadyForExecution.mockResolvedValue([mockTask as any]);
      mockTaskRepository.createTaskExecution.mockResolvedValue(mockExecution as any);
      mockCommandManager.executeCommand.mockResolvedValue({
        id: 'cmd-result-scheduled',
        type: 'shell',
        payload: 'echo "scheduled"',
        timestamp: new Date(),
        status: 'completed',
        result: { output: 'scheduled', exitCode: 0 },
      } as any);

      // Start scheduler
      await taskScheduler.start();

      // Wait for scheduler to process
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify scheduled execution was created
      expect(mockTaskRepository.getTasksReadyForExecution).toHaveBeenCalled();
      expect(mockTaskRepository.createTaskExecution).toHaveBeenCalledWith(
        'scheduled-task-1',
        TriggerType.CRON,
        expect.objectContaining({
          cronExpression: '0 * * * *',
        })
      );

      await taskScheduler.stop();
    });

    it('should handle event-triggered tasks', async () => {
      const mockTasks = {
        tasks: [
          {
            id: 'event-task-1',
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

      const mockExecution = {
        id: 'exec-event-1',
        taskId: 'event-task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        triggeredBy: TriggerType.EVENT,
        commands: [],
        logs: [],
        retryCount: 0,
      };

      mockTaskRepository.getTasks.mockResolvedValue(mockTasks as any);
      mockTaskRepository.createTaskExecution.mockResolvedValue(mockExecution as any);

      // Trigger event
      await taskScheduler.triggerEvent(EventTriggerType.IMPLANT_CONNECTED, {
        implantId: 'implant-1',
      });

      // Verify event-triggered execution
      expect(mockTaskRepository.getTasks).toHaveBeenCalledWith({ isActive: true }, 1, 1000);
      expect(mockTaskRepository.createTaskExecution).toHaveBeenCalledWith(
        'event-task-1',
        TriggerType.EVENT,
        {
          eventType: EventTriggerType.IMPLANT_CONNECTED,
          implantId: 'implant-1',
        }
      );
    });

    it('should handle task execution control operations', async () => {
      const mockExecution = {
        id: 'exec-control-1',
        taskId: 'task-control-1',
        status: TaskStatus.RUNNING,
      };

      const mockTask = {
        id: 'task-control-1',
        commands: [],
      };

      // Simulate running task
      (taskScheduler as any).runningTasks.set('exec-control-1', mockExecution);

      // Test pause
      await taskScheduler.pauseTaskExecution('exec-control-1');
      expect(mockTaskRepository.updateTaskExecution).toHaveBeenCalledWith('exec-control-1', {
        status: TaskStatus.PAUSED,
      });

      // Test resume
      mockTaskRepository.getTaskExecutionById.mockResolvedValue({
        ...mockExecution,
        status: TaskStatus.PAUSED,
      } as any);
      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);

      await taskScheduler.resumeTaskExecution('exec-control-1');
      expect(mockTaskRepository.updateTaskExecution).toHaveBeenCalledWith('exec-control-1', {
        status: TaskStatus.RUNNING,
      });

      // Test cancel
      (taskScheduler as any).runningTasks.set('exec-control-1', mockExecution);
      await taskScheduler.cancelTaskExecution('exec-control-1');
      expect(mockTaskRepository.updateTaskExecution).toHaveBeenCalledWith('exec-control-1', {
        status: TaskStatus.CANCELLED,
        endTime: expect.any(Date),
      });
    });

    it('should generate accurate scheduler statistics', async () => {
      const mockTasksResponse = {
        tasks: [{ isActive: true }, { isActive: false }, { isActive: true }],
        totalCount: 3,
      };

      const mockExecutionsResponse = {
        executions: [
          {
            status: TaskStatus.COMPLETED,
            startTime: new Date(Date.now() - 10000),
            endTime: new Date(Date.now() - 5000),
          },
          {
            status: TaskStatus.FAILED,
            startTime: new Date(Date.now() - 8000),
            endTime: new Date(Date.now() - 3000),
          },
          {
            status: TaskStatus.COMPLETED,
            startTime: new Date(Date.now() - 6000),
            endTime: new Date(Date.now() - 1000),
          },
        ],
      };

      mockTaskRepository.getTasks.mockResolvedValue(mockTasksResponse as any);
      mockTaskRepository.getTaskExecutions.mockResolvedValue(mockExecutionsResponse as any);

      const stats = await taskScheduler.getStats();

      expect(stats).toMatchObject({
        totalTasks: 3,
        activeTasks: 2,
        runningTasks: 0,
        completedTasksToday: 2,
        failedTasksToday: 1,
        averageExecutionTime: expect.any(Number),
        uptime: expect.any(Number),
      });

      expect(stats.averageExecutionTime).toBeGreaterThan(0);
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should handle cleanup operations', async () => {
      mockTaskRepository.cleanupOldExecutions.mockResolvedValue(5);

      // Start scheduler to trigger cleanup
      await taskScheduler.start();

      // Wait for cleanup interval (mocked)
      await new Promise(resolve => setTimeout(resolve, 100));

      await taskScheduler.stop();

      // Cleanup should have been called during scheduler operation
      expect(mockTaskRepository.cleanupOldExecutions).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle command execution failures gracefully', async () => {
      const mockTask = {
        id: 'failing-task-1',
        name: 'Failing Task',
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
        id: 'exec-failing-1',
        taskId: 'failing-task-1',
        status: TaskStatus.PENDING,
        startTime: new Date(),
        commands: [],
        logs: [],
        retryCount: 0,
      };

      mockTaskRepository.getTaskById.mockResolvedValue(mockTask as any);
      mockTaskRepository.createTaskExecution.mockResolvedValue(mockExecution as any);
      mockCommandManager.executeCommand.mockRejectedValue(new Error('Command failed'));

      const result = await taskScheduler.executeTask('failing-task-1', 'user-1');

      expect(result).toEqual(mockExecution);
      expect(mockTaskRepository.addExecutionLog).toHaveBeenCalledWith(
        'exec-failing-1',
        'error',
        expect.stringContaining('Command execution failed'),
        expect.any(Object)
      );
    });

    it('should handle repository errors', async () => {
      const taskData: CreateTaskData = {
        name: 'Error Task',
        priority: TaskPriority.NORMAL,
        triggers: [],
        commands: [],
        implantIds: [],
      };

      mockTaskRepository.createTask.mockRejectedValue(new Error('Database connection failed'));

      await expect(taskScheduler.createTask(taskData, 'user-1')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle scheduler lifecycle errors', async () => {
      // Mock interval functions to test error handling
      const originalSetInterval = global.setInterval;
      const originalClearInterval = global.clearInterval;

      global.setInterval = jest.fn().mockImplementation(() => 'mock-interval-id');
      global.clearInterval = jest.fn();

      await taskScheduler.start();
      await taskScheduler.stop();

      expect(global.setInterval).toHaveBeenCalledTimes(3); // Main, cleanup, conditional
      expect(global.clearInterval).toHaveBeenCalledTimes(3);

      // Restore original functions
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });
});
