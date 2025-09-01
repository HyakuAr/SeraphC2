/**
 * FileManager tests
 */

import { FileManager } from '../file-manager';
import { ImplantManager } from '../implant-manager';
import { CommandManager } from '../command-manager';
import {
  FileUploadRequest,
  FileDownloadRequest,
  FileOperationRequest,
  CommandType,
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
} from '../../../types/entities';
import { FileListRequest } from '../file-manager';

// Mock dependencies
jest.mock('../implant-manager');
jest.mock('../command-manager');
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

describe('FileManager', () => {
  let fileManager: FileManager;
  let mockImplantManager: jest.Mocked<ImplantManager>;
  let mockCommandManager: jest.Mocked<CommandManager>;

  const mockImplant = {
    id: 'test-implant-1',
    hostname: 'test-host',
    username: 'test-user',
    operatingSystem: 'Windows 10',
    architecture: 'x64',
    privileges: PrivilegeLevel.USER,
    lastSeen: new Date(),
    status: ImplantStatus.ACTIVE,
    communicationProtocol: Protocol.HTTPS,
    encryptionKey: 'test-key',
    configuration: {
      callbackInterval: 5000,
      jitter: 10,
      maxRetries: 3,
    },
    systemInfo: {
      hostname: 'test-host',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      processorInfo: 'Intel Core i7',
      memoryTotal: 16777216,
      diskSpace: 1073741824,
      networkInterfaces: ['Ethernet'],
      installedSoftware: ['Chrome', 'Firefox'],
      runningProcesses: 150,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSession = {
    implantId: 'test-implant-1',
    lastHeartbeat: new Date(),
    connectionInfo: {
      protocol: Protocol.HTTPS,
      remoteAddress: '192.168.1.100',
      userAgent: 'SeraphC2-Implant/1.0',
    },
    isActive: true,
  };

  const mockCommand = {
    id: 'command-1',
    implantId: 'test-implant-1',
    operatorId: 'operator-1',
    type: CommandType.FILE_LIST,
    payload: '{"path": "C:\\\\", "recursive": false}',
    timestamp: new Date(),
    status: 'pending' as any,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockImplantManager = new ImplantManager() as jest.Mocked<ImplantManager>;
    mockCommandManager = new CommandManager(
      {} as any,
      mockImplantManager
    ) as jest.Mocked<CommandManager>;

    fileManager = new FileManager(mockImplantManager, mockCommandManager);

    // Setup default mocks
    mockImplantManager.getImplant.mockResolvedValue(mockImplant);
    mockImplantManager.getImplantSession.mockReturnValue(mockSession);
    mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listFiles', () => {
    it('should list files in a directory', async () => {
      const request: FileListRequest = {
        implantId: 'test-implant-1',
        path: 'C:\\',
        recursive: false,
      };

      const result = await fileManager.listFiles(request, 'operator-1');

      expect(mockImplantManager.getImplant).toHaveBeenCalledWith('test-implant-1');
      expect(mockImplantManager.getImplantSession).toHaveBeenCalledWith('test-implant-1');
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'operator-1',
        type: CommandType.FILE_LIST,
        payload: JSON.stringify({ path: 'C:\\', recursive: false }),
      });

      expect(result).toEqual({
        path: 'C:\\',
        files: [],
        totalSize: 0,
        totalFiles: 0,
        totalDirectories: 0,
      });
    });

    it('should throw error if implant not found', async () => {
      mockImplantManager.getImplant.mockResolvedValue(null);

      const request: FileListRequest = {
        implantId: 'nonexistent-implant',
        path: 'C:\\',
      };

      await expect(fileManager.listFiles(request, 'operator-1')).rejects.toThrow(
        'Implant nonexistent-implant not found'
      );
    });

    it('should throw error if implant not connected', async () => {
      mockImplantManager.getImplantSession.mockReturnValue(null);

      const request: FileListRequest = {
        implantId: 'test-implant-1',
        path: 'C:\\',
      };

      await expect(fileManager.listFiles(request, 'operator-1')).rejects.toThrow(
        'Implant test-implant-1 is not connected'
      );
    });
  });

  describe('uploadFile', () => {
    it('should upload a file to implant', async () => {
      const fileData = Buffer.from('test file content');
      const request: FileUploadRequest = {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp',
        fileName: 'test.txt',
        fileSize: fileData.length,
      };

      const transferId = await fileManager.uploadFile(request, fileData, 'operator-1');

      expect(transferId).toMatch(/^transfer_\d+_[a-z0-9]+$/);
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'operator-1',
        type: CommandType.FILE_UPLOAD,
        payload: expect.stringContaining('"fileName":"test.txt"'),
      });

      // Check that transfer progress is tracked
      const progress = fileManager.getTransferProgress(transferId);
      expect(progress).toBeTruthy();
      expect(progress?.fileName).toBe('test.txt');
      expect(progress?.status).toBe('transferring');
    });

    it('should throw error if implant not found', async () => {
      mockImplantManager.getImplant.mockResolvedValue(null);

      const request: FileUploadRequest = {
        implantId: 'nonexistent-implant',
        remotePath: 'C:\\temp',
        fileName: 'test.txt',
        fileSize: 100,
      };

      await expect(
        fileManager.uploadFile(request, Buffer.from('test'), 'operator-1')
      ).rejects.toThrow('Implant nonexistent-implant not found');
    });
  });

  describe('downloadFile', () => {
    it('should download a file from implant', async () => {
      const request: FileDownloadRequest = {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp\\test.txt',
        checksum: true,
      };

      const transferId = await fileManager.downloadFile(request, 'operator-1');

      expect(transferId).toMatch(/^transfer_\d+_[a-z0-9]+$/);
      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'operator-1',
        type: CommandType.FILE_DOWNLOAD,
        payload: expect.stringContaining('"remotePath":"C:\\\\temp\\\\test.txt"'),
      });

      // Check that transfer progress is tracked
      const progress = fileManager.getTransferProgress(transferId);
      expect(progress).toBeTruthy();
      expect(progress?.fileName).toBe('test.txt');
      expect(progress?.status).toBe('transferring');
    });
  });

  describe('performFileOperation', () => {
    it('should delete a file', async () => {
      const request: FileOperationRequest = {
        implantId: 'test-implant-1',
        operation: 'delete',
        sourcePath: 'C:\\temp\\test.txt',
      };

      await fileManager.performFileOperation(request, 'operator-1');

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'operator-1',
        type: CommandType.FILE_DELETE,
        payload: JSON.stringify({
          operation: 'delete',
          sourcePath: 'C:\\temp\\test.txt',
          destinationPath: undefined,
        }),
      });
    });

    it('should rename a file', async () => {
      const request: FileOperationRequest = {
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\old.txt',
        destinationPath: 'C:\\temp\\new.txt',
      };

      await fileManager.performFileOperation(request, 'operator-1');

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'operator-1',
        type: CommandType.FILE_RENAME,
        payload: JSON.stringify({
          operation: 'rename',
          sourcePath: 'C:\\temp\\old.txt',
          destinationPath: 'C:\\temp\\new.txt',
        }),
      });
    });

    it('should copy a file', async () => {
      const request: FileOperationRequest = {
        implantId: 'test-implant-1',
        operation: 'copy',
        sourcePath: 'C:\\temp\\source.txt',
        destinationPath: 'C:\\temp\\copy.txt',
      };

      await fileManager.performFileOperation(request, 'operator-1');

      expect(mockCommandManager.executeCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operatorId: 'operator-1',
        type: CommandType.FILE_COPY,
        payload: JSON.stringify({
          operation: 'copy',
          sourcePath: 'C:\\temp\\source.txt',
          destinationPath: 'C:\\temp\\copy.txt',
        }),
      });
    });

    it('should throw error for rename without destination path', async () => {
      const request: FileOperationRequest = {
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\temp\\test.txt',
      };

      await expect(fileManager.performFileOperation(request, 'operator-1')).rejects.toThrow(
        'Destination path is required for rename operation'
      );
    });

    it('should throw error for unsupported operation', async () => {
      const request = {
        implantId: 'test-implant-1',
        operation: 'invalid' as any,
        sourcePath: 'C:\\temp\\test.txt',
      };

      await expect(fileManager.performFileOperation(request, 'operator-1')).rejects.toThrow(
        'Unsupported file operation: invalid'
      );
    });
  });

  describe('cancelTransfer', () => {
    it('should cancel an active transfer', async () => {
      // First create a transfer
      const fileData = Buffer.from('test');
      const request: FileUploadRequest = {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp',
        fileName: 'test.txt',
        fileSize: fileData.length,
      };

      const transferId = await fileManager.uploadFile(request, fileData, 'operator-1');

      // Then cancel it
      await fileManager.cancelTransfer(transferId, 'operator-1');

      const progress = fileManager.getTransferProgress(transferId);
      expect(progress?.status).toBe('cancelled');
    });

    it('should throw error for nonexistent transfer', async () => {
      await expect(
        fileManager.cancelTransfer('nonexistent-transfer', 'operator-1')
      ).rejects.toThrow('Transfer nonexistent-transfer not found');
    });
  });

  describe('getActiveTransfers', () => {
    it('should return all active transfers', async () => {
      // Create a few transfers
      const fileData = Buffer.from('test');
      const request1: FileUploadRequest = {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp',
        fileName: 'test1.txt',
        fileSize: fileData.length,
      };
      const request2: FileUploadRequest = {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp',
        fileName: 'test2.txt',
        fileSize: fileData.length,
      };

      await fileManager.uploadFile(request1, fileData, 'operator-1');
      await fileManager.uploadFile(request2, fileData, 'operator-1');

      const activeTransfers = fileManager.getActiveTransfers();
      expect(activeTransfers).toHaveLength(2);
      expect(activeTransfers[0]?.fileName).toBe('test1.txt');
      expect(activeTransfers[1]?.fileName).toBe('test2.txt');
    });
  });

  describe('updateTransferProgress', () => {
    it('should update transfer progress', async () => {
      // Create a transfer
      const fileData = Buffer.from('test');
      const request: FileUploadRequest = {
        implantId: 'test-implant-1',
        remotePath: 'C:\\temp',
        fileName: 'test.txt',
        fileSize: 1000,
      };

      const transferId = await fileManager.uploadFile(request, fileData, 'operator-1');

      // Update progress
      fileManager.updateTransferProgress(transferId, {
        transferredSize: 500,
        speed: 1024,
      });

      const progress = fileManager.getTransferProgress(transferId);
      expect(progress?.transferredSize).toBe(500);
      expect(progress?.speed).toBe(1024);
      expect(progress?.progress).toBe(50); // 500/1000 * 100
    });
  });
});
