/**
 * Task Scheduler types and interfaces for SeraphC2
 * Implements requirements 15.1, 15.2, 15.3, 15.4 from the specification
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
  expression: string; // Standard cron expression (minute hour day month dayOfWeek)
  timezone?: string; // Optional timezone (defaults to server timezone)
}

export interface EventTrigger {
  type: EventTriggerType;
  conditions?: Record<string, any>; // Event-specific conditions
  debounceMs?: number; // Minimum time between trigger activations
}

export interface ConditionalTrigger {
  expression: string; // JavaScript-like expression for evaluation
  checkIntervalMs: number; // How often to check the condition
  variables?: Record<string, any>; // Variables available in the expression
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
  maxDelayMs?: number; // For exponential/linear backoff
  backoffMultiplier?: number; // For exponential backoff
  retryOnFailureCodes?: number[]; // Specific exit codes to retry on
}

export interface TaskCommand {
  id: string;
  type: string; // CommandType from entities.ts
  payload: string;
  timeout?: number; // Command timeout in milliseconds
  retryPolicy?: RetryPolicy;
  dependsOn?: string[]; // IDs of other commands this depends on
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
  result?: any; // CommandResult from entities.ts
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
  implantIds: string[]; // Target implants (empty array means all implants)
  tags?: string[];
  createdBy: string; // Operator ID
  createdAt: Date;
  updatedAt: Date;
  lastExecution?: Date;
  nextExecution?: Date;
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime?: number; // in milliseconds
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

export interface TaskSchedulerConfig {
  maxConcurrentTasks: number;
  taskTimeoutMs: number;
  cleanupIntervalMs: number;
  maxExecutionHistoryDays: number;
  enableEventTriggers: boolean;
  enableConditionalTriggers: boolean;
  conditionalCheckIntervalMs: number;
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

// Event interfaces for task scheduler events
export interface TaskSchedulerEvent {
  type: string;
  timestamp: Date;
  data: Record<string, any>;
}

export interface TaskCreatedEvent extends TaskSchedulerEvent {
  type: 'task_created';
  data: {
    taskId: string;
    taskName: string;
    createdBy: string;
  };
}

export interface TaskUpdatedEvent extends TaskSchedulerEvent {
  type: 'task_updated';
  data: {
    taskId: string;
    taskName: string;
    updatedBy: string;
    changes: string[];
  };
}

export interface TaskDeletedEvent extends TaskSchedulerEvent {
  type: 'task_deleted';
  data: {
    taskId: string;
    taskName: string;
    deletedBy: string;
  };
}

export interface TaskExecutionStartedEvent extends TaskSchedulerEvent {
  type: 'task_execution_started';
  data: {
    taskId: string;
    executionId: string;
    taskName: string;
    triggeredBy: TriggerType;
  };
}

export interface TaskExecutionCompletedEvent extends TaskSchedulerEvent {
  type: 'task_execution_completed';
  data: {
    taskId: string;
    executionId: string;
    taskName: string;
    status: TaskStatus;
    duration: number;
    commandsExecuted: number;
    commandsSucceeded: number;
    commandsFailed: number;
  };
}

export interface TaskExecutionFailedEvent extends TaskSchedulerEvent {
  type: 'task_execution_failed';
  data: {
    taskId: string;
    executionId: string;
    taskName: string;
    error: string;
    retryCount: number;
    willRetry: boolean;
    nextRetryAt?: Date;
  };
}
