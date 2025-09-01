/**
 * TaskSchedulerService - Core task scheduling and execution engine
 * Implements requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { TaskRepository } from '../repositories/task.repository';
import { CommandManager } from '../engine/command-manager';
import { CronParser } from '../../utils/cron-parser';
import { Logger } from '../../utils/logger';
import { createErrorWithContext } from '../../types/errors';
import {
  Task,
  TaskExecution,
  TaskCommand,
  CreateTaskData,
  UpdateTaskData,
  TaskFilter,
  TaskListResponse,
  TaskExecutionListResponse,
  TaskStatus,
  TriggerType,
  RetryStrategy,
  TaskSchedulerConfig,
  TaskSchedulerStats,
  EventTriggerType,
  TaskTrigger,
} from '../../types/task-scheduler';

export class TaskSchedulerService extends EventEmitter {
  private taskRepository: TaskRepository;
  private commandManager: CommandManager;
  private logger: Logger;
  private config: TaskSchedulerConfig;
  private isRunning: boolean = false;
  private schedulerInterval?: NodeJS.Timeout | null;
  private cleanupInterval?: NodeJS.Timeout | null;
  private conditionalCheckInterval?: NodeJS.Timeout | null;
  private runningTasks: Map<string, TaskExecution> = new Map();
  private startTime: Date = new Date();

  constructor(
    pool: Pool,
    commandManager: CommandManager,
    config: Partial<TaskSchedulerConfig> = {}
  ) {
    super();
    this.taskRepository = new TaskRepository(pool);
    this.commandManager = commandManager;
    this.logger = Logger.getInstance();

    this.config = {
      maxConcurrentTasks: 10,
      taskTimeoutMs: 300000, // 5 minutes
      cleanupIntervalMs: 3600000, // 1 hour
      maxExecutionHistoryDays: 30,
      enableEventTriggers: true,
      enableConditionalTriggers: true,
      conditionalCheckIntervalMs: 60000, // 1 minute
      ...config,
    };
  }

  /**
   * Start the task scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Task scheduler is already running');
      return;
    }

    this.logger.info('Starting task scheduler', { config: this.config });
    this.isRunning = true;
    this.startTime = new Date();

    // Start the main scheduler loop
    this.schedulerInterval = setInterval(
      () => this.processScheduledTasks(),
      5000 // Check every 5 seconds
    );

    // Start cleanup process
    this.cleanupInterval = setInterval(
      () => this.cleanupOldExecutions(),
      this.config.cleanupIntervalMs
    );

    // Start conditional trigger checking if enabled
    if (this.config.enableConditionalTriggers) {
      this.conditionalCheckInterval = setInterval(
        () => this.processConditionalTriggers(),
        this.config.conditionalCheckIntervalMs
      );
    }

    // Process any tasks that are ready immediately
    await this.processScheduledTasks();

    this.emit('scheduler_started', { timestamp: new Date() });
    this.logger.info('Task scheduler started successfully');
  }

  /**
   * Stop the task scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Task scheduler is not running');
      return;
    }

    this.logger.info('Stopping task scheduler');
    this.isRunning = false;

    // Clear intervals
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.conditionalCheckInterval) {
      clearInterval(this.conditionalCheckInterval);
      this.conditionalCheckInterval = null;
    }

    // Wait for running tasks to complete (with timeout)
    const runningTaskIds = Array.from(this.runningTasks.keys());
    if (runningTaskIds.length > 0) {
      this.logger.info(`Waiting for ${runningTaskIds.length} running tasks to complete`);

      const timeout = setTimeout(() => {
        this.logger.warn('Timeout waiting for tasks to complete, forcing shutdown');
        this.runningTasks.clear();
      }, 30000); // 30 second timeout

      while (this.runningTasks.size > 0 && this.isRunning !== null) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      clearTimeout(timeout);
    }

    this.emit('scheduler_stopped', { timestamp: new Date() });
    this.logger.info('Task scheduler stopped');
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskData, createdBy: string): Promise<Task> {
    const task = await this.taskRepository.createTask(data, createdBy);

    // Calculate next execution time for cron triggers
    await this.updateTaskNextExecution(task);

    this.emit('task_created', {
      type: 'task_created',
      timestamp: new Date(),
      data: {
        taskId: task.id,
        taskName: task.name,
        createdBy,
      },
    });

    return task;
  }

  /**
   * Update a task
   */
  async updateTask(id: string, data: UpdateTaskData, updatedBy: string): Promise<Task | null> {
    const task = await this.taskRepository.updateTask(id, data);

    if (task) {
      // Recalculate next execution time if triggers changed
      if (data.triggers !== undefined) {
        await this.updateTaskNextExecution(task);
      }

      this.emit('task_updated', {
        type: 'task_updated',
        timestamp: new Date(),
        data: {
          taskId: task.id,
          taskName: task.name,
          updatedBy,
          changes: Object.keys(data),
        },
      });
    }

    return task;
  }

  /**
   * Delete a task
   */
  async deleteTask(id: string, deletedBy: string): Promise<boolean> {
    const task = await this.taskRepository.getTaskById(id);
    const deleted = await this.taskRepository.deleteTask(id);

    if (deleted && task) {
      this.emit('task_deleted', {
        type: 'task_deleted',
        timestamp: new Date(),
        data: {
          taskId: id,
          taskName: task.name,
          deletedBy,
        },
      });
    }

    return deleted;
  }

  /**
   * Get task by ID
   */
  async getTask(id: string): Promise<Task | null> {
    return await this.taskRepository.getTaskById(id);
  }

  /**
   * Get tasks with filtering and pagination
   */
  async getTasks(
    filter: TaskFilter = {},
    page: number = 1,
    pageSize: number = 50
  ): Promise<TaskListResponse> {
    return await this.taskRepository.getTasks(filter, page, pageSize);
  }

  /**
   * Execute a task manually
   */
  async executeTask(taskId: string, operatorId: string): Promise<TaskExecution> {
    const task = await this.taskRepository.getTaskById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.isActive) {
      throw new Error(`Task is not active: ${taskId}`);
    }

    return await this.executeTaskInternal(task, TriggerType.MANUAL, { operatorId });
  }

  /**
   * Pause a running task execution
   */
  async pauseTaskExecution(executionId: string): Promise<void> {
    const execution = this.runningTasks.get(executionId);
    if (!execution) {
      throw new Error(`Task execution not found or not running: ${executionId}`);
    }

    await this.taskRepository.updateTaskExecution(executionId, {
      status: TaskStatus.PAUSED,
    });

    // Update local state
    execution.status = TaskStatus.PAUSED;

    this.logger.info('Task execution paused', { executionId });
  }

  /**
   * Resume a paused task execution
   */
  async resumeTaskExecution(executionId: string): Promise<void> {
    const execution = await this.taskRepository.getTaskExecutionById(executionId);
    if (!execution) {
      throw new Error(`Task execution not found: ${executionId}`);
    }

    if (execution.status !== TaskStatus.PAUSED) {
      throw new Error(`Task execution is not paused: ${executionId}`);
    }

    await this.taskRepository.updateTaskExecution(executionId, {
      status: TaskStatus.RUNNING,
    });

    // Continue execution
    const task = await this.taskRepository.getTaskById(execution.taskId);
    if (task) {
      await this.continueTaskExecution(task, execution);
    }

    this.logger.info('Task execution resumed', { executionId });
  }

  /**
   * Cancel a task execution
   */
  async cancelTaskExecution(executionId: string): Promise<void> {
    const execution = this.runningTasks.get(executionId);
    if (execution) {
      execution.status = TaskStatus.CANCELLED;
      this.runningTasks.delete(executionId);
    }

    await this.taskRepository.updateTaskExecution(executionId, {
      status: TaskStatus.CANCELLED,
      endTime: new Date(),
    });

    this.logger.info('Task execution cancelled', { executionId });
  }

  /**
   * Get task executions
   */
  async getTaskExecutions(
    taskId?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<TaskExecutionListResponse> {
    return await this.taskRepository.getTaskExecutions(taskId, page, pageSize);
  }

  /**
   * Get scheduler statistics
   */
  async getStats(): Promise<TaskSchedulerStats> {
    const tasks = await this.taskRepository.getTasks({}, 1, 1000);
    const activeTasks = tasks.tasks.filter(t => t.isActive).length;
    const runningTasks = this.runningTasks.size;

    // Get today's completed and failed tasks
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayExecutions = await this.taskRepository.getTaskExecutions(undefined, 1, 1000);
    const todayCompletedTasks = todayExecutions.executions.filter(
      e => e.status === TaskStatus.COMPLETED && e.startTime >= today
    ).length;
    const todayFailedTasks = todayExecutions.executions.filter(
      e => e.status === TaskStatus.FAILED && e.startTime >= today
    ).length;

    // Calculate average execution time
    const completedExecutions = todayExecutions.executions.filter(
      e => e.status === TaskStatus.COMPLETED && e.endTime
    );
    const averageExecutionTime =
      completedExecutions.length > 0
        ? completedExecutions.reduce((sum, e) => {
            const duration = e.endTime!.getTime() - e.startTime.getTime();
            return sum + duration;
          }, 0) / completedExecutions.length
        : 0;

    return {
      totalTasks: tasks.totalCount,
      activeTasks,
      runningTasks,
      completedTasksToday: todayCompletedTasks,
      failedTasksToday: todayFailedTasks,
      averageExecutionTime,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  /**
   * Trigger event-based tasks
   */
  async triggerEvent(
    eventType: EventTriggerType,
    eventData: Record<string, any> = {}
  ): Promise<void> {
    if (!this.config.enableEventTriggers) {
      return;
    }

    this.logger.debug('Event triggered', { eventType, eventData });

    // Find tasks with matching event triggers
    const tasks = await this.taskRepository.getTasks({ isActive: true }, 1, 1000);

    for (const task of tasks.tasks) {
      for (const trigger of task.triggers) {
        if (
          trigger.type === TriggerType.EVENT &&
          trigger.eventTrigger?.type === eventType &&
          trigger.isActive
        ) {
          // Check if conditions match
          if (this.evaluateEventConditions(trigger.eventTrigger.conditions, eventData)) {
            // Check debounce
            if (
              await this.checkEventDebounce(task.id, eventType, trigger.eventTrigger.debounceMs)
            ) {
              await this.executeTaskInternal(task, TriggerType.EVENT, { eventType, ...eventData });
            }
          }
        }
      }
    }
  }

  /**
   * Process scheduled tasks (cron-based)
   */
  private async processScheduledTasks(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      const readyTasks = await this.taskRepository.getTasksReadyForExecution();

      for (const task of readyTasks) {
        if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
          this.logger.warn('Maximum concurrent tasks reached, skipping task execution', {
            taskId: task.id,
            maxConcurrent: this.config.maxConcurrentTasks,
          });
          break;
        }

        // Find the cron trigger that should execute
        const cronTrigger = task.triggers.find(
          t => t.type === TriggerType.CRON && t.isActive && t.cronSchedule
        );

        if (cronTrigger) {
          await this.executeTaskInternal(task, TriggerType.CRON, {
            cronExpression: cronTrigger.cronSchedule!.expression,
          });

          // Update next execution time
          await this.updateTaskNextExecution(task);
        }
      }
    } catch (error) {
      this.logger.error(
        'Error processing scheduled tasks',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  /**
   * Process conditional triggers
   */
  private async processConditionalTriggers(): Promise<void> {
    if (!this.isRunning || !this.config.enableConditionalTriggers) {
      return;
    }

    try {
      const tasks = await this.taskRepository.getTasks({ isActive: true }, 1, 1000);

      for (const task of tasks.tasks) {
        for (const trigger of task.triggers) {
          if (
            trigger.type === TriggerType.CONDITIONAL &&
            trigger.conditionalTrigger &&
            trigger.isActive
          ) {
            // Check if it's time to evaluate this condition
            const lastCheck = await this.getLastConditionalCheck(task.id, trigger);
            const now = Date.now();

            if (now - lastCheck >= trigger.conditionalTrigger.checkIntervalMs) {
              if (await this.evaluateConditionalTrigger(trigger.conditionalTrigger)) {
                await this.executeTaskInternal(task, TriggerType.CONDITIONAL, {
                  expression: trigger.conditionalTrigger.expression,
                });
              }

              await this.updateLastConditionalCheck(task.id, trigger, now);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(
        'Error processing conditional triggers',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  /**
   * Execute a task internally
   */
  private async executeTaskInternal(
    task: Task,
    triggeredBy: TriggerType,
    triggerData: Record<string, any> = {}
  ): Promise<TaskExecution> {
    const execution = await this.taskRepository.createTaskExecution(
      task.id,
      triggeredBy,
      triggerData
    );
    this.runningTasks.set(execution.id, execution);

    this.emit('task_execution_started', {
      type: 'task_execution_started',
      timestamp: new Date(),
      data: {
        taskId: task.id,
        executionId: execution.id,
        taskName: task.name,
        triggeredBy,
      },
    });

    this.logger.info('Task execution started', {
      taskId: task.id,
      executionId: execution.id,
      taskName: task.name,
      triggeredBy,
    });

    // Execute in background
    this.executeTaskCommands(task, execution).catch(error => {
      this.logger.error(
        'Task execution failed',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          taskId: task.id,
          executionId: execution.id,
        }
      );
    });

    return execution;
  }

  /**
   * Execute task commands
   */
  private async executeTaskCommands(task: Task, execution: TaskExecution): Promise<void> {
    try {
      await this.taskRepository.updateTaskExecution(execution.id, {
        status: TaskStatus.RUNNING,
      });

      execution.status = TaskStatus.RUNNING;
      let commandsSucceeded = 0;
      let commandsFailed = 0;

      // Determine target implants
      const targetImplants =
        task.implantIds.length > 0 ? task.implantIds : await this.getAllActiveImplantIds();

      // Execute commands
      for (const command of task.commands) {
        const currentExecution = this.runningTasks.get(execution.id);
        if (
          currentExecution &&
          (currentExecution.status === TaskStatus.CANCELLED ||
            currentExecution.status === TaskStatus.PAUSED)
        ) {
          break;
        }

        // Execute command on each target implant
        for (const implantId of targetImplants) {
          const currentExecutionInner = this.runningTasks.get(execution.id);
          if (
            currentExecutionInner &&
            (currentExecutionInner.status === TaskStatus.CANCELLED ||
              currentExecutionInner.status === TaskStatus.PAUSED)
          ) {
            break;
          }

          try {
            await this.executeTaskCommand(task, execution, command, implantId);
            commandsSucceeded++;
          } catch (error) {
            commandsFailed++;
            await this.taskRepository.addExecutionLog(
              execution.id,
              'error',
              `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              { commandId: command.id, implantId }
            );

            // Check if we should retry
            if (command.retryPolicy && (await this.shouldRetryCommand(command, execution))) {
              await this.scheduleCommandRetry(task, execution, command, implantId);
            }
          }
        }
      }

      // Complete execution
      const endTime = new Date();
      const duration = endTime.getTime() - execution.startTime.getTime();
      const finalStatus = commandsFailed > 0 ? TaskStatus.FAILED : TaskStatus.COMPLETED;

      await this.taskRepository.updateTaskExecution(execution.id, {
        status: finalStatus,
        endTime,
      });

      execution.status = finalStatus;
      execution.endTime = endTime;

      this.runningTasks.delete(execution.id);

      this.emit('task_execution_completed', {
        type: 'task_execution_completed',
        timestamp: new Date(),
        data: {
          taskId: task.id,
          executionId: execution.id,
          taskName: task.name,
          status: finalStatus,
          duration,
          commandsExecuted: commandsSucceeded + commandsFailed,
          commandsSucceeded,
          commandsFailed,
        },
      });

      this.logger.info('Task execution completed', {
        taskId: task.id,
        executionId: execution.id,
        status: finalStatus,
        duration,
        commandsSucceeded,
        commandsFailed,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.taskRepository.updateTaskExecution(execution.id, {
        status: TaskStatus.FAILED,
        endTime: new Date(),
        error: errorMessage,
      });

      execution.status = TaskStatus.FAILED;
      execution.endTime = new Date();
      execution.error = errorMessage;

      this.runningTasks.delete(execution.id);

      this.emit('task_execution_failed', {
        type: 'task_execution_failed',
        timestamp: new Date(),
        data: {
          taskId: task.id,
          executionId: execution.id,
          taskName: task.name,
          error: errorMessage,
          retryCount: execution.retryCount,
          willRetry: false,
        },
      });

      this.logger.error('Task execution failed', new Error(errorMessage), {
        taskId: task.id,
        executionId: execution.id,
      });
    }
  }

  /**
   * Execute a single task command
   */
  private async executeTaskCommand(
    _task: Task,
    execution: TaskExecution,
    command: TaskCommand,
    implantId: string
  ): Promise<void> {
    const timeout = command.timeout || this.config.taskTimeoutMs;

    await this.taskRepository.addExecutionLog(
      execution.id,
      'info',
      `Executing command: ${command.type}`,
      { commandId: command.id, implantId, payload: command.payload }
    );

    // Execute command through CommandManager
    const result = await Promise.race([
      this.commandManager.executeCommand({
        type: command.type as any,
        payload: command.payload,
        implantId,
      } as any),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Command timeout')), timeout)),
    ]);

    await this.taskRepository.addExecutionLog(
      execution.id,
      'info',
      'Command completed successfully',
      { commandId: command.id, implantId, result }
    );
  }

  /**
   * Continue task execution (for resumed tasks)
   */
  private async continueTaskExecution(task: Task, execution: TaskExecution): Promise<void> {
    this.runningTasks.set(execution.id, execution);
    await this.executeTaskCommands(task, execution);
  }

  /**
   * Update task next execution time
   */
  private async updateTaskNextExecution(task: Task): Promise<void> {
    let nextExecution: Date | null = null;

    // Find the earliest next execution time from all cron triggers
    for (const trigger of task.triggers) {
      if (trigger.type === TriggerType.CRON && trigger.isActive && trigger.cronSchedule) {
        try {
          const triggerNext = CronParser.getNextExecution(trigger.cronSchedule.expression);
          if (!nextExecution || triggerNext < nextExecution) {
            nextExecution = triggerNext;
          }
        } catch (error) {
          this.logger.error(
            'Invalid cron expression',
            error instanceof Error ? error : new Error('Unknown error'),
            {
              taskId: task.id,
              expression: trigger.cronSchedule.expression,
            }
          );
        }
      }
    }

    await this.taskRepository.updateTaskNextExecution(task.id, nextExecution);
  }

  /**
   * Clean up old task executions
   */
  private async cleanupOldExecutions(): Promise<void> {
    try {
      const deletedCount = await this.taskRepository.cleanupOldExecutions(
        this.config.maxExecutionHistoryDays
      );

      if (deletedCount > 0) {
        this.logger.info('Cleaned up old task executions', { deletedCount });
      }
    } catch (error) {
      this.logger.error(
        'Failed to cleanup old executions',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  /**
   * Evaluate event conditions
   */
  private evaluateEventConditions(
    conditions: Record<string, any> | undefined,
    eventData: Record<string, any>
  ): boolean {
    if (!conditions) {
      return true;
    }

    // Simple condition matching - can be extended for complex logic
    for (const [key, expectedValue] of Object.entries(conditions)) {
      if (eventData[key] !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check event debounce
   */
  private async checkEventDebounce(
    _taskId: string,
    _eventType: EventTriggerType,
    debounceMs?: number
  ): Promise<boolean> {
    if (!debounceMs) {
      return true;
    }

    // Implementation would check last execution time for this event type
    // For now, return true (no debounce check)
    return true;
  }

  /**
   * Evaluate conditional trigger
   */
  private async evaluateConditionalTrigger(_trigger: any): Promise<boolean> {
    // Simple implementation - would need a proper expression evaluator
    // For now, return false (no conditions met)
    return false;
  }

  /**
   * Get last conditional check time
   */
  private async getLastConditionalCheck(_taskId: string, _trigger: TaskTrigger): Promise<number> {
    // Implementation would track last check times
    // For now, return 0 (never checked)
    return 0;
  }

  /**
   * Update last conditional check time
   */
  private async updateLastConditionalCheck(
    _taskId: string,
    _trigger: TaskTrigger,
    _timestamp: number
  ): Promise<void> {
    // Implementation would store last check times
  }

  /**
   * Check if command should be retried
   */
  private async shouldRetryCommand(
    command: TaskCommand,
    execution: TaskExecution
  ): Promise<boolean> {
    if (!command.retryPolicy) {
      return false;
    }

    const retryCount = execution.retryCount || 0;
    return retryCount < command.retryPolicy.maxAttempts;
  }

  /**
   * Schedule command retry
   */
  private async scheduleCommandRetry(
    task: Task,
    execution: TaskExecution,
    command: TaskCommand,
    implantId: string
  ): Promise<void> {
    if (!command.retryPolicy) {
      return;
    }

    const retryCount = (execution.retryCount || 0) + 1;
    let delayMs = command.retryPolicy.initialDelayMs;

    // Calculate delay based on retry strategy
    switch (command.retryPolicy.strategy) {
      case RetryStrategy.EXPONENTIAL_BACKOFF:
        delayMs = Math.min(
          command.retryPolicy.initialDelayMs *
            Math.pow(command.retryPolicy.backoffMultiplier || 2, retryCount - 1),
          command.retryPolicy.maxDelayMs || 300000
        );
        break;
      case RetryStrategy.LINEAR_BACKOFF:
        delayMs = Math.min(
          command.retryPolicy.initialDelayMs * retryCount,
          command.retryPolicy.maxDelayMs || 300000
        );
        break;
      case RetryStrategy.FIXED_DELAY:
      default:
        delayMs = command.retryPolicy.initialDelayMs;
        break;
    }

    const nextRetryAt = new Date(Date.now() + delayMs);

    await this.taskRepository.updateTaskExecution(execution.id, {
      retryCount,
      nextRetryAt,
    });

    // Schedule retry
    setTimeout(async () => {
      try {
        await this.executeTaskCommand(task, execution, command, implantId);
      } catch (error) {
        this.logger.error(
          'Command retry failed',
          error instanceof Error ? error : new Error('Unknown error'),
          {
            taskId: task.id,
            executionId: execution.id,
            commandId: command.id,
            retryCount,
          }
        );
      }
    }, delayMs);

    this.logger.info('Command retry scheduled', {
      taskId: task.id,
      executionId: execution.id,
      commandId: command.id,
      retryCount,
      nextRetryAt,
    });
  }

  /**
   * Get all active implant IDs
   */
  private async getAllActiveImplantIds(): Promise<string[]> {
    // This would query the implants table for active implants
    // For now, return empty array
    return [];
  }
}
