/**
 * Comprehensive Audit Service
 * Provides structured logging and audit trail functionality for all SeraphC2 operations
 */

import {
  AuditLogRepository,
  CreateAuditLogData,
  AuditLog,
  AuditLogFilter,
} from '../repositories/audit-log.repository';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';

export interface AuditEvent {
  operatorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId?: string | undefined;
  details?: Record<string, any> | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  success?: boolean | undefined;
  errorMessage?: string | undefined;
  timestamp?: Date | undefined;
}

export interface CommandAuditData {
  implantId: string;
  command: string;
  commandType: string;
  executionTime?: number;
  output?: string;
  exitCode?: number;
}

export interface FileOperationAuditData {
  implantId: string;
  operation: 'upload' | 'download' | 'delete' | 'rename' | 'copy' | 'move';
  sourcePath?: string;
  targetPath?: string;
  fileSize?: number;
  checksum?: string;
}

export interface AuthenticationAuditData {
  username?: string;
  authMethod: 'password' | 'mfa' | 'api_key' | 'certificate';
  sessionId?: string;
  failureReason?: string;
}

export interface SystemAuditData {
  component: string;
  operation: string;
  configuration?: Record<string, any>;
  previousValue?: any;
  newValue?: any;
}

export class AuditService extends EventEmitter {
  private static instance: AuditService;
  private auditRepository: AuditLogRepository;
  private logger: Logger;
  private retentionPolicyDays: number;
  private isEnabled: boolean;

  private constructor() {
    super();
    this.auditRepository = new AuditLogRepository();
    this.logger = Logger.getInstance();
    this.retentionPolicyDays = parseInt(process.env['AUDIT_RETENTION_DAYS'] || '365');
    this.isEnabled = process.env['AUDIT_ENABLED'] !== 'false';
  }

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log a general audit event
   */
  async logEvent(event: AuditEvent): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const auditData: CreateAuditLogData = {
        action: event.action,
        resourceType: event.resourceType,
        details: {
          ...event.details,
          timestamp: event.timestamp || new Date(),
        },
        success: event.success !== false,
      };

      if (event.operatorId) auditData.operatorId = event.operatorId;
      if (event.resourceId) auditData.resourceId = event.resourceId;
      if (event.ipAddress) auditData.ipAddress = event.ipAddress;
      if (event.userAgent) auditData.userAgent = event.userAgent;
      if (event.errorMessage) auditData.errorMessage = event.errorMessage;

      const auditLog = await this.auditRepository.create(auditData);

      // Emit event for real-time monitoring
      this.emit('audit_logged', auditLog);

