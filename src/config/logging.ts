/**
 * SeraphC2 Logging Configuration
 * Production-ready logging configuration with security and compliance features
 */

export interface LoggingConfig {
  level: string;
  maxSize: string;
  maxFiles: string;
  retentionDays: number;
  enableConsole: boolean;
  enableHttp: boolean;
  httpEndpoint?: string;
  httpHost?: string;
  httpPort?: number;
  httpPath?: string;
  httpSsl?: boolean;
  enableSyslog: boolean;
  syslogHost?: string;
  syslogPort?: number;
  syslogProtocol?: 'udp' | 'tcp';
  enableElasticsearch: boolean;
  elasticsearchHost?: string;
  elasticsearchIndex?: string;
}

/**
 * Get logging configuration from environment variables
 */
export function getLoggingConfig(): LoggingConfig {
  const isProduction = process.env['NODE_ENV'] === 'production';

  return {
    level: process.env['LOG_LEVEL'] || (isProduction ? 'info' : 'debug'),
    maxSize: process.env['LOG_MAX_SIZE'] || '20m',
    maxFiles: process.env['LOG_MAX_FILES'] || '14d',
    retentionDays: parseInt(process.env['LOG_RETENTION_DAYS'] || '30'),
    enableConsole: process.env['LOG_ENABLE_CONSOLE'] !== 'false' && !isProduction,
    enableHttp: process.env['LOG_ENABLE_HTTP'] === 'true',
    httpEndpoint: process.env['LOG_HTTP_ENDPOINT'],
    httpHost: process.env['LOG_HTTP_HOST'] || 'localhost',
    httpPort: parseInt(process.env['LOG_HTTP_PORT'] || '80'),
    httpPath: process.env['LOG_HTTP_PATH'] || '/logs',
    httpSsl: process.env['LOG_HTTP_SSL'] === 'true',
    enableSyslog: process.env['LOG_ENABLE_SYSLOG'] === 'true',
    syslogHost: process.env['LOG_SYSLOG_HOST'] || 'localhost',
    syslogPort: parseInt(process.env['LOG_SYSLOG_PORT'] || '514'),
    syslogProtocol: (process.env['LOG_SYSLOG_PROTOCOL'] as 'udp' | 'tcp') || 'udp',
    enableElasticsearch: process.env['LOG_ENABLE_ELASTICSEARCH'] === 'true',
    elasticsearchHost: process.env['LOG_ELASTICSEARCH_HOST'] || 'http://localhost:9200',
    elasticsearchIndex: process.env['LOG_ELASTICSEARCH_INDEX'] || 'seraphc2-logs',
  };
}

/**
 * Validate logging configuration
 */
export function validateLoggingConfig(config: LoggingConfig): string[] {
  const errors: string[] = [];

  // Validate log level
  const validLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLevels.includes(config.level)) {
    errors.push(`Invalid log level: ${config.level}. Must be one of: ${validLevels.join(', ')}`);
  }

  // Validate retention days
  if (config.retentionDays < 1 || config.retentionDays > 365) {
    errors.push(`Invalid retention days: ${config.retentionDays}. Must be between 1 and 365`);
  }

  // Validate HTTP configuration
  if (config.enableHttp) {
    if (!config.httpHost) {
      errors.push('HTTP logging enabled but no host specified');
    }
    if (config.httpPort < 1 || config.httpPort > 65535) {
      errors.push(`Invalid HTTP port: ${config.httpPort}. Must be between 1 and 65535`);
    }
  }

  // Validate Syslog configuration
  if (config.enableSyslog) {
    if (!config.syslogHost) {
      errors.push('Syslog logging enabled but no host specified');
    }
    if (config.syslogPort < 1 || config.syslogPort > 65535) {
      errors.push(`Invalid Syslog port: ${config.syslogPort}. Must be between 1 and 65535`);
    }
    if (!['udp', 'tcp'].includes(config.syslogProtocol)) {
      errors.push(`Invalid Syslog protocol: ${config.syslogProtocol}. Must be 'udp' or 'tcp'`);
    }
  }

  // Validate Elasticsearch configuration
  if (config.enableElasticsearch) {
    if (!config.elasticsearchHost) {
      errors.push('Elasticsearch logging enabled but no host specified');
    }
    if (!config.elasticsearchIndex) {
      errors.push('Elasticsearch logging enabled but no index specified');
    }
  }

  return errors;
}

/**
 * Log rotation policies
 */
export const LOG_ROTATION_POLICIES = {
  DAILY: 'YYYY-MM-DD',
  HOURLY: 'YYYY-MM-DD-HH',
  WEEKLY: 'YYYY-[W]WW',
  MONTHLY: 'YYYY-MM',
} as const;

/**
 * Log levels with numeric values for filtering
 */
export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

/**
 * Security log event types
 */
export const SECURITY_EVENT_TYPES = {
  AUTHENTICATION_FAILURE: 'authentication_failure',
  AUTHENTICATION_SUCCESS: 'authentication_success',
  AUTHORIZATION_FAILURE: 'authorization_failure',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  BRUTE_FORCE_ATTEMPT: 'brute_force_attempt',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  DATA_ACCESS_VIOLATION: 'data_access_violation',
  CONFIGURATION_CHANGE: 'configuration_change',
  SECURITY_POLICY_VIOLATION: 'security_policy_violation',
} as const;

/**
 * Audit log event types
 */
export const AUDIT_EVENT_TYPES = {
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  ROLE_ASSIGNED: 'role_assigned',
  ROLE_REVOKED: 'role_revoked',
  PERMISSION_GRANTED: 'permission_granted',
  PERMISSION_REVOKED: 'permission_revoked',
  DATA_CREATED: 'data_created',
  DATA_UPDATED: 'data_updated',
  DATA_DELETED: 'data_deleted',
  DATA_EXPORTED: 'data_exported',
  SYSTEM_CONFIGURATION_CHANGED: 'system_configuration_changed',
} as const;

/**
 * Performance metric types
 */
export const PERFORMANCE_METRIC_TYPES = {
  HTTP_REQUEST: 'http_request',
  DATABASE_QUERY: 'database_query',
  CACHE_OPERATION: 'cache_operation',
  FILE_OPERATION: 'file_operation',
  NETWORK_OPERATION: 'network_operation',
  COMPUTATION: 'computation',
  MEMORY_USAGE: 'memory_usage',
  CPU_USAGE: 'cpu_usage',
} as const;
