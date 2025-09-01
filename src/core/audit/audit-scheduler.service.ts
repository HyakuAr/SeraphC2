/**
 * Audit Scheduler Service
 * Handles scheduled audit-related tasks like retention policy application
 */

import { AuditService } from './audit.service';
import { Logger } from '../../utils/logger';

export class AuditSchedulerService {
  private static instance: AuditSchedulerService;
  private auditService: AuditService;
  private logger: Logger;
  private retentionInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  private constructor() {
    this.auditService = AuditService.getInstance();
    this.logger = Logger.getInstance();
  }

  public static getInstance(): AuditSchedulerService {
    if (!AuditSchedulerService.instance) {
      AuditSchedulerService.instance = new AuditSchedulerService();
    }
    return AuditSchedulerService.instance;
  }

  /**
   * Start the audit scheduler
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('Audit scheduler is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting audit scheduler service');

    // Schedule retention policy application (daily at 2 AM)
    this.scheduleRetentionPolicy();

    // Schedule audit statistics cleanup (weekly)
    this.scheduleStatisticsCleanup();

    this.logger.info('Audit scheduler service started successfully');
  }

  /**
   * Stop the audit scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.retentionInterval) {
      clearInterval(this.retentionInterval);
      this.retentionInterval = null;
    }

    this.logger.info('Audit scheduler service stopped');
  }

  /**
   * Schedule daily retention policy application
   */
  private scheduleRetentionPolicy(): void {
    // Calculate milliseconds until next 2 AM
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);

    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    const msUntil2AM = next2AM.getTime() - now.getTime();

    // Set initial timeout to 2 AM, then repeat every 24 hours
    setTimeout(() => {
      this.applyRetentionPolicy();

      // Set up daily interval
      this.retentionInterval = setInterval(
        () => {
          this.applyRetentionPolicy();
        },
        24 * 60 * 60 * 1000
      ); // 24 hours
    }, msUntil2AM);

    this.logger.info(
      `Retention policy scheduled to run at 2 AM (next run: ${next2AM.toISOString()})`
    );
  }

  /**
   * Schedule weekly statistics cleanup
   */
  private scheduleStatisticsCleanup(): void {
    // Run statistics cleanup every Sunday at 3 AM
    const runCleanup = () => {
      const now = new Date();
      if (now.getDay() === 0 && now.getHours() === 3) {
        // Sunday at 3 AM
        this.cleanupStatistics();
      }
    };

    // Check every hour
    setInterval(runCleanup, 60 * 60 * 1000);
  }

  /**
   * Apply retention policy
   */
  private async applyRetentionPolicy(): Promise<void> {
    try {
      this.logger.info('Applying audit retention policy');

      const deletedCount = await this.auditService.applyRetentionPolicy();

      this.logger.info(`Retention policy applied: deleted ${deletedCount} old audit logs`);

      // Log the retention policy application
      await this.auditService.logEvent({
        action: 'scheduled_retention_policy',
        resourceType: 'audit',
        details: {
          deletedCount,
          scheduledExecution: true,
        },
        success: true,
      });
    } catch (error) {
      this.logger.error(
        'Failed to apply retention policy',
        error instanceof Error ? error : new Error('Unknown error')
      );

      await this.auditService.logEvent({
        action: 'scheduled_retention_policy',
        resourceType: 'audit',
        details: {
          scheduledExecution: true,
        },
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Cleanup old statistics and optimize database
   */
  private async cleanupStatistics(): Promise<void> {
    try {
      this.logger.info('Running audit statistics cleanup');

      // This could include database optimization, index maintenance, etc.
      // For now, we'll just log the event
      await this.auditService.logEvent({
        action: 'scheduled_statistics_cleanup',
        resourceType: 'audit',
        details: {
          scheduledExecution: true,
        },
        success: true,
      });

      this.logger.info('Audit statistics cleanup completed');
    } catch (error) {
      this.logger.error(
        'Failed to cleanup audit statistics',
        error instanceof Error ? error : new Error('Unknown error')
      );

      await this.auditService.logEvent({
        action: 'scheduled_statistics_cleanup',
        resourceType: 'audit',
        details: {
          scheduledExecution: true,
        },
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    nextRetentionRun?: Date;
  } {
    const status = {
      isRunning: this.isRunning,
    };

    if (this.isRunning) {
      // Calculate next 2 AM
      const next2AM = new Date();
      next2AM.setHours(2, 0, 0, 0);
      if (next2AM <= new Date()) {
        next2AM.setDate(next2AM.getDate() + 1);
      }

      return {
        ...status,
        nextRetentionRun: next2AM,
      };
    }

    return status;
  }
}
