/**
 * TaskRepository - Data access layer for task scheduling system
 * Implements requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createErrorWithContext } from '../../types/errors';
import {
  Task,
  TaskExecution,
  TaskCommandExecution,
  TaskExecutionLog,
  CreateTaskData,
  UpdateTaskData,
  TaskFilter,
  TaskListResponse,
  TaskExecutionListResponse,
  TaskStatus,
  TriggerType,
  TaskPriority,
} from '../../types/task-scheduler';
import { Logger } from '../../utils/logger';

export class TaskRepository {
  private pool: Pool;
  private logger: Logger;

  constructor(pool: Pool) {
    this.pool = pool;
    this.logger = Logger.getInstance();
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskData, createdBy: string): Promise<Task> {
    const client = await this.pool.connect();
    try {
      const id = randomUUID();
      const commands = data.commands.map(cmd => ({ ...cmd, id: randomUUID() }));

      const query = `
        INSERT INTO tasks (
          id, name, description, is_active, priority, triggers, commands, 
          implant_ids, tags, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        id,
        data.name,
        data.description || null,
        data.isActive ?? true,
        data.priority,
        JSON.stringify(data.triggers),
        JSON.stringify(commands),
        JSON.stringify(data.implantIds),
        JSON.stringify(data.tags || []),
        createdBy,
      ];

      const result = await client.query(query, values);
      const task = this.mapRowToTask(result.rows[0]);

      this.logger.info('Task created', { taskId: id, taskName: data.name, createdBy });
      return task;
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { data, createdBy });
      this.logger.error('Failed to create task', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get task by ID
   */
  async getTaskById(id: string): Promise<Task | null> {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM tasks WHERE id = $1';
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToTask(result.rows[0]);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, {});
      this.logger.error('Failed to get task by ID', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get tasks with filtering and pagination
   */
  async getTasks(
    filter: TaskFilter = {},
    page: number = 1,
    pageSize: number = 50
  ): Promise<TaskListResponse> {
    const client = await this.pool.connect();
    try {
      const offset = (page - 1) * pageSize;
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build WHERE conditions
      if (filter.name) {
        conditions.push(`name ILIKE $${paramIndex}`);
        values.push(`%${filter.name}%`);
        paramIndex++;
      }

      if (filter.isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex}`);
        values.push(filter.isActive);
        paramIndex++;
      }

      if (filter.priority) {
        conditions.push(`priority = $${paramIndex}`);
        values.push(filter.priority);
        paramIndex++;
      }

      if (filter.createdBy) {
        conditions.push(`created_by = $${paramIndex}`);
        values.push(filter.createdBy);
        paramIndex++;
      }

      if (filter.implantId) {
        conditions.push(`implant_ids @> $${paramIndex}`);
        values.push(JSON.stringify([filter.implantId]));
        paramIndex++;
      }

      if (filter.tags && filter.tags.length > 0) {
        conditions.push(`tags ?| $${paramIndex}`);
        values.push(filter.tags);
        paramIndex++;
      }

      if (filter.createdAfter) {
        conditions.push(`created_at >= $${paramIndex}`);
        values.push(filter.createdAfter);
        paramIndex++;
      }

      if (filter.createdBefore) {
        conditions.push(`created_at <= $${paramIndex}`);
        values.push(filter.createdBefore);
        paramIndex++;
      }

      if (filter.lastExecutionAfter) {
        conditions.push(`last_execution >= $${paramIndex}`);
        values.push(filter.lastExecutionAfter);
        paramIndex++;
      }

      if (filter.lastExecutionBefore) {
        conditions.push(`last_execution <= $${paramIndex}`);
        values.push(filter.lastExecutionBefore);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM tasks ${whereClause}`;
      const countResult = await client.query(countQuery, values);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get tasks
      const tasksQuery = `
        SELECT * FROM tasks 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      values.push(pageSize, offset);

      const tasksResult = await client.query(tasksQuery, values);
      const tasks = tasksResult.rows.map(row => this.mapRowToTask(row));

      return {
        tasks,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { filter, page, pageSize });
      this.logger.error('Failed to get tasks', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update task
   */
  async updateTask(id: string, data: UpdateTaskData): Promise<Task | null> {
    const client = await this.pool.connect();
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        values.push(data.name);
        paramIndex++;
      }

      if (data.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        values.push(data.description);
        paramIndex++;
      }

      if (data.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        values.push(data.isActive);
        paramIndex++;
      }

      if (data.priority !== undefined) {
        updates.push(`priority = $${paramIndex}`);
        values.push(data.priority);
        paramIndex++;
      }

      if (data.triggers !== undefined) {
        updates.push(`triggers = $${paramIndex}`);
        values.push(JSON.stringify(data.triggers));
        paramIndex++;
      }

      if (data.commands !== undefined) {
        const commands = data.commands.map(cmd => ({ ...cmd, id: randomUUID() }));
        updates.push(`commands = $${paramIndex}`);
        values.push(JSON.stringify(commands));
        paramIndex++;
      }

      if (data.implantIds !== undefined) {
        updates.push(`implant_ids = $${paramIndex}`);
        values.push(JSON.stringify(data.implantIds));
        paramIndex++;
      }

      if (data.tags !== undefined) {
        updates.push(`tags = $${paramIndex}`);
        values.push(JSON.stringify(data.tags));
        paramIndex++;
      }

      if (updates.length === 0) {
        return await this.getTaskById(id);
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE tasks 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      const task = this.mapRowToTask(result.rows[0]);
      this.logger.info('Task updated', { taskId: id, updates: Object.keys(data) });
      return task;
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { data });
      this.logger.error('Failed to update task', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete task
   */
  async deleteTask(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const query = 'DELETE FROM tasks WHERE id = $1';
      const result = await client.query(query, [id]);

      const deleted = (result.rowCount || 0) > 0;
      if (deleted) {
        this.logger.info('Task deleted', { taskId: id });
      }

      return deleted;
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, {});
      this.logger.error('Failed to delete task', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update task next execution time
   */
  async updateTaskNextExecution(id: string, nextExecution: Date | null): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = 'UPDATE tasks SET next_execution = $1 WHERE id = $2';
      await client.query(query, [nextExecution, id]);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { nextExecution });
      this.logger.error('Failed to update task next execution', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get tasks ready for execution
   */
  async getTasksReadyForExecution(): Promise<Task[]> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT * FROM get_next_scheduled_tasks(100)
        JOIN tasks ON tasks.id = task_id
      `;

      const result = await client.query(query);
      return result.rows.map(row => this.mapRowToTask(row));
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, {});
      this.logger.error('Failed to get tasks ready for execution', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create task execution
   */
  async createTaskExecution(
    taskId: string,
    triggeredBy: TriggerType,
    triggerData?: Record<string, any>
  ): Promise<TaskExecution> {
    const client = await this.pool.connect();
    try {
      const id = randomUUID();

      const query = `
        INSERT INTO task_executions (id, task_id, triggered_by, trigger_data)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const values = [id, taskId, triggeredBy, JSON.stringify(triggerData || {})];
      const result = await client.query(query, values);

      return this.mapRowToTaskExecution(result.rows[0]);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { taskId, triggeredBy });
      this.logger.error('Failed to create task execution', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update task execution
   */
  async updateTaskExecution(
    id: string,
    updates: {
      status?: TaskStatus;
      endTime?: Date;
      error?: string;
      retryCount?: number;
      nextRetryAt?: Date;
    }
  ): Promise<TaskExecution | null> {
    const client = await this.pool.connect();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        updateFields.push(`status = $${paramIndex}`);
        values.push(updates.status);
        paramIndex++;
      }

      if (updates.endTime !== undefined) {
        updateFields.push(`end_time = $${paramIndex}`);
        values.push(updates.endTime);
        paramIndex++;
      }

      if (updates.error !== undefined) {
        updateFields.push(`error = $${paramIndex}`);
        values.push(updates.error);
        paramIndex++;
      }

      if (updates.retryCount !== undefined) {
        updateFields.push(`retry_count = $${paramIndex}`);
        values.push(updates.retryCount);
        paramIndex++;
      }

      if (updates.nextRetryAt !== undefined) {
        updateFields.push(`next_retry_at = $${paramIndex}`);
        values.push(updates.nextRetryAt);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        return await this.getTaskExecutionById(id);
      }

      values.push(id);

      const query = `
        UPDATE task_executions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToTaskExecution(result.rows[0]);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { updates });
      this.logger.error('Failed to update task execution', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get task execution by ID
   */
  async getTaskExecutionById(id: string): Promise<TaskExecution | null> {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT * FROM task_executions WHERE id = $1';
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const execution = this.mapRowToTaskExecution(result.rows[0]);

      // Get command executions
      const commandsQuery =
        'SELECT * FROM task_command_executions WHERE execution_id = $1 ORDER BY created_at';
      const commandsResult = await client.query(commandsQuery, [id]);
      execution.commands = commandsResult.rows.map(row => this.mapRowToTaskCommandExecution(row));

      // Get logs
      const logsQuery =
        'SELECT * FROM task_execution_logs WHERE execution_id = $1 ORDER BY timestamp';
      const logsResult = await client.query(logsQuery, [id]);
      execution.logs = logsResult.rows.map(row => this.mapRowToTaskExecutionLog(row));

      return execution;
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, {});
      this.logger.error('Failed to get task execution by ID', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get task executions with filtering and pagination
   */
  async getTaskExecutions(
    taskId?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<TaskExecutionListResponse> {
    const client = await this.pool.connect();
    try {
      const offset = (page - 1) * pageSize;
      const whereClause = taskId ? 'WHERE task_id = $1' : '';
      const values: any[] = taskId ? [taskId] : [];

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM task_executions ${whereClause}`;
      const countResult = await client.query(countQuery, values);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get executions
      const executionsQuery = `
        SELECT * FROM task_executions 
        ${whereClause}
        ORDER BY start_time DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `;
      values.push(pageSize, offset);

      const executionsResult = await client.query(executionsQuery, values);
      const executions = executionsResult.rows.map(row => this.mapRowToTaskExecution(row));

      return {
        executions,
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      };
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { taskId, page, pageSize });
      this.logger.error('Failed to get task executions', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add execution log
   */
  async addExecutionLog(
    executionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const query = `
        INSERT INTO task_execution_logs (execution_id, level, message, data)
        VALUES ($1, $2, $3, $4)
      `;

      const values = [executionId, level, message, JSON.stringify(data || {})];
      await client.query(query, values);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { executionId, level, message });
      this.logger.error('Failed to add execution log', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up old task executions
   */
  async cleanupOldExecutions(retentionDays: number = 30): Promise<number> {
    const client = await this.pool.connect();
    try {
      const query = 'SELECT cleanup_old_task_executions($1)';
      const result = await client.query(query, [retentionDays]);
      return result.rows[0].cleanup_old_task_executions;
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { retentionDays });
      this.logger.error('Failed to cleanup old executions', errorWithContext);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Map database row to Task object
   */
  private mapRowToTask(row: any): Task {
    const task: Task = {
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      priority: row.priority as TaskPriority,
      triggers: JSON.parse(row.triggers || '[]'),
      commands: JSON.parse(row.commands || '[]'),
      implantIds: JSON.parse(row.implant_ids || '[]'),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executionCount: row.execution_count || 0,
      successCount: row.success_count || 0,
      failureCount: row.failure_count || 0,
    };

    if (row.description) task.description = row.description;
    if (row.tags) task.tags = JSON.parse(row.tags);
    if (row.last_execution) task.lastExecution = new Date(row.last_execution);
    if (row.next_execution) task.nextExecution = new Date(row.next_execution);
    if (row.average_execution_time) task.averageExecutionTime = row.average_execution_time;

    return task;
  }

  /**
   * Map database row to TaskExecution object
   */
  private mapRowToTaskExecution(row: any): TaskExecution {
    const execution: TaskExecution = {
      id: row.id,
      taskId: row.task_id,
      startTime: new Date(row.start_time),
      status: row.status as TaskStatus,
      triggeredBy: row.triggered_by as TriggerType,
      commands: [], // Will be populated separately
      logs: [], // Will be populated separately
      retryCount: row.retry_count || 0,
    };

    if (row.end_time) execution.endTime = new Date(row.end_time);
    if (row.trigger_data) execution.triggerData = JSON.parse(row.trigger_data);
    if (row.error) execution.error = row.error;
    if (row.next_retry_at) execution.nextRetryAt = new Date(row.next_retry_at);

    return execution;
  }

  /**
   * Map database row to TaskCommandExecution object
   */
  private mapRowToTaskCommandExecution(row: any): TaskCommandExecution {
    const commandExecution: TaskCommandExecution = {
      id: row.id,
      commandId: row.command_id,
      implantId: row.implant_id,
      startTime: new Date(row.start_time),
      status: row.status as TaskStatus,
      retryCount: row.retry_count || 0,
    };

    if (row.end_time) commandExecution.endTime = new Date(row.end_time);
    if (row.result) commandExecution.result = JSON.parse(row.result);
    if (row.error) commandExecution.error = row.error;

    return commandExecution;
  }

  /**
   * Map database row to TaskExecutionLog object
   */
  private mapRowToTaskExecutionLog(row: any): TaskExecutionLog {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      level: row.level as 'debug' | 'info' | 'warn' | 'error',
      message: row.message,
      data: JSON.parse(row.data || '{}'),
    };
  }
}
