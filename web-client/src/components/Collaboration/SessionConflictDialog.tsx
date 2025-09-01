/**
 * Session Conflict Dialog Component
 * Handles session conflict prevention and resolution
 * Implements requirements 16.3, 16.7
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  AccessTime as TimeIcon,
} from '@mui/icons-material';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../hooks/useAuth';

interface SessionConflict {
  id: string;
  implantId: string;
  conflictType: 'concurrent_access' | 'command_execution' | 'file_operation' | 'screen_control';
  primaryOperatorId: string;
  conflictingOperatorId: string;
  timestamp: string;
  status: 'active' | 'resolved' | 'escalated';
  resolution?: 'takeover' | 'queue' | 'abort' | 'share';
  resolvedBy?: string;
  resolvedAt?: string;
}

interface SessionConflictDialogProps {
  conflict: SessionConflict | null;
  onClose: () => void;
  onResolved?: (conflict: SessionConflict, resolution: string) => void;
}

export const SessionConflictDialog: React.FC<SessionConflictDialogProps> = ({
  conflict,
  onClose,
  onResolved,
}) => {
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const [selectedResolution, setSelectedResolution] = useState<string>('queue');
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleConflictUpdate = (updatedConflict: SessionConflict) => {
      if (conflict && updatedConflict.id === conflict.id) {
        if (updatedConflict.status === 'resolved' && onResolved) {
          onResolved(updatedConflict, updatedConflict.resolution || 'unknown');
        }
      }
    };

    socket.on('sessionConflict', handleConflictUpdate);

    return () => {
      socket.off('sessionConflict', handleConflictUpdate);
    };
  }, [socket, conflict, onResolved]);

  if (!conflict) return null;

  const isCurrentUserInvolved =
    conflict.primaryOperatorId === user?.id || conflict.conflictingOperatorId === user?.id;

  const isCurrentUserPrimary = conflict.primaryOperatorId === user?.id;
  const isCurrentUserConflicting = conflict.conflictingOperatorId === user?.id;

  const getConflictTypeDescription = (type: string) => {
    switch (type) {
      case 'concurrent_access':
        return 'Multiple operators are trying to access the same implant simultaneously';
      case 'command_execution':
        return 'Another operator is currently executing commands on this implant';
      case 'file_operation':
        return 'A file operation is in progress by another operator';
      case 'screen_control':
        return 'Another operator is controlling the screen/desktop of this implant';
      default:
        return 'A session conflict has been detected';
    }
  };

  const getConflictTypeColor = (type: string) => {
    switch (type) {
      case 'concurrent_access':
        return 'warning';
      case 'command_execution':
        return 'error';
      case 'file_operation':
        return 'info';
      case 'screen_control':
        return 'error';
      default:
        return 'warning';
    }
  };

  const handleResolve = async () => {
    if (!socket || !selectedResolution) return;

    setIsResolving(true);
    try {
      socket.emit('resolveConflict', {
        conflictId: conflict.id,
        resolution: selectedResolution,
      });

      // Close dialog after a short delay to allow for server response
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setIsResolving(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getResolutionOptions = () => {
    const options = [
      {
        value: 'queue',
        label: 'Queue my request',
        description: 'Wait for the other operator to finish their current operation',
      },
      {
        value: 'abort',
        label: 'Abort my request',
        description: 'Cancel my operation and try again later',
      },
    ];

    if (isCurrentUserPrimary) {
      options.unshift({
        value: 'share',
        label: 'Allow shared access',
        description: 'Allow both operators to work on this implant simultaneously',
      });
    }

    if (user?.role === 'administrator') {
      options.push({
        value: 'takeover',
        label: 'Force takeover (Admin)',
        description: 'Forcibly take control and disconnect the other operator',
      });
    }

    return options;
  };

  return (
    <Dialog
      open={true}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '400px' },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningIcon color="warning" />
          <Typography variant="h6">Session Conflict Detected</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity={getConflictTypeColor(conflict.conflictType) as any} sx={{ mb: 3 }}>
          <Typography variant="body1" fontWeight="medium">
            {getConflictTypeDescription(conflict.conflictType)}
          </Typography>
        </Alert>

        <Box mb={3}>
          <Typography variant="h6" gutterBottom>
            Conflict Details
          </Typography>

          <List dense>
            <ListItem>
              <ListItemIcon>
                <ComputerIcon />
              </ListItemIcon>
              <ListItemText primary="Implant ID" secondary={conflict.implantId} />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <PersonIcon />
              </ListItemIcon>
              <ListItemText
                primary="Primary Operator"
                secondary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <span>{conflict.primaryOperatorId}</span>
                    {isCurrentUserPrimary && <Chip label="You" size="small" color="primary" />}
                  </Box>
                }
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <PersonIcon />
              </ListItemIcon>
              <ListItemText
                primary="Conflicting Operator"
                secondary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <span>{conflict.conflictingOperatorId}</span>
                    {isCurrentUserConflicting && (
                      <Chip label="You" size="small" color="secondary" />
                    )}
                  </Box>
                }
              />
            </ListItem>

            <ListItem>
              <ListItemIcon>
                <TimeIcon />
              </ListItemIcon>
              <ListItemText primary="Detected At" secondary={formatTimestamp(conflict.timestamp)} />
            </ListItem>
          </List>
        </Box>

        {isCurrentUserInvolved && conflict.status === 'active' && (
          <Box>
            <FormControl component="fieldset">
              <FormLabel component="legend">
                <Typography variant="h6" gutterBottom>
                  How would you like to resolve this conflict?
                </Typography>
              </FormLabel>

              <RadioGroup
                value={selectedResolution}
                onChange={e => setSelectedResolution(e.target.value)}
              >
                {getResolutionOptions().map(option => (
                  <FormControlLabel
                    key={option.value}
                    value={option.value}
                    control={<Radio />}
                    label={
                      <Box>
                        <Typography variant="body1" fontWeight="medium">
                          {option.label}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {option.description}
                        </Typography>
                      </Box>
                    }
                    sx={{ mb: 1, alignItems: 'flex-start' }}
                  />
                ))}
              </RadioGroup>
            </FormControl>
          </Box>
        )}

        {conflict.status === 'resolved' && (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Typography variant="body1">
              This conflict has been resolved with resolution:{' '}
              <strong>{conflict.resolution}</strong>
            </Typography>
            {conflict.resolvedBy && (
              <Typography variant="body2" color="text.secondary">
                Resolved by: {conflict.resolvedBy} at{' '}
                {conflict.resolvedAt && formatTimestamp(conflict.resolvedAt)}
              </Typography>
            )}
          </Alert>
        )}

        {!isCurrentUserInvolved && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body1">
              This conflict involves other operators. You can monitor its resolution status here.
            </Typography>
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{conflict.status === 'resolved' ? 'Close' : 'Cancel'}</Button>

        {isCurrentUserInvolved && conflict.status === 'active' && (
          <Button
            variant="contained"
            onClick={handleResolve}
            disabled={isResolving || !selectedResolution}
          >
            {isResolving ? 'Resolving...' : 'Resolve Conflict'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
