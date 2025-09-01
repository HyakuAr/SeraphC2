/**
 * File service for file operations and transfers
 */

import { apiClient } from './apiClient';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  permissions: string;
  lastModified: string;
  owner?: string;
}

export interface DirectoryListing {
  path: string;
  files: FileInfo[];
  totalSize: number;
  totalFiles: number;
  totalDirectories: number;
}

export interface FileListRequest {
  implantId: string;
  path: string;
  recursive?: boolean;
}

export interface FileUploadRequest {
  implantId: string;
  remotePath: string;
  file: File;
}

export interface FileDownloadRequest {
  implantId: string;
  remotePath: string;
  checksum?: boolean;
}

export interface FileOperationRequest {
  implantId: string;
  operation: 'delete' | 'rename' | 'copy';
  sourcePath: string;
  destinationPath?: string;
}

export interface FileTransferProgress {
  transferId: string;
  fileName: string;
  totalSize: number;
  transferredSize: number;
  progress: number;
  speed: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled' | 'paused';
  error?: string;
  checksum?: string;
  resumable?: boolean;
  chunks?: FileChunk[];
}

export interface FileChunk {
  index: number;
  offset: number;
  size: number;
  checksum: string;
  status: 'pending' | 'transferring' | 'completed' | 'failed';
}

export interface FileIntegrityCheck {
  fileName: string;
  expectedChecksum: string;
  actualChecksum: string;
  isValid: boolean;
  algorithm: 'md5' | 'sha1' | 'sha256';
}

export class FileService {
  /**
   * List files and directories in a path
   */
  static async listFiles(request: FileListRequest): Promise<DirectoryListing> {
    const response = await apiClient.post('/api/files/list', request);
    return response.data.data;
  }

  /**
   * Upload a file to the implant
   */
  static async uploadFile(
    request: FileUploadRequest
  ): Promise<{ transferId: string; fileName: string; fileSize: number; status: string }> {
    const formData = new FormData();
    formData.append('implantId', request.implantId);
    formData.append('remotePath', request.remotePath);
    formData.append('file', request.file);

    const response = await apiClient.post('/api/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  }

  /**
   * Download a file from the implant
   */
  static async downloadFile(
    request: FileDownloadRequest
  ): Promise<{ transferId: string; remotePath: string; status: string }> {
    const response = await apiClient.post('/api/files/download', request);
    return response.data.data;
  }

  /**
   * Perform file operations (delete, rename, copy)
   */
  static async performFileOperation(request: FileOperationRequest): Promise<void> {
    await apiClient.post('/api/files/operation', request);
  }

  /**
   * Cancel a file transfer
   */
  static async cancelTransfer(transferId: string): Promise<void> {
    await apiClient.post(`/api/files/transfer/${transferId}/cancel`);
  }

  /**
   * Get transfer progress
   */
  static async getTransferProgress(transferId: string): Promise<FileTransferProgress> {
    const response = await apiClient.get(`/api/files/transfer/${transferId}/progress`);
    return response.data.data;
  }

  /**
   * Get all active transfers
   */
  static async getActiveTransfers(): Promise<FileTransferProgress[]> {
    const response = await apiClient.get('/api/files/transfers/active');
    return response.data.data;
  }

  /**
   * Resume a paused transfer
   */
  static async resumeTransfer(transferId: string): Promise<void> {
    await apiClient.post(`/api/files/transfer/${transferId}/resume`);
  }

  /**
   * Pause a transfer
   */
  static async pauseTransfer(transferId: string): Promise<void> {
    await apiClient.post(`/api/files/transfer/${transferId}/pause`);
  }

  /**
   * Verify file integrity using checksum
   */
  static async verifyFileIntegrity(
    implantId: string,
    remotePath: string,
    expectedChecksum: string,
    algorithm: 'md5' | 'sha1' | 'sha256' = 'sha256'
  ): Promise<FileIntegrityCheck> {
    const response = await apiClient.post('/api/files/verify', {
      implantId,
      remotePath,
      expectedChecksum,
      algorithm,
    });
    return response.data.data;
  }

  /**
   * Calculate file checksum
   */
  static async calculateChecksum(
    implantId: string,
    remotePath: string,
    algorithm: 'md5' | 'sha1' | 'sha256' = 'sha256'
  ): Promise<string> {
    const response = await apiClient.post('/api/files/checksum', {
      implantId,
      remotePath,
      algorithm,
    });
    return response.data.data.checksum;
  }

  /**
   * Upload file with chunked transfer and resumability
   */
  static async uploadFileChunked(
    request: FileUploadRequest,
    chunkSize: number = 1024 * 1024, // 1MB chunks
    onProgress?: (progress: FileTransferProgress) => void
  ): Promise<string> {
    const totalChunks = Math.ceil(request.file.size / chunkSize);
    const transferId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize chunked upload
    const initResponse = await apiClient.post('/api/files/upload/chunked/init', {
      implantId: request.implantId,
      remotePath: request.remotePath,
      fileName: request.file.name,
      fileSize: request.file.size,
      totalChunks,
      chunkSize,
      transferId,
    });

    const chunks: FileChunk[] = [];

    // Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, request.file.size);
      const chunkData = request.file.slice(start, end);

      const chunk: FileChunk = {
        index: i,
        offset: start,
        size: end - start,
        checksum: await this.calculateFileChecksum(chunkData),
        status: 'pending',
      };

      chunks.push(chunk);

      try {
        chunk.status = 'transferring';

        const formData = new FormData();
        formData.append('transferId', transferId);
        formData.append('chunkIndex', i.toString());
        formData.append('chunkData', chunkData);
        formData.append('checksum', chunk.checksum);

        await apiClient.post('/api/files/upload/chunked/chunk', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        chunk.status = 'completed';

        // Report progress
        const progress: FileTransferProgress = {
          transferId,
          fileName: request.file.name,
          totalSize: request.file.size,
          transferredSize: end,
          progress: Math.round((end / request.file.size) * 100),
          speed: 0, // Would be calculated based on timing
          status: 'transferring',
          resumable: true,
          chunks,
        };

        onProgress?.(progress);
      } catch (error) {
        chunk.status = 'failed';
        throw error;
      }
    }

    // Finalize upload
    await apiClient.post('/api/files/upload/chunked/finalize', {
      transferId,
      expectedChecksum: await this.calculateFileChecksum(request.file),
    });

    return transferId;
  }

  /**
   * Calculate checksum for a file or blob
   */
  private static async calculateFileChecksum(file: File | Blob): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Delete a file or directory
   */
  static async deleteFile(implantId: string, path: string): Promise<void> {
    await this.performFileOperation({
      implantId,
      operation: 'delete',
      sourcePath: path,
    });
  }

  /**
   * Rename a file or directory
   */
  static async renameFile(
    implantId: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    await this.performFileOperation({
      implantId,
      operation: 'rename',
      sourcePath,
      destinationPath,
    });
  }

  /**
   * Copy a file or directory
   */
  static async copyFile(
    implantId: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    await this.performFileOperation({
      implantId,
      operation: 'copy',
      sourcePath,
      destinationPath,
    });
  }
}