      // Log to structured logger as well
      this.logger.audit(event.operatorId || 'system', event.action, event.resourceId, {
        resourceType: event.resourceType,
        success: event.success !== false,
        ...event.details,
      });
    } catch (error) {
      this.logger.error('Failed to log audit event', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        event,
      });
    }
  }

  /**
   * Log authentication events
   */
  async logAuthentication(
    operatorId: string | undefined,
    action: 'login' | 'logout' | 'login_failed' | 'mfa_challenge' | 'mfa_success' | 'mfa_failed',
    data: AuthenticationAuditData,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      operatorId,
      action: `auth_${action}`,
      resourceType: 'authentication',
      resourceId: data.sessionId,
      details: {
        username: data.username,
        authMethod: data.authMethod,
        failureReason: data.failureReason,
      },
      ipAddress,
      userAgent,
      success: !action.includes('failed'),
    });
  }

  /**
   * Log command execution events
   */
  async logCommandExecution(
    operatorId: string,
    _implantId: string,
    commandId: string,
    data: CommandAuditData,
    success: boolean,
    errorMessage?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      operatorId,
      action: 'execute_command',
      resourceType: 'command',
      resourceId: commandId,
      details: {
        implantId: data.implantId,
        command: data.command,
        commandType: data.commandType,
        executionTime: data.executionTime,
        outputLength: data.output?.length,
        exitCode: data.exitCode,
        // Don't log full output for security/size reasons
        hasOutput: !!data.output,
      },
      ipAddress,
      userAgent,
      success,
      errorMessage,
    });
  }

  /**
   * Log file operation events
   */
  async logFileOperation(
    operatorId: string,
    data: FileOperationAuditData,
    success: boolean,
    errorMessage?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      operatorId,
      action: `file_${data.operation}`,
      resourceType: 'file',
      resourceId: data.targetPath || data.sourcePath,
      details: {
        implantId: data.implantId,
        operation: data.operation,
        sourcePath: data.sourcePath,
        targetPath: data.targetPath,
        fileSize: data.fileSize,
        checksum: data.checksum,
      },
      ipAddress,
      userAgent,
      success,
      errorMessage,
    });
  }

  /**
   * Log system configuration changes
   */
  async logSystemChange(
    operatorId: string,
    data: SystemAuditData,
    success: boolean,
    errorMessage?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      operatorId,
      action: `system_${data.operation}`,
      resourceType: 'system',
      resourceId: data.component,
      details: {
        component: data.component,
        operation: data.operation,
        configuration: data.configuration,
        previousValue: data.previousValue,
        newValue: data.newValue,
      },
      ipAddress,
      userAgent,
      success,
      errorMessage,
    });
  }

  /**
   * Log implant events
   */
  async logImplantEvent(
    operatorId: string | undefined,
    implantId: string,
    action: 'connect' | 'disconnect' | 'heartbeat' | 'register' | 'update' | 'delete',
    details?: Record<string, any>,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    await this.logEvent({
      operatorId,
      action: `implant_${action}`,
      resourceType: 'implant',
      resourceId: implantId,
      details: {
        implantId,
        ...details,
      },
      success,
      errorMessage,
    });
  }

  /**
   * Search audit logs with advanced filtering
   */
  async searchLogs(filter: AuditLogFilter): Promise<{
    logs: AuditLog[];
    totalCount: number;
    hasMore: boolean;
  }> {
    const logs = await this.auditRepository.findMany(filter);

    // Get total count for pagination
    const countFilter = { ...filter };
    delete countFilter.limit;
    delete countFilter.offset;
    const allLogs = await this.auditRepository.findMany(countFilter);

    return {
      logs,
      totalCount: allLogs.length,
      hasMore: logs.length === (filter.limit || 100),
    };
  }

  /**
   * Get audit statistics
   */
  async getStatistics(filter?: AuditLogFilter): Promise<{
    totalLogs: number;
    successfulActions: number;
    failedActions: number;
    uniqueOperators: number;
    topActions: Array<{ action: string; count: number }>;
    activityByHour: Array<{ hour: number; count: number }>;
    errorRate: number;
  }> {
    const stats = await this.auditRepository.getStatistics(filter);

    // Calculate additional metrics
    const errorRate = stats.totalLogs > 0 ? (stats.failedActions / stats.totalLogs) * 100 : 0;

    // Get activity by hour (last 24 hours)
    const activityByHour = await this.getActivityByHour();

    return {
      ...stats,
      activityByHour,
      errorRate: Math.round(errorRate * 100) / 100,
    };
  }

  /**
   * Apply retention policy - delete old logs
   */
  async applyRetentionPolicy(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionPolicyDays);

    const deletedCount = await this.auditRepository.deleteOlderThan(cutoffDate);

    if (deletedCount > 0) {
      this.logger.info(`Audit retention policy applied: deleted ${deletedCount} old audit logs`, {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: this.retentionPolicyDays,
      });
    }

    return deletedCount;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string | Record<string, any>> {
    const filter: AuditLogFilter = {
      startDate,
      endDate,
      limit: 10000, // Large limit for reports
    };

    const { logs, totalCount } = await this.searchLogs(filter);
    const statistics = await this.getStatistics(filter);

    const report = {
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        totalRecords: totalCount,
        format,
      },
      summary: {
        totalActions: statistics.totalLogs,
        successfulActions: statistics.successfulActions,
        failedActions: statistics.failedActions,
        errorRate: statistics.errorRate,
        uniqueOperators: statistics.uniqueOperators,
        topActions: statistics.topActions,
      },
      auditTrail: logs.map(log => ({
        timestamp: log.createdAt.toISOString(),
        operator: log.operatorId || 'system',
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        success: log.success,
        ipAddress: log.ipAddress,
        details: log.details,
        errorMessage: log.errorMessage,
      })),
    };

    if (format === 'csv') {
      return this.convertReportToCSV(report);
    }

    return report;
  }

  /**
   * Get activity by hour for the last 24 hours
   */
  private async getActivityByHour(): Promise<Array<{ hour: number; count: number }>> {
    // This would need a custom query - simplified implementation
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const logs = await this.auditRepository.findMany({
      startDate: last24Hours,
      limit: 10000,
    });

    const hourlyActivity = new Array(24).fill(0).map((_, index) => ({
      hour: index,
      count: 0,
    }));

    logs.forEach(log => {
      const hour = log.createdAt.getHours();
      if (hourlyActivity[hour]) {
        hourlyActivity[hour].count++;
      }
    });

    return hourlyActivity;
  }

  /**
   * Convert report to CSV format
   */
  private convertReportToCSV(report: any): string {
    const headers = [
      'Timestamp',
      'Operator',
      'Action',
      'Resource Type',
      'Resource ID',
      'Success',
      'IP Address',
      'Error Message',
      'Details',
    ];

    const rows = report.auditTrail.map((entry: any) => [
      entry.timestamp,
      entry.operator,
      entry.action,
      entry.resourceType,
      entry.resourceId || '',
      entry.success ? 'Yes' : 'No',
      entry.ipAddress || '',
      entry.errorMessage || '',
      JSON.stringify(entry.details || {}),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) =>
        row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csvContent;
  }

  /**
   * Enable or disable audit logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.logger.info(`Audit logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update retention policy
   */
  setRetentionPolicy(days: number): void {
    if (days < 1) {
      throw new Error('Retention policy must be at least 1 day');
    }
    this.retentionPolicyDays = days;
    this.logger.info(`Audit retention policy updated to ${days} days`);
  }

  /**
   * Get current configuration
   */
  getConfiguration(): {
    enabled: boolean;
    retentionDays: number;
  } {
    return {
      enabled: this.isEnabled,
      retentionDays: this.retentionPolicyDays,
    };
  }
}
