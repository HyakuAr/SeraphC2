/**
 * Task Scheduler types for React client
 * Mirrors the server-side types for consistency
 */

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused',
}

export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum TriggerType {
  CRON = 'cron',
  EVENT = 'event',
  CONDITIONAL = 'conditional',
  MANUAL = 'manual',
}

export enum EventTriggerType {
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  NETWORK_CHANGE = 'network_change',
  FILE_MODIFIED = 'file_modified',
  PROCESS_STARTED = 'process_started',
  PROCESS_STOPPED = 'process_stopped',
  SYSTEM_STARTUP = 'system_startup',
  SYSTEM_SHUTDOWN = 'system_shutdown',
  IMPLANT_CONNECTED = 'implant_connected',
  IMPLANT_DISCONNECTED = 'implant_disconnected',
}

export enum RetryStrategy {
  NONE = 'none',
  FIXED_DELAY = 'fixed_delay',
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  LINEAR_BACKOFF = 'linear_backoff',
}

export interface CronSchedule {
  expression: string;
  timezone?: string;
}

export interface EventTrigger {
  type: EventTriggerType;
  conditions?: Record<string, any>;
  debounceMs?: number;
}

export interface ConditionalTrigger {
  expression: string;
  checkIntervalMs: number;
  variables?: Record<string, any>;
}

export interface TaskTrigger {
  type: TriggerType;
  cronSchedule?: CronSchedule;
  eventTrigger?: EventTrigger;
  conditionalTrigger?: ConditionalTrigger;
  isActive: boolean;
}

export interface RetryPolicy {
  strategy: RetryStrategy;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryOnFailureCodes?: number[];
}

export interface TaskCommand {
  id: string;
  type: string;
  payload: string;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  dependsOn?: string[];
}

export interface TaskExecution {
  id: string;
  taskId: string;
  startTime: Date;
  endTime?: Date;
  status: TaskStatus;
  triggeredBy: TriggerType;
  triggerData?: Record<string, any>;
  commands: TaskCommandExecution[];
  logs: TaskExecutionLog[];
  error?: string;
  retryCount: number;
  nextRetryAt?: Date;
}

export interface TaskCommandExecution {
  id: string;
  commandId: string;
  implantId: string;
  startTime: Date;
  endTime?: Date;
  status: TaskStatus;
  result?: any;
  error?: string;
  retryCount: number;
}

export interface TaskExecutionLog {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, any>;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  priority: TaskPriority;
  triggers: TaskTrigger[];
  commands: TaskCommand[];
  implantIds: string[];
  tags?: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastExecution?: Date;
  nextExecution?: Date;
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime?: number;
}

export interface TaskFilter {
  name?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  triggerType?: TriggerType;
  implantId?: string;
  createdBy?: string;
  tags?: string[];
  isActive?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  lastExecutionAfter?: Date;
  lastExecutionBefore?: Date;
}

export interface TaskListResponse {
  tasks: Task[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TaskExecutionListResponse {
  executions: TaskExecution[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateTaskData {
  name: string;
  description?: string;
  priority: TaskPriority;
  triggers: TaskTrigger[];
  commands: Omit<TaskCommand, 'id'>[];
  implantIds: string[];
  tags?: string[];
  isActive?: boolean;
}

export interface UpdateTaskData {
  name?: string;
  description?: string;
  priority?: TaskPriority;
  triggers?: TaskTrigger[];
  commands?: Omit<TaskCommand, 'id'>[];
  implantIds?: string[];
  tags?: string[];
  isActive?: boolean;
}

export interface TaskSchedulerStats {
  totalTasks: number;
  activeTasks: number;
  runningTasks: number;
  completedTasksToday: number;
  failedTasksToday: number;
  averageExecutionTime: number;
  uptime: number;
  lastCleanup?: Date;
}
