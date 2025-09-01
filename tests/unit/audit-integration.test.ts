/**
 * Audit Integration Unit Tests
 * Tests for audit service integration without full app setup
 */

import { AuditService } from '../../src/core/audit/audit.service';
import { AuditSchedulerService } from '../../src/core/audit/audit-scheduler.service';

// Mock dependencies
jest.mock('../../src/core/repositories/audit-log.repository', () => ({
  AuditLogRepository: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({ id: 'test-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    getStatistics: jest.fn().mockResolvedValue({
      totalLogs: 100,
      successfulActions: 90,
      failedActions: 10,
      uniqueOperators: 5,
      topActions: [{ action: 'login', count: 50 }],
    }),
    deleteOlderThan: jest.fn().mockResolvedValue(25),
  })),
}));

jest.mock('../../src/utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      audit: jest.fn(),
      performance: jest.fn(),
      security: jest.fn(),
    })),
  },
}));

describe('Audit Integration', () => {
  let auditService: AuditService;
  let auditScheduler: AuditSchedulerService;

  beforeEach(() => {
    // Reset singleton instances
    (AuditService as any).instance = undefined;
    (AuditSchedulerService as any).instance = undefined;

    auditService = AuditService.getInstance();
    auditScheduler = AuditSchedulerService.getInstance();
  });

  afterEach(() => {
    auditScheduler.stop();
    jest.clearAllMocks();
  });

  describe('AuditService and AuditSchedulerService integration', () => {
    it('should create singleton instances', () => {
      const service1 = AuditService.getInstance();
      const service2 = AuditService.getInstance();
      expect(service1).toBe(service2);

      const scheduler1 = AuditSchedulerService.getInstance();
      const scheduler2 = AuditSchedulerService.getInstance();
      expect(scheduler1).toBe(scheduler2);
    });

    it('should start and stop scheduler', () => {
      expect(auditScheduler.getStatus().isRunning).toBe(false);

      auditScheduler.start();
      expect(auditScheduler.getStatus().isRunning).toBe(true);

      auditScheduler.stop();
      expect(auditScheduler.getStatus().isRunning).toBe(false);
    });

    it('should not start scheduler twice', () => {
      auditScheduler.start();
      expect(auditScheduler.getStatus().isRunning).toBe(true);

      // Starting again should not cause issues
      auditScheduler.start();
      expect(auditScheduler.getStatus().isRunning).toBe(true);
    });

    it('should provide scheduler status with next run time when running', () => {
      auditScheduler.start();
      const status = auditScheduler.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.nextRetentionRun).toBeInstanceOf(Date);
    });

    it('should handle audit service configuration changes', () => {
      const initialConfig = auditService.getConfiguration();
      expect(initialConfig.enabled).toBe(true);
      expect(initialConfig.retentionDays).toBe(365);

      auditService.setEnabled(false);
      expect(auditService.getConfiguration().enabled).toBe(false);

      auditService.setRetentionPolicy(180);
      expect(auditService.getConfiguration().retentionDays).toBe(180);
    });

    it('should validate retention policy constraints', () => {
      expect(() => auditService.setRetentionPolicy(0)).toThrow(
        'Retention policy must be at least 1 day'
      );

      expect(() => auditService.setRetentionPolicy(-1)).toThrow(
        'Retention policy must be at least 1 day'
      );

      // Valid values should work
      expect(() => auditService.setRetentionPolicy(1)).not.toThrow();
      expect(() => auditService.setRetentionPolicy(365)).not.toThrow();
    });
  });

  describe('Event logging integration', () => {
    it('should log different types of events', async () => {
      // Test authentication event
      await expect(
        auditService.logAuthentication(
          'operator-1',
          'login',
          {
            username: 'testuser',
            authMethod: 'password',
            sessionId: 'session-1',
          },
          '192.168.1.1',
          'Mozilla/5.0'
        )
      ).resolves.not.toThrow();

      // Test command execution event
      await expect(
        auditService.logCommandExecution(
          'operator-1',
          'implant-1',
          'command-1',
          {
            implantId: 'implant-1',
            command: 'whoami',
            commandType: 'shell',
            executionTime: 100,
          },
          true,
          undefined,
          '192.168.1.1',
          'Mozilla/5.0'
        )
      ).resolves.not.toThrow();

      // Test file operation event
      await expect(
        auditService.logFileOperation(
          'operator-1',
          {
            implantId: 'implant-1',
            operation: 'upload',
            sourcePath: '/local/file.txt',
            targetPath: 'C:\\temp\\file.txt',
            fileSize: 1024,
          },
          true,
          undefined,
          '192.168.1.1',
          'Mozilla/5.0'
        )
      ).resolves.not.toThrow();

      // Test system change event
      await expect(
        auditService.logSystemChange(
          'operator-1',
          {
            component: 'audit',
            operation: 'configuration_update',
            configuration: { enabled: true },
            previousValue: { enabled: false },
            newValue: { enabled: true },
          },
          true,
          undefined,
          '192.168.1.1',
          'Mozilla/5.0'
        )
      ).resolves.not.toThrow();

      // Test implant event
      await expect(
        auditService.logImplantEvent(
          'operator-1',
          'implant-1',
          'connect',
          { hostname: 'test-host' },
          true
        )
      ).resolves.not.toThrow();
    });

    it('should handle disabled audit logging', async () => {
      auditService.setEnabled(false);

      // Events should not throw when audit is disabled
      await expect(
        auditService.logEvent({
          action: 'test_action',
          resourceType: 'test_resource',
          success: true,
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Compliance and reporting integration', () => {
    it('should generate compliance reports in different formats', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      // Test JSON report
      const jsonReport = await auditService.generateComplianceReport(startDate, endDate, 'json');

      expect(typeof jsonReport).toBe('object');
      expect(jsonReport).toHaveProperty('reportMetadata');
      expect(jsonReport).toHaveProperty('summary');
      expect(jsonReport).toHaveProperty('auditTrail');

      // Test CSV report
      const csvReport = await auditService.generateComplianceReport(startDate, endDate, 'csv');

      expect(typeof csvReport).toBe('string');
      expect(csvReport).toContain('Timestamp,Operator,Action');
    });

    it('should apply retention policy', async () => {
      const deletedCount = await auditService.applyRetentionPolicy();
      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should get audit statistics', async () => {
      const stats = await auditService.getStatistics();

      expect(stats).toHaveProperty('totalLogs');
      expect(stats).toHaveProperty('successfulActions');
      expect(stats).toHaveProperty('failedActions');
      expect(stats).toHaveProperty('uniqueOperators');
      expect(stats).toHaveProperty('topActions');
      expect(stats).toHaveProperty('activityByHour');
      expect(stats).toHaveProperty('errorRate');

      expect(Array.isArray(stats.topActions)).toBe(true);
      expect(Array.isArray(stats.activityByHour)).toBe(true);
      expect(stats.activityByHour).toHaveLength(24);
      expect(typeof stats.errorRate).toBe('number');
    });
  });
});
