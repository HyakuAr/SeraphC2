/**
 * FileService tests
 */

import { FileService } from '../fileService';
import { apiClient } from '../apiClient';

// Mock the API client
jest.mock('../apiClient');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('FileService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listFiles', () => {
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
            lastModified: '2023-01-01T00:00:00.000Z',
          },
        ],
        totalSize: 1024,
        totalFiles: 1,
        totalDirectories: 0,
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: mockListing },
      });

      const result = await FileService.listFiles({
        implantId: 'test-implant-1',
        path: 'C:\\',
        recursive: false,
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/list', {
        implantId: 'test-implant-1',
        path: 'C:\\',
        recursive: false,
      });
      expect(result).toEqual(mockListing);
    });
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockResponse = {
        transferId: 'transfer_123_abc',
        fileName: 'test.txt',
        fileSize: 1024,
        status: 'initiated',
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: mockResponse },
      });

      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });

      const result = await FileService.uploadFile({
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp',
        file: mockFile,
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/upload', expect.any(FormData), {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('downloadFile', () => {
    it('should download file successfully', async () => {
      const mockResponse = {
        transferId: 'transfer_456_def',
        remotePath: 'C:\\temp\\test.txt',
        status: 'initiated',
      };

      mockApiClient.post.mockResolvedValue({
        data: { data: mockResponse },
      });

      const result = await FileService.downloadFile({
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp\\test.txt',
        checksum: true,
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/download', {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp\\test.txt',
        checksum: true,
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('performFileOperation', () => {
    it('should delete file successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: {} });

      await FileService.performFileOperation({
        implantId: 'test-implant-1',
        operation: 'delete',
        sourcePath: 'C:\\temp\\test.txt',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/operation', {
        implantId: 'test-implant-1',
        operation: 'delete',
        sourcePath: 'C:\\temp\\test.txt',
      });
    });

    it('should rename file successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: {} });

      await FileService.performFileOperation({
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\old.txt',
        destinationPath: 'C:\\temp\\new.txt',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/operation', {
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\old.txt',
        destinationPath: 'C:\\temp\\new.txt',
      });
    });

    it('should copy file successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: {} });

      await FileService.performFileOperation({
        implantId: 'test-implant-1',
        operation: 'copy',
        sourcePath: 'C:\\temp\\source.txt',
        destinationPath: 'C:\\temp\\copy.txt',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/operation', {
        implantId: 'test-implant-1',
        operation: 'copy',
        sourcePath: 'C:\\temp\\source.txt',
        destinationPath: 'C:\\temp\\copy.txt',
      });
    });
  });

  describe('cancelTransfer', () => {
    it('should cancel transfer successfully', async () => {
      mockApiClient.post.mockResolvedValue({ data: {} });

      await FileService.cancelTransfer('transfer_123_abc');

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/files/transfer/transfer_123_abc/cancel'
      );
    });
  });

  describe('getTransferProgress', () => {
    it('should get transfer progress successfully', async () => {
      const mockProgress = {
        transferId: 'transfer_123_abc',
        fileName: 'test.txt',
        totalSize: 1000,
        transferredSize: 500,
        progress: 50,
        speed: 1024,
        status: 'transferring',
      };

      mockApiClient.get.mockResolvedValue({
        data: { data: mockProgress },
      });

      const result = await FileService.getTransferProgress('transfer_123_abc');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/files/transfer/transfer_123_abc/progress'
      );
      expect(result).toEqual(mockProgress);
    });
  });

  describe('getActiveTransfers', () => {
    it('should get active transfers successfully', async () => {
      const mockTransfers = [
        {
          transferId: 'transfer_123_abc',
          fileName: 'test1.txt',
          totalSize: 1000,
          transferredSize: 500,
          progress: 50,
          speed: 1024,
          status: 'transferring',
        },
        {
          transferId: 'transfer_456_def',
          fileName: 'test2.txt',
          totalSize: 2000,
          transferredSize: 2000,
          progress: 100,
          speed: 0,
          status: 'completed',
        },
      ];

      mockApiClient.get.mockResolvedValue({
        data: { data: mockTransfers },
      });

      const result = await FileService.getActiveTransfers();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/files/transfers/active');
      expect(result).toEqual(mockTransfers);
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      mockApiClient.post.mockResolvedValue({ data: {} });
    });

    it('should delete file using convenience method', async () => {
      await FileService.deleteFile('test-implant-1', 'C:\\temp\\test.txt');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/operation', {
        implantId: 'test-implant-1',
        operation: 'delete',
        sourcePath: 'C:\\temp\\test.txt',
      });
    });

    it('should rename file using convenience method', async () => {
      await FileService.renameFile('test-implant-1', 'C:\\temp\\old.txt', 'C:\\temp\\new.txt');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/operation', {
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\old.txt',
        destinationPath: 'C:\\temp\\new.txt',
      });
    });

    it('should copy file using convenience method', async () => {
      await FileService.copyFile('test-implant-1', 'C:\\temp\\source.txt', 'C:\\temp\\copy.txt');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/files/operation', {
        implantId: 'test-implant-1',
        operation: 'copy',
        sourcePath: 'C:\\temp\\source.txt',
        destinationPath: 'C:\\temp\\copy.txt',
      });
    });
  });
});
