/**
 * Drag and Drop Upload Component - Enhanced file upload with drag-and-drop
 * Implements requirement 10.4 for drag-and-drop file upload with progress tracking
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  LinearProgress,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Cancel as CancelIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { FileService } from '../../services/fileService';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  transferId?: string;
}

interface DragDropUploadProps {
  implantId: string;
  currentPath: string;
  onUploadComplete?: () => void;
  maxFileSize?: number; // in bytes
  allowedTypes?: string[];
  maxFiles?: number;
}

export const DragDropUpload: React.FC<DragDropUploadProps> = ({
  implantId,
  currentPath,
  onUploadComplete,
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  allowedTypes = [], // Empty array means all types allowed
  maxFiles = 10,
}) => {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [showUploadDialog, setShowUploadDialog] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate unique ID for upload file
  const generateUploadId = (): string => {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Validate file
  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File size exceeds limit (${formatFileSize(maxFileSize)})`;
    }

    if (allowedTypes.length > 0) {
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedTypes.includes(fileExtension)) {
        return `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`;
      }
    }

    return null;
  };

  // Handle file selection
  const handleFileSelection = useCallback(
    (files: FileList) => {
      const newFiles: UploadFile[] = [];
      const errors: string[] = [];

      // Check total file count
      if (uploadFiles.length + files.length > maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validationError = validateFile(file);

        if (validationError) {
          errors.push(`${file.name}: ${validationError}`);
          continue;
        }

        newFiles.push({
          id: generateUploadId(),
          file,
          progress: 0,
          status: 'pending',
        });
      }

      if (errors.length > 0) {
        // Show errors to user
        console.error('File validation errors:', errors);
      }

      if (newFiles.length > 0) {
        setUploadFiles(prev => [...prev, ...newFiles]);
        setShowUploadDialog(true);
      }
    },
    [uploadFiles.length, maxFiles, maxFileSize, allowedTypes]
  );

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelection(files);
      }
    },
    [handleFileSelection]
  );

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  // Start upload for a specific file
  const startFileUpload = async (uploadFile: UploadFile) => {
    setUploadFiles(prev =>
      prev.map(f => (f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f))
    );

    try {
      const result = await FileService.uploadFile({
        implantId,
        remotePath: currentPath,
        file: uploadFile.file,
      });

      // Update with transfer ID
      setUploadFiles(prev =>
        prev.map(f => (f.id === uploadFile.id ? { ...f, transferId: result.transferId } : f))
      );

      // Simulate progress updates (in real implementation, this would come from WebSocket)
      const progressInterval = setInterval(() => {
        setUploadFiles(prev => {
          const file = prev.find(f => f.id === uploadFile.id);
          if (!file || file.status !== 'uploading') {
            clearInterval(progressInterval);
            return prev;
          }

          const newProgress = Math.min(file.progress + Math.random() * 20, 100);
          const isComplete = newProgress >= 100;

          return prev.map(f =>
            f.id === uploadFile.id
              ? {
                  ...f,
                  progress: newProgress,
                  status: isComplete ? 'completed' : 'uploading',
                }
              : f
          );
        });
      }, 500);

      // Clean up interval after completion
      setTimeout(() => {
        clearInterval(progressInterval);
        setUploadFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id && f.status === 'uploading'
              ? { ...f, status: 'completed', progress: 100 }
              : f
          )
        );
      }, 3000);
    } catch (error) {
      setUploadFiles(prev =>
        prev.map(f =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : f
        )
      );
    }
  };

  // Start all uploads
  const startAllUploads = async () => {
    const pendingFiles = uploadFiles.filter(f => f.status === 'pending');

    for (const file of pendingFiles) {
      await startFileUpload(file);
      // Small delay between uploads to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  // Cancel upload
  const cancelUpload = async (uploadFile: UploadFile) => {
    if (uploadFile.transferId && uploadFile.status === 'uploading') {
      try {
        await FileService.cancelTransfer(uploadFile.transferId);
      } catch (error) {
        console.error('Failed to cancel transfer:', error);
      }
    }

    setUploadFiles(prev =>
      prev.map(f => (f.id === uploadFile.id ? { ...f, status: 'cancelled' } : f))
    );
  };

  // Remove file from upload list
  const removeFile = (uploadId: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== uploadId));
  };

  // Clear completed/failed uploads
  const clearCompleted = () => {
    setUploadFiles(prev =>
      prev.filter(
        f => f.status !== 'completed' && f.status !== 'failed' && f.status !== 'cancelled'
      )
    );
  };

  // Close upload dialog
  const closeUploadDialog = () => {
    setShowUploadDialog(false);
    // Clear completed uploads when closing
    clearCompleted();
    // Notify parent of completion
    onUploadComplete?.();
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CompleteIcon color="success" />;
      case 'failed':
      case 'cancelled':
        return <ErrorIcon color="error" />;
      case 'uploading':
        return <UploadIcon color="primary" />;
      default:
        return <UploadIcon />;
    }
  };

  // Get status color
  const getStatusColor = (
    status: string
  ): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
      case 'cancelled':
        return 'error';
      case 'uploading':
        return 'primary';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const hasActiveUploads = uploadFiles.some(f => f.status === 'uploading');
  const hasPendingUploads = uploadFiles.some(f => f.status === 'pending');

  return (
    <>
      {/* Drag and Drop Zone */}
      <Paper
        sx={{
          p: 3,
          border: 2,
          borderStyle: 'dashed',
          borderColor: isDragOver ? 'primary.main' : 'grey.300',
          backgroundColor: isDragOver ? 'primary.50' : 'background.paper',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'primary.50',
          },
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Drop files here or click to browse
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Upload to: {currentPath}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Max file size: {formatFileSize(maxFileSize)} • Max files: {maxFiles}
          {allowedTypes.length > 0 && ` • Allowed types: ${allowedTypes.join(', ')}`}
        </Typography>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
          accept={allowedTypes.length > 0 ? allowedTypes.map(t => `.${t}`).join(',') : undefined}
        />
      </Paper>

      {/* Upload Dialog */}
      <Dialog
        open={showUploadDialog}
        onClose={closeUploadDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { height: '70vh', display: 'flex', flexDirection: 'column' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          <FolderIcon sx={{ mr: 1 }} />
          Upload Files to {currentPath}
          <Box sx={{ flexGrow: 1 }} />
          <Chip label={`${uploadFiles.length} files`} size="small" color="primary" />
        </DialogTitle>

        <DialogContent sx={{ flex: 1, overflow: 'auto', p: 0 }}>
          {uploadFiles.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No files selected for upload</Typography>
            </Box>
          ) : (
            <List>
              {uploadFiles.map(uploadFile => (
                <ListItem key={uploadFile.id} divider>
                  <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                    {getStatusIcon(uploadFile.status)}
                  </Box>

                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {uploadFile.file.name}
                        </Typography>
                        <Chip
                          label={uploadFile.status}
                          size="small"
                          color={getStatusColor(uploadFile.status)}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(uploadFile.file.size)}
                        </Typography>

                        {uploadFile.status === 'uploading' && (
                          <LinearProgress
                            variant="determinate"
                            value={uploadFile.progress}
                            sx={{ mt: 1, height: 6, borderRadius: 3 }}
                          />
                        )}

                        {uploadFile.error && (
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ display: 'block', mt: 1 }}
                          >
                            Error: {uploadFile.error}
                          </Typography>
                        )}
                      </Box>
                    }
                  />

                  <ListItemSecondaryAction>
                    {uploadFile.status === 'pending' && (
                      <IconButton edge="end" onClick={() => removeFile(uploadFile.id)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    )}
                    {uploadFile.status === 'uploading' && (
                      <IconButton edge="end" onClick={() => cancelUpload(uploadFile)} size="small">
                        <CancelIcon />
                      </IconButton>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={clearCompleted} disabled={hasActiveUploads}>
            Clear Completed
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={closeUploadDialog}>Close</Button>
          <Button
            onClick={startAllUploads}
            variant="contained"
            disabled={!hasPendingUploads || hasActiveUploads}
            startIcon={<UploadIcon />}
          >
            Start Upload
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
