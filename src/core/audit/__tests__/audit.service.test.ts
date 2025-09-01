/**
 * Audit Service Tests
 * Tests for comprehensive audit logging and trail functionality
 */

import { AuditService, AuditEvent } from '../audit.service';
import { AuditLogRepository } from '../../repositories/audit-log.repository';
import { Logger } from '../../../utils/logger';

// Mock dependencies
jest.mock('../../repositories/audit-log.repository');
jest.mock('../../../utils/logger');

describe('AuditService', () => {
  let auditService: AuditService;
  let mockAuditRepository: jest.Mocked<AuditLogRepository>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Reset singleton instance
    (AuditService as any).instance = undefined;

    mockAuditRepository = {
      create: jest.fn(),
      findMany: jest.fn(),
      getStatistics: jest.fn(),
      deleteOlderThan: jest.fn(),
    } as any;

    mockLogger = {
      audit: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    } as any;

    // Mock the constructor dependencies
    jest
      .spyOn(AuditLogRepository.prototype, 'create')
      .mockImplementation(mockAuditRepository.create);
    jest
      .spyOn(AuditLogRepository.prototype, 'findMany')
      .mockImplementation(mockAuditRepository.findMany);
    jest
      .spyOn(AuditLogRepository.prototype, 'getStatistics')
      .mockImplementation(mockAuditRepository.getStatistics);
    jest
      .spyOn(AuditLogRepository.prototype, 'deleteOlderThan')
      .mockImplementation(mockAuditRepository.deleteOlderThan);

    jest.spyOn(Logger, 'getInstance').mockReturnValue(mockLogger);

    auditService = AuditService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AuditService.getInstance();
      const instance2 = AuditService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('logEvent', () => {
    it('should log audit event successfully', async () => {
      const mockAuditLog = {
        id: 'test-id',
        operatorId: 'operator-1',
        action: 'test_action',
        resourceType: 'test_resource',
        success: true,
        createdAt: new Date(),
      };

      mockAuditRepository.create.mockResolvedValue(mockAuditLog as any);

      const event: AuditEvent = {
        operatorId: 'operator-1',
        action: 'test_action',
        resourceType: 'test_resource',
        resourceId: 'resource-1',
        details: { key: 'value' },
        success: true,
      };

      await auditService.logEvent(event);

      expect(mockAuditRepository.create).toHaveBeenCalledWith({
        operatorId: 'operator-1',
        action: 'test_action',
        resourceType: 'test_resource',
        resourceId: 'resource-1',
        details: expect.objectContaining({
          key: 'value',
          timestamp: expect.any(Date),
        }),
        ipAddress: undefined,
        userAgent: undefined,
        success: true,
        errorMessage: undefined,
      });

      expect(mockLogger.audit).toHaveBeenCalledWith(
        'operator-1',
        'test_action',
        'resource-1',
        expect.objectContaining({
          resourceType: 'test_resource',
          success: true,
          key: 'value',
        })
      );
    });

    it('should handle audit logging errors gracefully', async () => {
      const error = new Error('Database error');
      mockAuditRepository.create.mockRejectedValue(error);

      const event: AuditEvent = {
        action: 'test_action',
        resourceType: 'test_resource',
        success: true,
      };

      await expect(auditService.logEvent(event)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log audit event',
        expect.objectContaining({
          error: 'Database error',
          event,
        })
      );
    });

    it('should skip logging when disabled', async () => {
      auditService.setEnabled(false);

      const event: AuditEvent = {
        action: 'test_action',
        resourceType: 'test_resource',
        success: true,
      };

      await auditService.logEvent(event);

      expect(mockAuditRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('logAuthentication', () => {
    it('should log successful login', async () => {
      const mockAuditLog = { id: 'test-id' };
      mockAuditRepository.create.mockResolvedValue(mockAuditLog as any);

      await auditService.logAuthentication(
        'operator-1',
        'login',
        {
          username: 'testuser',
          authMethod: 'password',
          sessionId: 'session-1',
        },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: 'operator-1',
          action: 'auth_login',
          resourceType: 'authentication',
          resourceId: 'session-1',
          details: expect.objectContaining({
            username: 'testuser',
            authMethod: 'password',
            timestamp: expect.any(Date),
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
        })
      );
    });

    it('should log failed login attempt', async () => {
      const mockAuditLog = { id: 'test-id' };
      mockAuditRepository.create.mockResolvedValue(mockAuditLog as any);

      await auditService.logAuthentication(
        undefined,
        'login_failed',
        {
          username: 'testuser',
          authMethod: 'password',
          failureReason: 'Invalid credentials',
        },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth_login_failed',
          resourceType: 'authentication',
          details: expect.objectContaining({
            username: 'testuser',
            authMethod: 'password',
            failureReason: 'Invalid credentials',
            timestamp: expect.any(Date),
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: false,
        })
      );
    });
  });

  describe('logCommandExecution', () => {
    it('should log successful command execution', async () => {
      const mockAuditLog = { id: 'test-id' };
      mockAuditRepository.create.mockResolvedValue(mockAuditLog as any);

      await auditService.logCommandExecution(
        'operator-1',
        'implant-1',
        'command-1',
        {
          implantId: 'implant-1',
          command: 'whoami',
          commandType: 'shell',
          executionTime: 150,
          output: 'DOMAIN\\user',
          exitCode: 0,
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: 'operator-1',
          action: 'execute_command',
          resourceType: 'command',
          resourceId: 'command-1',
          details: expect.objectContaining({
            implantId: 'implant-1',
            command: 'whoami',
            commandType: 'shell',
            executionTime: 150,
            outputLength: 11,
            exitCode: 0,
            hasOutput: true,
            timestamp: expect.any(Date),
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
        })
      );
    });
  });

  describe('logFileOperation', () => {
    it('should log file upload operation', async () => {
      const mockAuditLog = { id: 'test-id' };
      mockAuditRepository.create.mockResolvedValue(mockAuditLog as any);

      await auditService.logFileOperation(
        'operator-1',
        {
          implantId: 'implant-1',
          operation: 'upload',
          sourcePath: '/local/file.txt',
          targetPath: 'C:\\temp\\file.txt',
          fileSize: 1024,
          checksum: 'abc123',
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: 'operator-1',
          action: 'file_upload',
          resourceType: 'file',
          resourceId: 'C:\\temp\\file.txt',
          details: expect.objectContaining({
            implantId: 'implant-1',
            operation: 'upload',
            sourcePath: '/local/file.txt',
            targetPath: 'C:\\temp\\file.txt',
            fileSize: 1024,
            checksum: 'abc123',
            timestamp: expect.any(Date),
          }),
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
        })
      );
    });
  });

  describe('searchLogs', () => {
    it('should search audit logs with filters', async () => {
      const mockLogs = [
        { id: '1', action: 'test1', createdAt: new Date() },
        { id: '2', action: 'test2', createdAt: new Date() },
      ];

      mockAuditRepository.findMany
        .mockResolvedValueOnce(mockLogs as any)
        .mockResolvedValueOnce(Array(150).fill(mockLogs[0]) as any);

      const filter = {
        operatorId: 'operator-1',
        limit: 10,
        offset: 0,
      };

      const result = await auditService.searchLogs(filter);

      expect(result).toEqual({
        logs: mockLogs,
        totalCount: 150,
        hasMore: false,
      });

      expect(mockAuditRepository.findMany).toHaveBeenCalledTimes(2);
      expect(mockAuditRepository.findMany).toHaveBeenNthCalledWith(1, filter);
      expect(mockAuditRepository.findMany).toHaveBeenNthCalledWith(2, {
        operatorId: 'operator-1',
      });
    });
  });

  describe('getStatistics', () => {
    it('should return enhanced audit statistics', async () => {
      const mockStats = {
        totalLogs: 1000,
        successfulActions: 950,
        failedActions: 50,
        uniqueOperators: 5,
        topActions: [
          { action: 'login', count: 100 },
          { action: 'execute_command', count: 80 },
        ],
      };

      const mockLogs = Array(24)
        .fill(null)
        .map((_, i) => ({
          id: `log-${i}`,
          createdAt: new Date(Date.now() - i * 60 * 60 * 1000), // Each hour back
        }));

      mockAuditRepository.getStatistics.mockResolvedValue(mockStats as any);
      mockAuditRepository.findMany.mockResolvedValue(mockLogs as any);

      const result = await auditService.getStatistics();

      expect(result).toEqual({
        ...mockStats,
        activityByHour: expect.any(Array),
        errorRate: 5, // 50/1000 * 100 = 5%
      });

      expect(result.activityByHour).toHaveLength(24);
    });
  });

  describe('applyRetentionPolicy', () => {
    it('should apply retention policy and return deleted count', async () => {
      mockAuditRepository.deleteOlderThan.mockResolvedValue(100);

      const deletedCount = await auditService.applyRetentionPolicy();

      expect(deletedCount).toBe(100);
      expect(mockAuditRepository.deleteOlderThan).toHaveBeenCalledWith(expect.any(Date));
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Audit retention policy applied: deleted 100 old audit logs',
        expect.any(Object)
      );
    });

    it('should not log when no records deleted', async () => {
      mockAuditRepository.deleteOlderThan.mockResolvedValue(0);

      const deletedCount = await auditService.applyRetentionPolicy();

      expect(deletedCount).toBe(0);
      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('deleted'));
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate JSON compliance report', async () => {
      const mockLogs = [
        {
          id: '1',
          operatorId: 'op1',
          action: 'login',
          resourceType: 'auth',
          success: true,
          createdAt: new Date('2023-01-01T10:00:00Z'),
          ipAddress: '192.168.1.1',
          details: {},
        },
      ];

      const mockStats = {
        totalLogs: 1,
        successfulActions: 1,
        failedActions: 0,
        uniqueOperators: 1,
        topActions: [{ action: 'login', count: 1 }],
        errorRate: 0,
        activityByHour: [],
      };

      mockAuditRepository.findMany
        .mockResolvedValueOnce(mockLogs as any)
        .mockResolvedValueOnce(mockLogs as any);

      jest.spyOn(auditService, 'getStatistics').mockResolvedValue(mockStats);

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-02');

      const report = await auditService.generateComplianceReport(startDate, endDate, 'json');

      expect(report).toEqual({
        reportMetadata: {
          generatedAt: expect.any(String),
          periodStart: startDate.toISOString(),
          periodEnd: endDate.toISOString(),
          totalRecords: 1,
          format: 'json',
        },
        summary: {
          totalActions: 1,
          successfulActions: 1,
          failedActions: 0,
          errorRate: 0,
          uniqueOperators: 1,
          topActions: [{ action: 'login', count: 1 }],
        },
        auditTrail: [
          {
            timestamp: '2023-01-01T10:00:00.000Z',
            operator: 'op1',
            action: 'login',
            resourceType: 'auth',
            resourceId: undefined,
            success: true,
            ipAddress: '192.168.1.1',
            details: {},
            errorMessage: undefined,
          },
        ],
      });
    });

    it('should generate CSV compliance report', async () => {
      const mockLogs = [
        {
          id: '1',
          operatorId: 'op1',
          action: 'login',
          resourceType: 'auth',
          success: true,
          createdAt: new Date('2023-01-01T10:00:00Z'),
          ipAddress: '192.168.1.1',
          details: {},
        },
      ];

      const mockStats = {
        totalLogs: 1,
        successfulActions: 1,
        failedActions: 0,
        uniqueOperators: 1,
        topActions: [],
        errorRate: 0,
        activityByHour: [],
      };

      mockAuditRepository.findMany
        .mockResolvedValueOnce(mockLogs as any)
        .mockResolvedValueOnce(mockLogs as any);

      jest.spyOn(auditService, 'getStatistics').mockResolvedValue(mockStats);

      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-01-02');

      const report = await auditService.generateComplianceReport(startDate, endDate, 'csv');

      expect(typeof report).toBe('string');
      expect(report).toContain('Timestamp,Operator,Action');
      expect(report).toContain('2023-01-01T10:00:00.000Z');
    });
  });

  describe('configuration management', () => {
    it('should enable and disable audit logging', () => {
      auditService.setEnabled(false);
      expect(auditService.getConfiguration().enabled).toBe(false);

      auditService.setEnabled(true);
      expect(auditService.getConfiguration().enabled).toBe(true);
    });

    it('should update retention policy', () => {
      auditService.setRetentionPolicy(180);
      expect(auditService.getConfiguration().retentionDays).toBe(180);
    });

    it('should throw error for invalid retention policy', () => {
      expect(() => auditService.setRetentionPolicy(0)).toThrow(
        'Retention policy must be at least 1 day'
      );
    });
  });
});
