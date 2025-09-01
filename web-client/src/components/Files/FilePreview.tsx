/**
 * File Preview Component - Preview text, images, and documents
 * Implements requirement 10.3 for file preview capabilities
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { FileService, FileInfo } from '../../services/fileService';

interface FilePreviewProps {
  open: boolean;
  file: FileInfo | null;
  implantId: string;
  onClose: () => void;
}

interface PreviewContent {
  type: 'text' | 'image' | 'binary' | 'error';
  content: string;
  encoding?: string;
  size: number;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`preview-tabpanel-${index}`}
      aria-labelledby={`preview-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 0 }}>{children}</Box>}
    </div>
  );
};

export const FilePreview: React.FC<FilePreviewProps> = ({ open, file, implantId, onClose }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<PreviewContent | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [imageZoom, setImageZoom] = useState<number>(100);

  // Determine file type
  const getFileType = (fileName: string): 'text' | 'image' | 'document' | 'binary' => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    const textExtensions = [
      'txt',
      'log',
      'cfg',
      'conf',
      'ini',
      'xml',
      'json',
      'yaml',
      'yml',
      'md',
      'csv',
    ];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

    if (textExtensions.includes(extension)) return 'text';
    if (imageExtensions.includes(extension)) return 'image';
    if (documentExtensions.includes(extension)) return 'document';
    return 'binary';
  };

  // Check if file is previewable
  const isPreviewable = (file: FileInfo): boolean => {
    if (file.isDirectory) return false;
    if (file.size > 10 * 1024 * 1024) return false; // 10MB limit

    const fileType = getFileType(file.name);
    return fileType === 'text' || fileType === 'image';
  };

  // Load file content for preview
  const loadPreviewContent = async (file: FileInfo) => {
    if (!isPreviewable(file)) {
      setPreviewContent({
        type: 'error',
        content: 'File cannot be previewed (too large or unsupported format)',
        size: file.size,
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // In a real implementation, this would be a specific preview endpoint
      // For now, we'll simulate the preview functionality
      const fileType = getFileType(file.name);

      if (fileType === 'text') {
        // Simulate text file content loading
        const mockContent = `// Preview of ${file.name}\n// This is a simulated preview\n// In a real implementation, this would load the actual file content\n\nFile: ${file.name}\nSize: ${file.size} bytes\nLast Modified: ${file.lastModified}\nPath: ${file.path}`;

        setPreviewContent({
          type: 'text',
          content: mockContent,
          encoding: 'utf-8',
          size: file.size,
        });
      } else if (fileType === 'image') {
        // For images, we would typically get a base64 encoded version
        // This is a placeholder for the actual implementation
        setPreviewContent({
          type: 'image',
          content: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`, // 1x1 transparent pixel
          size: file.size,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file preview');
      setPreviewContent({
        type: 'error',
        content: 'Failed to load file content',
        size: file.size,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle file download
  const handleDownload = async () => {
    if (!file) return;

    try {
      await FileService.downloadFile({
        implantId,
        remotePath: file.path,
        checksum: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
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

  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Handle image zoom
  const handleZoomIn = () => {
    setImageZoom(prev => Math.min(prev + 25, 500));
  };

  const handleZoomOut = () => {
    setImageZoom(prev => Math.max(prev - 25, 25));
  };

  const resetZoom = () => {
    setImageZoom(100);
  };

  // Load content when file changes
  useEffect(() => {
    if (open && file) {
      setActiveTab(0);
      setImageZoom(100);
      loadPreviewContent(file);
    } else {
      setPreviewContent(null);
      setError(null);
    }
  }, [open, file]);

  if (!file) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '80vh', display: 'flex', flexDirection: 'column' },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 1 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" component="div">
            {file.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatFileSize(file.size)} • {formatDate(file.lastModified)} • {file.path}
          </Typography>
        </Box>
        <IconButton onClick={handleDownload} sx={{ mr: 1 }}>
          <DownloadIcon />
        </IconButton>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress />
          </Box>
        ) : previewContent ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Tabs */}
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Preview" />
              <Tab label="Properties" />
              {previewContent.type === 'text' && <Tab label="Hex View" />}
            </Tabs>

            {/* Preview Tab */}
            <TabPanel value={activeTab} index={0}>
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {previewContent.type === 'text' && (
                  <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {previewContent.content}
                    </pre>
                  </Paper>
                )}

                {previewContent.type === 'image' && (
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
                      <IconButton onClick={handleZoomOut} disabled={imageZoom <= 25}>
                        <ZoomOutIcon />
                      </IconButton>
                      <Button onClick={resetZoom} size="small">
                        {imageZoom}%
                      </Button>
                      <IconButton onClick={handleZoomIn} disabled={imageZoom >= 500}>
                        <ZoomInIcon />
                      </IconButton>
                    </Box>
                    <img
                      src={previewContent.content}
                      alt={file.name}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '60vh',
                        transform: `scale(${imageZoom / 100})`,
                        transformOrigin: 'center',
                      }}
                    />
                  </Box>
                )}

                {previewContent.type === 'error' && (
                  <Alert severity="warning">{previewContent.content}</Alert>
                )}
              </Box>
            </TabPanel>

            {/* Properties Tab */}
            <TabPanel value={activeTab} index={1}>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  File Properties
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: '150px 1fr' }}>
                  <Typography variant="body2" fontWeight="bold">
                    Name:
                  </Typography>
                  <Typography variant="body2">{file.name}</Typography>

                  <Typography variant="body2" fontWeight="bold">
                    Path:
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    {file.path}
                  </Typography>

                  <Typography variant="body2" fontWeight="bold">
                    Size:
                  </Typography>
                  <Typography variant="body2">
                    {formatFileSize(file.size)} ({file.size.toLocaleString()} bytes)
                  </Typography>

                  <Typography variant="body2" fontWeight="bold">
                    Type:
                  </Typography>
                  <Typography variant="body2">{file.isDirectory ? 'Directory' : 'File'}</Typography>

                  <Typography variant="body2" fontWeight="bold">
                    Last Modified:
                  </Typography>
                  <Typography variant="body2">{formatDate(file.lastModified)}</Typography>

                  <Typography variant="body2" fontWeight="bold">
                    Permissions:
                  </Typography>
                  <Typography variant="body2">{file.permissions || 'Unknown'}</Typography>

                  {file.owner && (
                    <>
                      <Typography variant="body2" fontWeight="bold">
                        Owner:
                      </Typography>
                      <Typography variant="body2">{file.owner}</Typography>
                    </>
                  )}

                  {previewContent.encoding && (
                    <>
                      <Typography variant="body2" fontWeight="bold">
                        Encoding:
                      </Typography>
                      <Typography variant="body2">{previewContent.encoding}</Typography>
                    </>
                  )}
                </Box>
              </Box>
            </TabPanel>

            {/* Hex View Tab */}
            {previewContent.type === 'text' && (
              <TabPanel value={activeTab} index={2}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Hex View
                  </Typography>
                  <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <pre
                      style={{
                        margin: 0,
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        lineHeight: 1.4,
                      }}
                    >
                      {/* Simulate hex view - in real implementation, this would show actual hex data */}
                      00000000 2f 2f 20 50 72 65 76 69 65 77 20 6f 66 20 74 65 |// Preview of te|
                      00000010 73 74 2e 74 78 74 0a 2f 2f 20 54 68 69 73 20 69 |st.txt.// This i|
                      00000020 73 20 61 20 73 69 6d 75 6c 61 74 65 64 20 70 72 |s a simulated pr|
                      00000030 65 76 69 65 77 0a |eview.|
                    </pre>
                  </Paper>
                </Box>
              </TabPanel>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography color="text.secondary">No preview available</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
