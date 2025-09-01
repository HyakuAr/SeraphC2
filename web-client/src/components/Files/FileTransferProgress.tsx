/**
 * File Transfer Progress Component - Shows active file transfers
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  LinearProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Collapse,
  Alert,
} from '@mui/material';
import {
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CloudUpload as UploadIcon,
  CloudDownload as DownloadIcon,
  CheckCircle as CompleteIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { FileService, FileTransferProgress } from '../../services/fileService';

interface FileTransferProgressProps {
  implantId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const FileTransferProgressComponent: React.FC<FileTransferProgressProps> = ({
  implantId,
  autoRefresh = true,
  refreshInterval = 2000,
}) => {
  const [transfers, setTransfers] = useState<FileTransferProgress[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean>(true);

  // Load active transfers
  const loadTransfers = async () => {
    try {
      setLoading(true);
      const activeTransfers = await FileService.getActiveTransfers();

      // Filter by implant if specified
      const filteredTransfers = implantId
        ? activeTransfers.filter(t => t.transferId.includes(implantId))
        : activeTransfers;

      setTransfers(filteredTransfers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh transfers
  useEffect(() => {
    loadTransfers();

    if (autoRefresh) {
      const interval = setInterval(loadTransfers, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, implantId]);

  // Cancel transfer
  const handleCancelTransfer = async (transferId: string) => {
    try {
      await FileService.cancelTransfer(transferId);
      // Refresh transfers after cancellation
      loadTransfers();
    } catch (err) {
      setError(
        `Failed to cancel transfer: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  // Format transfer speed
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
      case 'transferring':
        return transfers[0]?.transferId.includes('upload') ? (
          <UploadIcon color="primary" />
        ) : (
          <DownloadIcon color="primary" />
        );
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
      case 'transferring':
        return 'primary';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (transfers.length === 0 && !loading) {
    return null;
  }

  return (
    <Paper sx={{ mb: 2 }}>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          borderBottom: expanded ? 1 : 0,
          borderColor: 'divider',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="h6" sx={{ flex: 1 }}>
          File Transfers ({transfers.length})
        </Typography>
        <IconButton size="small">{expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Transfer List */}
      <Collapse in={expanded}>
        <List>
          {transfers.map(transfer => (
            <ListItem key={transfer.transferId} divider>
              <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                {getStatusIcon(transfer.status)}
              </Box>

              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {transfer.fileName}
                    </Typography>
                    <Chip
                      label={transfer.status}
                      size="small"
                      color={getStatusColor(transfer.status)}
                    />
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(transfer.transferredSize)} /{' '}
                      {formatFileSize(transfer.totalSize)}
                      {transfer.status === 'transferring' && <> • {formatSpeed(transfer.speed)}</>}
                    </Typography>

                    {transfer.status === 'transferring' && (
                      <LinearProgress
                        variant="determinate"
                        value={transfer.progress}
                        sx={{ mt: 1, height: 6, borderRadius: 3 }}
                      />
                    )}

                    {transfer.error && (
                      <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                        Error: {transfer.error}
                      </Typography>
                    )}
                  </Box>
                }
              />

              <ListItemSecondaryAction>
                {(transfer.status === 'pending' || transfer.status === 'transferring') && (
                  <IconButton
                    edge="end"
                    onClick={() => handleCancelTransfer(transfer.transferId)}
                    size="small"
                  >
                    <CancelIcon />
                  </IconButton>
                )}
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Paper>
  );
};
