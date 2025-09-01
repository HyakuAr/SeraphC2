/**
 * Enhanced File Browser Component - Interactive file system browser with tree view, drag-drop, and preview
 * Implements requirements 5.1, 5.2, 5.3, 5.5, 10.1, 10.2, 10.4 for enhanced file management
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Breadcrumbs,
  Link,
  Toolbar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  ArrowBack as BackIcon,
  Home as HomeIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as RenameIcon,
  FileCopy as CopyIcon,
  Refresh as RefreshIcon,
  ViewList as ListViewIcon,
  ViewModule as GridViewIcon,
  Visibility as PreviewIcon,
  Security as IntegrityIcon,
} from '@mui/icons-material';
import { FileService, FileInfo, DirectoryListing } from '../../services/fileService';
import { FileTreeView } from './FileTreeView';
import { FilePreview } from './FilePreview';
import { DragDropUpload } from './DragDropUpload';
import { BatchFileOperations } from './BatchFileOperations';
import { FileTransferProgressComponent } from './FileTransferProgress';

interface FileBrowserProps {
  implantId: string;
  initialPath?: string;
}

interface ViewSettings {
  showTreeView: boolean;
  viewMode: 'list' | 'grid';
  showHiddenFiles: boolean;
  enableIntegrityCheck: boolean;
}

interface FileOperationDialog {
  open: boolean;
  type: 'rename' | 'copy' | 'delete' | null;
  file: FileInfo | null;
  newName: string;
  destinationPath: string;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ implantId, initialPath = 'C:\\' }) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [viewSettings, setViewSettings] = useState<ViewSettings>({
    showTreeView: true,
    viewMode: 'list',
    showHiddenFiles: false,
    enableIntegrityCheck: true,
  });
  const [operationDialog, setOperationDialog] = useState<FileOperationDialog>({
    open: false,
    type: null,
    file: null,
    newName: '',
    destinationPath: '',
  });

  // Load directory listing
  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await FileService.listFiles({
          implantId,
          path,
          recursive: false,
        });
        setListing(result);
        setCurrentPath(path);
        setSelectedFiles(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directory');
      } finally {
        setLoading(false);
      }
    },
    [implantId]
  );

  // Initial load
  useEffect(() => {
    loadDirectory(currentPath);
  }, [loadDirectory, currentPath]);

  // Navigate to parent directory
  const navigateUp = () => {
    const parentPath = currentPath.split(/[/\\]/).slice(0, -1).join('\\');
    if (parentPath && parentPath !== currentPath) {
      loadDirectory(parentPath || 'C:\\');
    }
  };

  // Navigate to directory
  const navigateToDirectory = (path: string) => {
    loadDirectory(path);
  };

  // Handle file selection
  const toggleFileSelection = (fileName: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileName)) {
      newSelection.delete(fileName);
    } else {
      newSelection.add(fileName);
    }
    setSelectedFiles(newSelection);
  };

  // Handle file double-click
  const handleFileDoubleClick = (file: FileInfo) => {
    if (file.isDirectory) {
      navigateToDirectory(file.path);
    }
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        await FileService.uploadFile({
          implantId,
          remotePath: currentPath,
          file,
        });
        // Refresh directory after upload
        loadDirectory(currentPath);
      } catch (err) {
        setError(
          `Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }
    setUploadDialogOpen(false);
  };

  // Handle file operations
  const handleFileOperation = async () => {
    if (!operationDialog.file || !operationDialog.type) return;

    try {
      switch (operationDialog.type) {
        case 'delete':
          await FileService.deleteFile(implantId, operationDialog.file.path);
          break;
        case 'rename':
          const newPath = operationDialog.file.path.replace(
            operationDialog.file.name,
            operationDialog.newName
          );
          await FileService.renameFile(implantId, operationDialog.file.path, newPath);
          break;
        case 'copy':
          await FileService.copyFile(
            implantId,
            operationDialog.file.path,
            operationDialog.destinationPath
          );
          break;
      }

      // Refresh directory after operation
      loadDirectory(currentPath);
      setOperationDialog({
        open: false,
        type: null,
        file: null,
        newName: '',
        destinationPath: '',
      });
    } catch (err) {
      setError(
        `Failed to ${operationDialog.type} file: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  // Open operation dialog
  const openOperationDialog = (type: 'rename' | 'copy' | 'delete', file: FileInfo) => {
    setOperationDialog({
      open: true,
      type,
      file,
      newName: type === 'rename' ? file.name : '',
      destinationPath: type === 'copy' ? currentPath : '',
    });
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Generate breadcrumbs
  const generateBreadcrumbs = () => {
    const parts = currentPath.split(/[/\\]/).filter(Boolean);
    const breadcrumbs = [{ name: 'Root', path: 'C:\\' }];

    let currentBreadcrumbPath = 'C:';
    for (const part of parts.slice(1)) {
      currentBreadcrumbPath += '\\' + part;
      breadcrumbs.push({ name: part, path: currentBreadcrumbPath });
    }

    return breadcrumbs;
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Enhanced Toolbar */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar variant="dense">
          <IconButton onClick={navigateUp} disabled={loading}>
            <BackIcon />
          </IconButton>
          <IconButton onClick={() => navigateToDirectory('C:\\')} disabled={loading}>
            <HomeIcon />
          </IconButton>
          <IconButton onClick={() => loadDirectory(currentPath)} disabled={loading}>
            <RefreshIcon />
          </IconButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          <IconButton
            onClick={() =>
              setViewSettings(prev => ({
                ...prev,
                viewMode: prev.viewMode === 'list' ? 'grid' : 'list',
              }))
            }
            title={`Switch to ${viewSettings.viewMode === 'list' ? 'grid' : 'list'} view`}
          >
            {viewSettings.viewMode === 'list' ? <GridViewIcon /> : <ListViewIcon />}
          </IconButton>

          <FormControlLabel
            control={
              <Switch
                checked={viewSettings.showTreeView}
                onChange={e =>
                  setViewSettings(prev => ({ ...prev, showTreeView: e.target.checked }))
                }
                size="small"
              />
            }
            label="Tree"
            sx={{ ml: 1 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={viewSettings.enableIntegrityCheck}
                onChange={e =>
                  setViewSettings(prev => ({ ...prev, enableIntegrityCheck: e.target.checked }))
                }
                size="small"
              />
            }
            label="Integrity"
            sx={{ ml: 1 }}
          />

          <Box sx={{ flexGrow: 1 }} />

          <Button
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
            disabled={loading}
            size="small"
          >
            Upload
          </Button>

          {selectedFiles.size > 0 && (
            <>
              <Button
                startIcon={<DownloadIcon />}
                onClick={() => {
                  // Handle download of selected files with integrity check
                  selectedFiles.forEach(async fileName => {
                    const file = listing?.files.find(f => f.name === fileName);
                    if (file) {
                      try {
                        await FileService.downloadFile({
                          implantId,
                          remotePath: file.path,
                          checksum: viewSettings.enableIntegrityCheck,
                        });
                      } catch (err) {
                        setError(
                          `Failed to download ${fileName}: ${err instanceof Error ? err.message : 'Unknown error'}`
                        );
                      }
                    }
                  });
                }}
                disabled={loading}
                size="small"
              >
                Download
              </Button>
              <Button
                startIcon={<PreviewIcon />}
                onClick={() => {
                  const firstSelected = Array.from(selectedFiles)[0];
                  const file = listing?.files.find(f => f.name === firstSelected);
                  if (file && !file.isDirectory) {
                    setPreviewFile(file);
                  }
                }}
                disabled={loading || selectedFiles.size !== 1}
                size="small"
              >
                Preview
              </Button>
            </>
          )}
        </Toolbar>

        {/* Breadcrumbs */}
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Breadcrumbs>
            {generateBreadcrumbs().map((crumb, index) => (
              <Link
                key={index}
                component="button"
                variant="body2"
                onClick={() => navigateToDirectory(crumb.path)}
                sx={{ textDecoration: 'none' }}
              >
                {crumb.name}
              </Link>
            ))}
          </Breadcrumbs>
        </Box>
      </Paper>

      {/* File Transfer Progress */}
      <FileTransferProgressComponent implantId={implantId} />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Main Content Area */}
      <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden' }}>
        {/* Tree View Sidebar */}
        {viewSettings.showTreeView && (
          <Paper sx={{ width: 300, display: 'flex', flexDirection: 'column' }}>
            <FileTreeView
              implantId={implantId}
              onDirectorySelect={navigateToDirectory}
              onFileSelect={file => setSelectedFiles(new Set([file.name]))}
              onFilePreview={setPreviewFile}
              selectedPath={currentPath}
            />
          </Paper>
        )}

        {/* Main File Area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Drag and Drop Upload Area */}
          <Box sx={{ mb: 2 }}>
            <DragDropUpload
              implantId={implantId}
              currentPath={currentPath}
              onUploadComplete={() => loadDirectory(currentPath)}
              maxFileSize={100 * 1024 * 1024} // 100MB
              maxFiles={20}
            />
          </Box>

          {/* File List/Grid */}
          <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {loading ? (
              <Box
                sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}
              >
                <CircularProgress />
              </Box>
            ) : listing ? (
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {/* Directory Info */}
                <Box
                  sx={{
                    p: 2,
                    borderBottom: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Chip label={`${listing.totalFiles} files`} size="small" />
                  <Chip label={`${listing.totalDirectories} directories`} size="small" />
                  <Chip label={`Total: ${formatFileSize(listing.totalSize)}`} size="small" />
                  {viewSettings.enableIntegrityCheck && (
                    <Chip
                      icon={<IntegrityIcon />}
                      label="Integrity Check Enabled"
                      size="small"
                      color="success"
                    />
                  )}
                </Box>

                {/* Batch Operations */}
                <BatchFileOperations
                  implantId={implantId}
                  files={listing.files}
                  selectedFiles={selectedFiles}
                  onSelectionChange={setSelectedFiles}
                  onOperationComplete={() => loadDirectory(currentPath)}
                />
              </Box>
            ) : (
              <Box
                sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  No directory loaded
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </Box>

      {/* File Preview Dialog */}
      <FilePreview
        open={Boolean(previewFile)}
        file={previewFile}
        implantId={implantId}
        onClose={() => setPreviewFile(null)}
      />

      {/* File Operation Dialog */}
      <Dialog
        open={operationDialog.open}
        onClose={() => setOperationDialog({ ...operationDialog, open: false })}
      >
        <DialogTitle>
          {operationDialog.type === 'delete' && 'Delete File'}
          {operationDialog.type === 'rename' && 'Rename File'}
          {operationDialog.type === 'copy' && 'Copy File'}
        </DialogTitle>
        <DialogContent>
          {operationDialog.type === 'delete' && (
            <Typography>Are you sure you want to delete "{operationDialog.file?.name}"?</Typography>
          )}
          {operationDialog.type === 'rename' && (
            <TextField
              fullWidth
              label="New Name"
              value={operationDialog.newName}
              onChange={e => setOperationDialog({ ...operationDialog, newName: e.target.value })}
              margin="normal"
            />
          )}
          {operationDialog.type === 'copy' && (
            <TextField
              fullWidth
              label="Destination Path"
              value={operationDialog.destinationPath}
              onChange={e =>
                setOperationDialog({ ...operationDialog, destinationPath: e.target.value })
              }
              margin="normal"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOperationDialog({ ...operationDialog, open: false })}>
            Cancel
          </Button>
          <Button onClick={handleFileOperation} color="primary">
            {operationDialog.type === 'delete' ? 'Delete' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
