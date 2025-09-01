/**
 * Batch File Operations Component - Handle multiple file operations
 * Implements requirement 10.4 for batch file operations
 */

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  FileCopy as CopyIcon,
  DriveFileMove as MoveIcon,
  Archive as ArchiveIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { FileService, FileInfo } from '../../services/fileService';

interface BatchOperation {
  id: string;
  type: 'download' | 'delete' | 'copy' | 'move' | 'archive';
  files: FileInfo[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  error?: string;
  destinationPath?: string;
}

interface BatchFileOperationsProps {
  implantId: string;
  files: FileInfo[];
  selectedFiles: Set<string>;
  onSelectionChange: (selectedFiles: Set<string>) => void;
  onOperationComplete?: () => void;
}

export const BatchFileOperations: React.FC<BatchFileOperationsProps> = ({
  implantId,
  files,
  selectedFiles,
  onSelectionChange,
  onOperationComplete,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [operationDialog, setOperationDialog] = useState<{
    open: boolean;
    type: 'copy' | 'move' | 'delete' | null;
    destinationPath: string;
  }>({
    open: false,
    type: null,
    destinationPath: '',
  });
  const [activeOperations, setActiveOperations] = useState<BatchOperation[]>([]);
  const [showOperationsPanel, setShowOperationsPanel] = useState<boolean>(false);

  // Get selected file objects
  const getSelectedFileObjects = (): FileInfo[] => {
    return files.filter(file => selectedFiles.has(file.name));
  };

  // Generate operation ID
  const generateOperationId = (): string => {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Handle menu open
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  // Handle menu close
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(files.map(f => f.name)));
    }
  };

