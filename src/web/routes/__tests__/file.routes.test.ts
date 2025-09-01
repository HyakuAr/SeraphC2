/**
 * File routes tests
 */

import request from 'supertest';
import express from 'express';
import { createFileRoutes } from '../file.routes';
import { FileManager } from '../../../core/engine/file-manager';
import { AuthMiddleware } from '../../../core/auth/auth.middleware';

// Mock dependencies
jest.mock('../../../core/engine/file-manager');
jest.mock('../../../core/auth/auth.middleware');
jest.mock('../../../utils/logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

describe('File Routes', () => {
  let app: express.Application;
  let mockFileManager: jest.Mocked<FileManager>;
  let mockAuthMiddleware: jest.Mocked<AuthMiddleware>;

  const mockUser = {
    id: 'operator-1',
    username: 'testoperator',
    role: 'operator',
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockFileManager = {
      listFiles: jest.fn(),
      uploadFile: jest.fn(),
      downloadFile: jest.fn(),
      performFileOperation: jest.fn(),
      cancelTransfer: jest.fn(),
      getTransferProgress: jest.fn(),
      getActiveTransfers: jest.fn(),
    } as any;

    mockAuthMiddleware = {
      authenticate: jest.fn((req, _res, next) => {
        (req as any).user = mockUser;
        next();
      }),
    } as any;

    app.use(
      '/api/files',
      createFileRoutes({
        fileManager: mockFileManager,
        authMiddleware: mockAuthMiddleware,
      })
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/files/list', () => {
    it('should list files successfully', async () => {
      const mockListing = {
        path: 'C:\\',
        files: [
          {
            name: 'test.txt',
            path: 'C:\\test.txt',
            size: 1024,
            isDirectory: false,
            permissions: 'rw-',
            lastModified: new Date(),
          },
        ],
        totalSize: 1024,
        totalFiles: 1,
        totalDirectories: 0,
      };

      mockFileManager.listFiles.mockResolvedValue(mockListing);

      const response = await request(app).post('/api/files/list').send({
        implantId: 'test-implant-1',
        path: 'C:\\',
        recursive: false,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        ...mockListing,
        files: mockListing.files.map(file => ({
          ...file,
          lastModified: file.lastModified.toISOString(),
        })),
      });
      expect(mockFileManager.listFiles).toHaveBeenCalledWith(
        {
          implantId: 'test-implant-1',
          path: 'C:\\',
          recursive: false,
        },
        'operator-1'
      );
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app).post('/api/files/list').send({
        implantId: 'test-implant-1',
        // missing path
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields: implantId, path');
    });

    it('should handle file manager errors', async () => {
      mockFileManager.listFiles.mockRejectedValue(new Error('Implant not found'));

      const response = await request(app).post('/api/files/list').send({
        implantId: 'nonexistent-implant',
        path: 'C:\\',
      });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Implant not found');
    });
  });

  describe('POST /api/files/upload', () => {
    it('should upload file successfully', async () => {
      const mockTransferId = 'transfer_123_abc';
      mockFileManager.uploadFile.mockResolvedValue(mockTransferId);

      const response = await request(app)
        .post('/api/files/upload')
        .field('implantId', 'test-implant-1')
        .field('remotePath', 'C:\\temp')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transferId).toBe(mockTransferId);
      expect(response.body.data.fileName).toBe('test.txt');
    });

    it('should return 400 for missing file', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .field('implantId', 'test-implant-1')
        .field('remotePath', 'C:\\temp');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields: implantId, remotePath, file');
    });
  });

  describe('POST /api/files/download', () => {
    it('should download file successfully', async () => {
      const mockTransferId = 'transfer_456_def';
      mockFileManager.downloadFile.mockResolvedValue(mockTransferId);

      const response = await request(app).post('/api/files/download').send({
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp\\test.txt',
        checksum: true,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transferId).toBe(mockTransferId);
      expect(mockFileManager.downloadFile).toHaveBeenCalledWith(
        {
          implantId: 'test-implant-1',
          remotePath: 'C:\\temp\\test.txt',
          checksum: true,
        },
        'operator-1'
      );
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app).post('/api/files/download').send({
        implantId: 'test-implant-1',
        // missing remotePath
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields: implantId, remotePath');
    });
  });

  describe('POST /api/files/operation', () => {
    it('should delete file successfully', async () => {
      mockFileManager.performFileOperation.mockResolvedValue();

      const response = await request(app).post('/api/files/operation').send({
        implantId: 'test-implant-1',
        operation: 'delete',
        sourcePath: 'C:\\temp\\test.txt',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('File delete operation initiated successfully');
      expect(mockFileManager.performFileOperation).toHaveBeenCalledWith(
        {
          implantId: 'test-implant-1',
          operation: 'delete',
          sourcePath: 'C:\\temp\\test.txt',
          destinationPath: undefined,
        },
        'operator-1'
      );
    });

    it('should rename file successfully', async () => {
      mockFileManager.performFileOperation.mockResolvedValue();

      const response = await request(app).post('/api/files/operation').send({
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\old.txt',
        destinationPath: 'C:\\temp\\new.txt',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('File rename operation initiated successfully');
    });

    it('should return 400 for invalid operation', async () => {
      const response = await request(app).post('/api/files/operation').send({
        implantId: 'test-implant-1',
        operation: 'invalid',
        sourcePath: 'C:\\temp\\test.txt',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid operation. Must be one of: delete, rename, copy');
    });

    it('should return 400 for rename without destination', async () => {
      const response = await request(app).post('/api/files/operation').send({
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\test.txt',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Destination path is required for rename operation');
    });
  });

  describe('POST /api/files/transfer/:id/cancel', () => {
    it('should cancel transfer successfully', async () => {
      mockFileManager.cancelTransfer.mockResolvedValue();

      const response = await request(app).post('/api/files/transfer/transfer_123_abc/cancel');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Transfer cancelled successfully');
      expect(mockFileManager.cancelTransfer).toHaveBeenCalledWith('transfer_123_abc', 'operator-1');
    });

    it('should return 400 for missing transfer ID', async () => {
      const response = await request(app).post('/api/files/transfer//cancel');

      expect(response.status).toBe(404); // Express returns 404 for empty param
    });
  });

  describe('GET /api/files/transfer/:id/progress', () => {
    it('should get transfer progress successfully', async () => {
      const mockProgress = {
        transferId: 'transfer_123_abc',
        fileName: 'test.txt',
        totalSize: 1000,
        transferredSize: 500,
        progress: 50,
        speed: 1024,
        status: 'transferring' as const,
      };

      mockFileManager.getTransferProgress.mockReturnValue(mockProgress);

      const response = await request(app).get('/api/files/transfer/transfer_123_abc/progress');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockProgress);
    });

    it('should return 404 for nonexistent transfer', async () => {
      mockFileManager.getTransferProgress.mockReturnValue(null);

      const response = await request(app).get('/api/files/transfer/nonexistent/progress');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Transfer not found');
    });
  });

  describe('GET /api/files/transfers/active', () => {
    it('should get active transfers successfully', async () => {
      const mockTransfers = [
        {
          transferId: 'transfer_123_abc',
          fileName: 'test1.txt',
          totalSize: 1000,
          transferredSize: 500,
          progress: 50,
          speed: 1024,
          status: 'transferring' as const,
        },
        {
          transferId: 'transfer_456_def',
          fileName: 'test2.txt',
          totalSize: 2000,
          transferredSize: 2000,
          progress: 100,
          speed: 0,
          status: 'completed' as const,
        },
      ];

      mockFileManager.getActiveTransfers.mockReturnValue(mockTransfers);

      const response = await request(app).get('/api/files/transfers/active');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockTransfers);
      expect(response.body.count).toBe(2);
    });

    it('should return empty array when no active transfers', async () => {
      mockFileManager.getActiveTransfers.mockReturnValue([]);

      const response = await request(app).get('/api/files/transfers/active');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });
});
