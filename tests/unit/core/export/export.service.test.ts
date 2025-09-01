/**
 * Unit tests for ExportService
 */

import { Pool } from 'pg';
import {
  ExportService,
  ExportRequest,
  ExportFilters,
} from '../../../../src/core/export/export.service';

// Mock dependencies
jest.mock('pg');
jest.mock('json2csv');
jest.mock('xmlbuilder2');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  },
}));

const MockedPool = Pool as jest.MockedClass<typeof Pool>;

describe('ExportService', () => {
  let exportService: ExportService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    } as any;

    MockedPool.mockImplementation(() => mockPool);
    exportService = new ExportService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startExport', () => {
    it('should create export job and return job ID', async () => {
      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
        filters: { limit: 100 },
        fields: ['id', 'name', 'status'],
      };

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const jobId = await exportService.startExport(request);

      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO export_jobs'),
        expect.arrayContaining([
          jobId,
          'implants',
          'json',
          'operator-123',
          JSON.stringify({ limit: 100 }),
          JSON.stringify(['id', 'name', 'status']),
        ])
      );
    });

    it('should handle export job creation with minimal request', async () => {
      const request: ExportRequest = {
        type: 'commands',
        format: 'csv',
        operatorId: 'operator-456',
      };

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const jobId = await exportService.startExport(request);

      expect(jobId).toBeDefined();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO export_jobs'),
        expect.arrayContaining([
          jobId,
          'commands',
          'csv',
          'operator-456',
          JSON.stringify({}),
          JSON.stringify([]),
        ])
      );
    });
  });

  describe('getExportJob', () => {
    it('should return export job when found', async () => {
      const mockRow = {
        id: 'job-123',
        type: 'implants',
        format: 'json',
        status: 'completed',
        progress: 100,
        total_records: 50,
        processed_records: 50,
        file_path: '/exports/job-123.json',
        file_size: 1024,
        error_message: null,
        operator_id: 'operator-123',
        created_at: new Date('2023-01-01T00:00:00Z'),
        completed_at: new Date('2023-01-01T00:05:00Z'),
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] } as any);

      const result = await exportService.getExportJob('job-123');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM export_jobs WHERE id = $1', [
        'job-123',
      ]);
      expect(result).toEqual({
        id: 'job-123',
        type: 'implants',
        format: 'json',
        status: 'completed',
        progress: 100,
        totalRecords: 50,
        processedRecords: 50,
        filePath: '/exports/job-123.json',
        fileSize: 1024,
        errorMessage: null,
        operatorId: 'operator-123',
        createdAt: mockRow.created_at,
        completedAt: mockRow.completed_at,
      });
    });

    it('should return null when job not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await exportService.getExportJob('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listExportJobs', () => {
    it('should return list of export jobs for operator', async () => {
      const mockRows = [
        {
          id: 'job-1',
          type: 'implants',
          format: 'json',
          status: 'completed',
          progress: 100,
          operator_id: 'operator-123',
          created_at: new Date(),
        },
        {
          id: 'job-2',
          type: 'commands',
          format: 'csv',
          status: 'processing',
          progress: 50,
          operator_id: 'operator-123',
          created_at: new Date(),
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows } as any);

      const result = await exportService.listExportJobs('operator-123', 10);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM export_jobs'),
        ['operator-123', 10]
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('job-1');
      expect(result[1].id).toBe('job-2');
    });

    it('should use default limit when not specified', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      await exportService.listExportJobs('operator-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM export_jobs'),
        ['operator-123', 50]
      );
    });
  });

  describe('deleteExportJob', () => {
    it('should delete export job successfully', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 } as any);

      const result = await exportService.deleteExportJob('job-123', 'operator-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM export_jobs WHERE id = $1 AND operator_id = $2',
        ['job-123', 'operator-123']
      );
      expect(result).toBe(true);
    });

    it('should return false when job not found or not owned by operator', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 } as any);

      const result = await exportService.deleteExportJob('job-123', 'operator-456');

      expect(result).toBe(false);
    });
  });

  describe('exportData', () => {
    beforeEach(() => {
      // Mock json2csv Parser
      const mockParser = {
        parse: jest.fn().mockReturnValue('id,name,status\n1,test,active'),
      };
      (require('json2csv') as any).Parser = jest.fn().mockImplementation(() => mockParser);

      // Mock xmlbuilder2
      const mockXmlElement = {
        ele: jest.fn().mockReturnThis(),
        txt: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnValue('<xml>test</xml>'),
      };
      (require('xmlbuilder2') as any).create = jest.fn().mockReturnValue({
        ele: jest.fn().mockReturnValue(mockXmlElement),
      });
    });

    it('should export implants data as JSON', async () => {
      const mockData = [
        { id: '1', name: 'implant1', status: 'active' },
        { id: '2', name: 'implant2', status: 'inactive' },
      ];

      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
      };

      const result = await exportService.exportData(request);

      expect(result.format).toBe('json');
      expect(result.recordCount).toBe(2);
      expect(result.data).toBe(JSON.stringify(mockData, null, 2));
    });

    it('should export data as CSV with field filtering', async () => {
      const mockData = [
        { id: '1', name: 'implant1', status: 'active', extra: 'field' },
        { id: '2', name: 'implant2', status: 'inactive', extra: 'field' },
      ];

      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'csv',
        operatorId: 'operator-123',
        fields: ['id', 'name', 'status'],
      };

      const result = await exportService.exportData(request);

      expect(result.format).toBe('csv');
      expect(result.recordCount).toBe(2);
      expect(result.data).toBe('id,name,status\n1,test,active');
    });

    it('should export data as XML', async () => {
      const mockData = [{ id: '1', name: 'test' }];

      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'xml',
        operatorId: 'operator-123',
      };

      const result = await exportService.exportData(request);

      expect(result.format).toBe('xml');
      expect(result.recordCount).toBe(1);
      expect(result.data).toBe('<xml>test</xml>');
    });

    it('should handle empty CSV data', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'csv',
        operatorId: 'operator-123',
      };

      const result = await exportService.exportData(request);

      expect(result.data).toBe('');
      expect(result.recordCount).toBe(0);
    });

    it('should throw error for unsupported format', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'pdf' as any,
        operatorId: 'operator-123',
      };

      await expect(exportService.exportData(request)).rejects.toThrow('Unsupported format: pdf');
    });
  });

  describe('data fetching', () => {
    it('should fetch implants data with filters', async () => {
      const mockData = [{ id: '1', name: 'implant1' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
        filters: {
          dateFrom: new Date('2023-01-01'),
          dateTo: new Date('2023-12-31'),
          status: ['active'],
          limit: 100,
          offset: 0,
        },
      };

      await exportService.exportData(request);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM implants WHERE 1=1'),
        expect.arrayContaining([new Date('2023-01-01'), new Date('2023-12-31'), ['active'], 100, 0])
      );
    });

    it('should fetch commands data with implant and operator filters', async () => {
      const mockData = [{ id: '1', command: 'ls' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'commands',
        format: 'json',
        operatorId: 'operator-123',
        filters: {
          implantIds: ['implant-1', 'implant-2'],
          operatorIds: ['operator-1'],
        },
      };

      await exportService.exportData(request);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM commands WHERE 1=1'),
        expect.arrayContaining([['implant-1', 'implant-2'], ['operator-1']])
      );
    });

    it('should fetch operators data', async () => {
      const mockData = [{ id: '1', username: 'admin' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'operators',
        format: 'json',
        operatorId: 'operator-123',
      };

      await exportService.exportData(request);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'SELECT id, username, email, role, last_login, is_active, created_at FROM operators'
        ),
        []
      );
    });

    it('should fetch audit logs data', async () => {
      const mockData = [{ id: '1', action: 'login' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'audit_logs',
        format: 'json',
        operatorId: 'operator-123',
      };

      await exportService.exportData(request);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM audit_logs WHERE 1=1'),
        []
      );
    });

    it('should fetch tasks data', async () => {
      const mockData = [{ id: '1', name: 'task1' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'tasks',
        format: 'json',
        operatorId: 'operator-123',
      };

      await exportService.exportData(request);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM tasks WHERE 1=1'),
        []
      );
    });

    it('should fetch modules data', async () => {
      const mockData = [{ id: '1', name: 'module1' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'modules',
        format: 'json',
        operatorId: 'operator-123',
      };

      await exportService.exportData(request);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM modules WHERE 1=1'),
        []
      );
    });

    it('should throw error for unsupported export type', async () => {
      const request: ExportRequest = {
        type: 'unknown' as any,
        format: 'json',
        operatorId: 'operator-123',
      };

      await expect(exportService.exportData(request)).rejects.toThrow(
        'Unsupported export type: unknown'
      );
    });
  });

  describe('field filtering', () => {
    it('should filter fields when specified', async () => {
      const mockData = [
        { id: '1', name: 'test', status: 'active', extra: 'field', another: 'value' },
      ];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
        fields: ['id', 'name'],
      };

      const result = await exportService.exportData(request);

      const parsedData = JSON.parse(result.data);
      expect(parsedData).toEqual([{ id: '1', name: 'test' }]);
    });

    it('should not filter fields when not specified', async () => {
      const mockData = [{ id: '1', name: 'test', status: 'active' }];
      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
      };

      const result = await exportService.exportData(request);

      const parsedData = JSON.parse(result.data);
      expect(parsedData).toEqual(mockData);
    });
  });

  describe('error handling', () => {
    it('should handle database errors during export', async () => {
      const error = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(error);

      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
      };

      await expect(exportService.exportData(request)).rejects.toThrow('Database connection failed');
    });

    it('should handle JSON parsing errors', async () => {
      // Create circular reference to cause JSON.stringify to fail
      const circularData = { id: '1' };
      (circularData as any).self = circularData;

      mockPool.query.mockResolvedValue({ rows: [circularData] } as any);

      const request: ExportRequest = {
        type: 'implants',
        format: 'json',
        operatorId: 'operator-123',
      };

      await expect(exportService.exportData(request)).rejects.toThrow();
    });
  });

  describe('XML formatting', () => {
    it('should handle nested objects in XML', async () => {
      const mockData = [
        {
          id: '1',
          metadata: { key: 'value', nested: { deep: 'data' } },
          tags: ['tag1', 'tag2'],
        },
      ];

      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      // Mock XML builder more thoroughly
      const mockItemElement = {
        ele: jest.fn().mockReturnThis(),
        txt: jest.fn().mockReturnThis(),
      };

      const mockRootElement = {
        ele: jest.fn().mockReturnValue(mockItemElement),
        end: jest.fn().mockReturnValue('<xml>complex</xml>'),
      };

      (require('xmlbuilder2') as any).create = jest.fn().mockReturnValue({
        ele: jest.fn().mockReturnValue(mockRootElement),
      });

      const request: ExportRequest = {
        type: 'implants',
        format: 'xml',
        operatorId: 'operator-123',
      };

      const result = await exportService.exportData(request);

      expect(result.data).toBe('<xml>complex</xml>');
    });

    it('should handle null and undefined values in XML', async () => {
      const mockData = [{ id: '1', nullField: null, undefinedField: undefined }];

      mockPool.query.mockResolvedValue({ rows: mockData } as any);

      const mockItemElement = {
        ele: jest.fn().mockReturnThis(),
        txt: jest.fn().mockReturnThis(),
      };

      const mockRootElement = {
        ele: jest.fn().mockReturnValue(mockItemElement),
        end: jest.fn().mockReturnValue('<xml>nulls</xml>'),
      };

      (require('xmlbuilder2') as any).create = jest.fn().mockReturnValue({
        ele: jest.fn().mockReturnValue(mockRootElement),
      });

      const request: ExportRequest = {
        type: 'implants',
        format: 'xml',
        operatorId: 'operator-123',
      };

      const result = await exportService.exportData(request);

      expect(mockItemElement.txt).toHaveBeenCalledWith('');
    });
  });
});