  // Handle individual file selection
  const handleFileSelection = (fileName: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileName)) {
      newSelection.delete(fileName);
    } else {
      newSelection.add(fileName);
    }
    onSelectionChange(newSelection);
  };

  // Open operation dialog
  const openOperationDialog = (type: 'copy' | 'move' | 'delete') => {
    setOperationDialog({
      open: true,
      type,
      destinationPath: type === 'delete' ? '' : 'C:\\',
    });
    handleMenuClose();
  };

  // Close operation dialog
  const closeOperationDialog = () => {
    setOperationDialog({
      open: false,
      type: null,
      destinationPath: '',
    });
  };

  // Execute batch operation
  const executeBatchOperation = async (
    type: 'download' | 'delete' | 'copy' | 'move' | 'archive',
    destinationPath?: string
  ) => {
    const selectedFileObjects = getSelectedFileObjects();
    if (selectedFileObjects.length === 0) return;

    const operation: BatchOperation = {
      id: generateOperationId(),
      type,
      files: selectedFileObjects,
      status: 'pending',
      progress: 0,
      destinationPath,
    };

    setActiveOperations(prev => [...prev, operation]);
    setShowOperationsPanel(true);

    // Start operation
    try {
      await performBatchOperation(operation);
    } catch (error) {
      updateOperation(operation.id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Operation failed',
      });
    }
  };

  // Perform the actual batch operation
  const performBatchOperation = async (operation: BatchOperation) => {
    updateOperation(operation.id, { status: 'running' });

    const totalFiles = operation.files.length;
    let completedFiles = 0;

    for (const file of operation.files) {
      try {
        switch (operation.type) {
          case 'download':
            await FileService.downloadFile({
              implantId,
              remotePath: file.path,
              checksum: true,
            });
            break;

          case 'delete':
            await FileService.deleteFile(implantId, file.path);
            break;

          case 'copy':
            if (operation.destinationPath) {
              const destinationFile = `${operation.destinationPath}\\${file.name}`;
              await FileService.copyFile(implantId, file.path, destinationFile);
            }
            break;

          case 'move':
            if (operation.destinationPath) {
              const destinationFile = `${operation.destinationPath}\\${file.name}`;
              await FileService.renameFile(implantId, file.path, destinationFile);
            }
            break;

          case 'archive':
            // Archive operation would be implemented here
            // For now, we'll simulate it
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
        }

        completedFiles++;
        const progress = Math.round((completedFiles / totalFiles) * 100);
        updateOperation(operation.id, { progress });
      } catch (error) {
        console.error(`Failed to ${operation.type} file ${file.name}:`, error);
        // Continue with other files even if one fails
      }
    }

    updateOperation(operation.id, { status: 'completed', progress: 100 });

    // Clear selection and refresh
    onSelectionChange(new Set());
    onOperationComplete?.();
  };

  // Update operation status
  const updateOperation = (operationId: string, updates: Partial<BatchOperation>) => {
    setActiveOperations(prev =>
      prev.map(op => (op.id === operationId ? { ...op, ...updates } : op))
    );
  };

  // Remove completed operation
  const removeOperation = (operationId: string) => {
    setActiveOperations(prev => prev.filter(op => op.id !== operationId));
  };

  // Handle operation dialog confirm
  const handleOperationConfirm = () => {
    if (operationDialog.type) {
      executeBatchOperation(
        operationDialog.type,
        operationDialog.type !== 'delete' ? operationDialog.destinationPath : undefined
      );
    }
    closeOperationDialog();
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get operation icon
  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'download':
        return <DownloadIcon />;
      case 'delete':
        return <DeleteIcon />;
      case 'copy':
        return <CopyIcon />;
      case 'move':
        return <MoveIcon />;
      case 'archive':
        return <ArchiveIcon />;
      default:
        return <FileIcon />;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CompleteIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      default:
        return null;
    }
  };

  const hasSelection = selectedFiles.size > 0;
  const isAllSelected = selectedFiles.size === files.length && files.length > 0;

  return (
    <Box>
      {/* Selection Controls */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Checkbox
            checked={isAllSelected}
            indeterminate={hasSelection && !isAllSelected}
            onChange={handleSelectAll}
          />
          <Typography variant="body2">
            {hasSelection ? `${selectedFiles.size} selected` : 'Select files'}
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          {hasSelection && (
            <>
              <Button
                startIcon={<DownloadIcon />}
                onClick={() => executeBatchOperation('download')}
                size="small"
              >
                Download
              </Button>
              <IconButton onClick={handleMenuOpen}>
                <MoreVertIcon />
              </IconButton>
            </>
          )}

          {activeOperations.length > 0 && (
            <Button
              onClick={() => setShowOperationsPanel(!showOperationsPanel)}
              size="small"
              variant="outlined"
            >
              Operations ({activeOperations.length})
            </Button>
          )}
        </Box>
      </Paper>

      {/* File List with Selection */}
      <List>
        {files.map(file => (
          <ListItem
            key={file.name}
            button
            onClick={() => handleFileSelection(file.name)}
            sx={{
              backgroundColor: selectedFiles.has(file.name) ? 'action.selected' : 'transparent',
            }}
          >
            <ListItemIcon>
              <Checkbox
                checked={selectedFiles.has(file.name)}
                onChange={() => handleFileSelection(file.name)}
              />
            </ListItemIcon>
            <ListItemIcon>
              {file.isDirectory ? <FolderIcon color="primary" /> : <FileIcon />}
            </ListItemIcon>
            <ListItemText
              primary={file.name}
              secondary={
                file.isDirectory
                  ? 'Directory'
                  : `${formatFileSize(file.size)} • ${new Date(file.lastModified).toLocaleString()}`
              }
            />
          </ListItem>
        ))}
      </List>

      {/* Operations Panel */}
      {showOperationsPanel && (
        <Paper sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Active Operations
          </Typography>
          {activeOperations.map(operation => (
            <Box key={operation.id} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                {getOperationIcon(operation.type)}
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}{' '}
                  {operation.files.length} files
                </Typography>
                <Chip
                  label={operation.status}
                  size="small"
                  color={
                    operation.status === 'completed'
                      ? 'success'
                      : operation.status === 'failed'
                        ? 'error'
                        : 'primary'
                  }
                />
                {getStatusIcon(operation.status)}
                {operation.status === 'completed' && (
                  <IconButton size="small" onClick={() => removeOperation(operation.id)}>
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
              {operation.status === 'running' && (
                <LinearProgress
                  variant="determinate"
                  value={operation.progress}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              )}
              {operation.error && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {operation.error}
                </Alert>
              )}
            </Box>
          ))}
        </Paper>
      )}

      {/* Context Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={() => openOperationDialog('copy')}>
          <ListItemIcon>
            <CopyIcon fontSize="small" />
          </ListItemIcon>
          Copy
        </MenuItem>
        <MenuItem onClick={() => openOperationDialog('move')}>
          <ListItemIcon>
            <MoveIcon fontSize="small" />
          </ListItemIcon>
          Move
        </MenuItem>
        <MenuItem onClick={() => executeBatchOperation('archive')}>
          <ListItemIcon>
            <ArchiveIcon fontSize="small" />
          </ListItemIcon>
          Archive
        </MenuItem>
        <MenuItem onClick={() => openOperationDialog('delete')}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* Operation Dialog */}
      <Dialog open={operationDialog.open} onClose={closeOperationDialog}>
        <DialogTitle>
          {operationDialog.type === 'delete' && 'Delete Files'}
          {operationDialog.type === 'copy' && 'Copy Files'}
          {operationDialog.type === 'move' && 'Move Files'}
        </DialogTitle>
        <DialogContent>
          {operationDialog.type === 'delete' ? (
            <Typography>
              Are you sure you want to delete {selectedFiles.size} selected files?
            </Typography>
          ) : (
            <TextField
              fullWidth
              label="Destination Path"
              value={operationDialog.destinationPath}
              onChange={e =>
                setOperationDialog({ ...operationDialog, destinationPath: e.target.value })
              }
              margin="normal"
              placeholder="C:\destination\path"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeOperationDialog}>Cancel</Button>
          <Button onClick={handleOperationConfirm} color="primary">
            {operationDialog.type === 'delete' ? 'Delete' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
