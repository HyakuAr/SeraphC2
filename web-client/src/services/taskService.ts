/**
 * Task Service - API client for task scheduler operations
 * Implements requirements 15.1, 15.2, 15.3, 15.4 from the SeraphC2 specification
 */

import { apiClient } from './apiClient';
import {
  Task,
  TaskExecution,
  CreateTaskData,
  UpdateTaskData,
  TaskFilter,
  TaskListResponse,
  TaskExecutionListResponse,
  TaskSchedulerStats,
  EventTriggerType,
} from '../types/task-scheduler';

export class TaskService {
  private static instance: TaskService;

  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  /**
   * Get all tasks with filtering and pagination
   */
  async getTasks(
    filter: TaskFilter = {},
    page: number = 1,
    pageSize: number = 50
  ): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());

    if (filter.name) params.append('name', filter.name);
    if (filter.priority) params.append('priority', filter.priority);
    if (filter.isActive !== undefined) params.append('isActive', filter.isActive.toString());
    if (filter.implantId) params.append('implantId', filter.implantId);
    if (filter.createdBy) params.append('createdBy', filter.createdBy);
    if (filter.tags && filter.tags.length > 0) params.append('tags', filter.tags.join(','));

    const response = await apiClient.get(`/api/tasks?${params.toString()}`);
    return response.data;
  }

  /**
   * Get task by ID
   */
  async getTask(id: string): Promise<Task> {
    const response = await apiClient.get(`/api/tasks/${id}`);
    return response.data;
  }

  /**
   * Create new task
   */
  async createTask(data: CreateTaskData): Promise<Task> {
    const response = await apiClient.post('/api/tasks', data);
    return response.data;
  }

  /**
   * Update task
   */
  async updateTask(id: string, data: UpdateTaskData): Promise<Task> {
    const response = await apiClient.put(`/api/tasks/${id}`, data);
    return response.data;
  }

  /**
   * Delete task
   */
  async deleteTask(id: string): Promise<void> {
    await apiClient.delete(`/api/tasks/${id}`);
  }

  /**
   * Execute task manually
   */
  async executeTask(id: string): Promise<TaskExecution> {
    const response = await apiClient.post(`/api/tasks/${id}/execute`);
    return response.data;
  }

  /**
   * Get task executions
   */
  async getTaskExecutions(
    taskId: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<TaskExecutionListResponse> {
    const response = await apiClient.get(
      `/api/tasks/${taskId}/executions?page=${page}&pageSize=${pageSize}`
    );
    return response.data;
  }

  /**
   * Pause task execution
   */
  async pauseTaskExecution(executionId: string): Promise<void> {
    await apiClient.post(`/api/tasks/executions/${executionId}/pause`);
  }

  /**
   * Resume task execution
   */
  async resumeTaskExecution(executionId: string): Promise<void> {
    await apiClient.post(`/api/tasks/executions/${executionId}/resume`);
  }

  /**
   * Cancel task execution
   */
  async cancelTaskExecution(executionId: string): Promise<void> {
    await apiClient.post(`/api/tasks/executions/${executionId}/cancel`);
  }

  /**
   * Trigger event
   */
  async triggerEvent(
    eventType: EventTriggerType,
    eventData: Record<string, any> = {}
  ): Promise<void> {
    await apiClient.post('/api/tasks/events/trigger', { eventType, eventData });
  }

  /**
   * Get scheduler statistics
   */
  async getSchedulerStats(): Promise<TaskSchedulerStats> {
    const response = await apiClient.get('/api/tasks/stats');
    return response.data;
  }
}

export const taskService = TaskService.getInstance();
