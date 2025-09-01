/**
 * File operations API routes
 * Provides endpoints for file management and transfers
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { FileManager } from '../../core/engine/file-manager';
import { AuthMiddleware } from '../../core/auth/auth.middleware';
import { Logger } from '../../utils/logger';

export interface FileRoutesConfig {
  fileManager: FileManager;
  authMiddleware: AuthMiddleware;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

export function createFileRoutes(config: FileRoutesConfig): Router {
  const router = Router();
  const { fileManager, authMiddleware } = config;
  const logger = Logger.getInstance();

  // Apply authentication middleware to all routes
  router.use(authMiddleware.authenticate.bind(authMiddleware));

  /**
   * POST /api/files/list - List files and directories
   */
  router.post('/list', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, path, recursive = false } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !path) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, path',
        });
      }

      const listing = await fileManager.listFiles({ implantId, path, recursive }, operatorId);

      return res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      logger.error('Failed to list files', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list files',
      });
    }
  });

  /**
   * POST /api/files/upload - Upload a file to implant
   */
  router.post(
    '/upload',
    upload.single('file'),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const { implantId, remotePath } = req.body;
        const operatorId = (req as any).user?.id;
        const file = req.file;

        if (!implantId || !remotePath || !file) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: implantId, remotePath, file',
          });
        }

        const uploadRequest = {
          implantId,
          remotePath,
          fileName: file.originalname,
          fileSize: file.size,
        };

        const transferId = await fileManager.uploadFile(uploadRequest, file.buffer, operatorId);

        return res.json({
          success: true,
          data: {
            transferId,
            fileName: file.originalname,
            fileSize: file.size,
            status: 'initiated',
          },
        });
      } catch (error) {
        logger.error('Failed to upload file', {
          error: error instanceof Error ? error.message : 'Unknown error',
          operatorId: (req as any).user?.id,
          body: req.body,
        });

        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to upload file',
        });
      }
    }
  );

  /**
   * POST /api/files/download - Download a file from implant
   */
  router.post('/download', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, remotePath, checksum = true } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !remotePath) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, remotePath',
        });
      }

      const transferId = await fileManager.downloadFile(
        { implantId, remotePath, checksum },
        operatorId
      );

      return res.json({
        success: true,
        data: {
          transferId,
          remotePath,
          status: 'initiated',
        },
      });
    } catch (error) {
      logger.error('Failed to download file', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download file',
      });
    }
  });

  /**
   * POST /api/files/operation - Perform file operations (delete, rename, copy)
   */
  router.post('/operation', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, operation, sourcePath, destinationPath } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !operation || !sourcePath) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, operation, sourcePath',
        });
      }

      if (!['delete', 'rename', 'copy'].includes(operation)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid operation. Must be one of: delete, rename, copy',
        });
      }

      if ((operation === 'rename' || operation === 'copy') && !destinationPath) {
        return res.status(400).json({
          success: false,
          error: `Destination path is required for ${operation} operation`,
        });
      }

      await fileManager.performFileOperation(
        { implantId, operation, sourcePath, destinationPath },
        operatorId
      );

      return res.json({
        success: true,
        message: `File ${operation} operation initiated successfully`,
      });
    } catch (error) {
      logger.error('Failed to perform file operation', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to perform file operation',
      });
    }
  });

  /**
   * POST /api/files/transfer/:id/cancel - Cancel a file transfer
   */
  router.post('/transfer/:id/cancel', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const operatorId = (req as any).user?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Transfer ID is required',
        });
      }

      await fileManager.cancelTransfer(id, operatorId);

      return res.json({
        success: true,
        message: 'Transfer cancelled successfully',
      });
    } catch (error) {
      logger.error('Failed to cancel transfer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transferId: req.params['id'],
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel transfer',
      });
    }
  });

  /**
   * GET /api/files/transfer/:id/progress - Get transfer progress
   */
  router.get('/transfer/:id/progress', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Transfer ID is required',
        });
      }

      const progress = fileManager.getTransferProgress(id);

      if (!progress) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found',
        });
      }

      return res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      logger.error('Failed to get transfer progress', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transferId: req.params['id'],
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get transfer progress',
      });
    }
  });

  /**
   * GET /api/files/transfers/active - Get all active transfers
   */
  router.get('/transfers/active', async (_req: Request, res: Response): Promise<Response> => {
    try {
      const activeTransfers = fileManager.getActiveTransfers();

      return res.json({
        success: true,
        data: activeTransfers,
        count: activeTransfers.length,
      });
    } catch (error) {
      logger.error('Failed to get active transfers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get active transfers',
      });
    }
  });

  /**
   * POST /api/files/upload/chunked/init - Initialize chunked upload
   */
  router.post('/upload/chunked/init', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, remotePath, fileName, fileSize, totalChunks, chunkSize, transferId } =
        req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !remotePath || !fileName || !fileSize || !totalChunks || !chunkSize) {
        return res.status(400).json({
          success: false,
          error:
            'Missing required fields: implantId, remotePath, fileName, fileSize, totalChunks, chunkSize',
        });
      }

      const sessionId = await fileManager.initializeChunkedUpload(
        implantId,
        fileName,
        fileSize,
        totalChunks,
        chunkSize,
        operatorId
      );

      return res.json({
        success: true,
        data: {
          transferId: sessionId,
          status: 'initialized',
        },
      });
    } catch (error) {
      logger.error('Failed to initialize chunked upload', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initialize chunked upload',
      });
    }
  });

  /**
   * POST /api/files/upload/chunked/chunk - Upload file chunk
   */
  router.post(
    '/upload/chunked/chunk',
    upload.single('chunkData'),
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const { transferId, chunkIndex, checksum } = req.body;
        const operatorId = (req as any).user?.id;
        const chunkData = req.file;

        if (!transferId || chunkIndex === undefined || !checksum || !chunkData) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: transferId, chunkIndex, checksum, chunkData',
          });
        }

        await fileManager.uploadFileChunk(
          transferId,
          parseInt(chunkIndex),
          chunkData.buffer,
          checksum,
          operatorId
        );

        return res.json({
          success: true,
          message: 'Chunk uploaded successfully',
        });
      } catch (error) {
        logger.error('Failed to upload chunk', {
          error: error instanceof Error ? error.message : 'Unknown error',
          operatorId: (req as any).user?.id,
          body: req.body,
        });

        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to upload chunk',
        });
      }
    }
  );

  /**
   * POST /api/files/upload/chunked/finalize - Finalize chunked upload
   */
  router.post(
    '/upload/chunked/finalize',
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const { transferId, expectedChecksum } = req.body;
        const operatorId = (req as any).user?.id;

        if (!transferId || !expectedChecksum) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: transferId, expectedChecksum',
          });
        }

        await fileManager.finalizeChunkedUpload(transferId, expectedChecksum, operatorId);

        return res.json({
          success: true,
          message: 'Upload finalized successfully',
        });
      } catch (error) {
        logger.error('Failed to finalize upload', {
          error: error instanceof Error ? error.message : 'Unknown error',
          operatorId: (req as any).user?.id,
          body: req.body,
        });

        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to finalize upload',
        });
      }
    }
  );

  /**
   * POST /api/files/transfer/:id/pause - Pause a file transfer
   */
  router.post('/transfer/:id/pause', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const operatorId = (req as any).user?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Transfer ID is required',
        });
      }

      await fileManager.pauseTransfer(id, operatorId);

      return res.json({
        success: true,
        message: 'Transfer paused successfully',
      });
    } catch (error) {
      logger.error('Failed to pause transfer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transferId: req.params['id'],
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pause transfer',
      });
    }
  });

  /**
   * POST /api/files/transfer/:id/resume - Resume a file transfer
   */
  router.post('/transfer/:id/resume', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { id } = req.params;
      const operatorId = (req as any).user?.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: 'Transfer ID is required',
        });
      }

      await fileManager.resumeTransfer(id, operatorId);

      return res.json({
        success: true,
        message: 'Transfer resumed successfully',
      });
    } catch (error) {
      logger.error('Failed to resume transfer', {
        error: error instanceof Error ? error.message : 'Unknown error',
        transferId: req.params['id'],
        operatorId: (req as any).user?.id,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resume transfer',
      });
    }
  });

  /**
   * POST /api/files/checksum - Calculate file checksum
   */
  router.post('/checksum', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, remotePath, algorithm = 'sha256' } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !remotePath) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, remotePath',
        });
      }

      if (!['md5', 'sha1', 'sha256'].includes(algorithm)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid algorithm. Must be one of: md5, sha1, sha256',
        });
      }

      const checksum = await fileManager.calculateRemoteChecksum(
        implantId,
        remotePath,
        algorithm,
        operatorId
      );

      return res.json({
        success: true,
        data: {
          checksum,
          algorithm,
          remotePath,
        },
      });
    } catch (error) {
      logger.error('Failed to calculate checksum', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate checksum',
      });
    }
  });

  /**
   * POST /api/files/verify - Verify file integrity
   */
  router.post('/verify', async (req: Request, res: Response): Promise<Response> => {
    try {
      const { implantId, remotePath, expectedChecksum, algorithm = 'sha256' } = req.body;
      const operatorId = (req as any).user?.id;

      if (!implantId || !remotePath || !expectedChecksum) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: implantId, remotePath, expectedChecksum',
        });
      }

      if (!['md5', 'sha1', 'sha256'].includes(algorithm)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid algorithm. Must be one of: md5, sha1, sha256',
        });
      }

      const integrityCheck = await fileManager.verifyFileIntegrity(
        implantId,
        remotePath,
        expectedChecksum,
        algorithm,
        operatorId
      );

      return res.json({
        success: true,
        data: integrityCheck,
      });
    } catch (error) {
      logger.error('Failed to verify file integrity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId: (req as any).user?.id,
        body: req.body,
      });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify file integrity',
      });
    }
  });

  return router;
}
