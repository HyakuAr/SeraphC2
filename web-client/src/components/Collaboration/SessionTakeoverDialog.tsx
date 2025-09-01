/**
 * Session Takeover Dialog Component
 * Handles administrator session takeover capabilities
 * Implements requirements 16.7
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
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
  Computer as ComputerIcon,
  AccessTime as TimeIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../hooks/useAuth';

interface SessionTakeover {
  id: string;
  targetOperatorId: string;
  adminOperatorId: string;
  implantId?: string;
  reason: string;
  timestamp: string;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  notificationSent: boolean;
  originalSessionData?: any;
}

interface SessionTakeoverDialogProps {
  open: boolean;
  onClose: () => void;
  targetOperatorId?: string;
  targetUsername?: string;
  implantId?: string;
}

export const SessionTakeoverDialog: React.FC<SessionTakeoverDialogProps> = ({
  open,
  onClose,
  targetOperatorId,
  targetUsername,
  implantId,
}) => {
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const [reason, setReason] = useState('');
  const [selectedImplant, setSelectedImplant] = useState(implantId || '');
  const [isInitiating, setIsInitiating] = useState(false);
  const [activeTakeover, setActiveTakeover] = useState<SessionTakeover | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleTakeoverStatus = (takeover: SessionTakeover) => {
      if (takeover.adminOperatorId === user?.id) {
        setActiveTakeover(takeover);
      }
    };

    const handleSessionTakeover = (takeover: SessionTakeover) => {
      if (takeover.targetOperatorId === user?.id) {
        // Current user is being taken over
        setActiveTakeover(takeover);
      }
    };

    socket.on('takeoverStatus', handleTakeoverStatus);
    socket.on('sessionTakeover', handleSessionTakeover);

    return () => {
      socket.off('takeoverStatus', handleTakeoverStatus);
      socket.off('sessionTakeover', handleSessionTakeover);
    };
  }, [socket, user?.id]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setReason('');
      setSelectedImplant(implantId || '');
      setActiveTakeover(null);
    }
  }, [open, implantId]);

  const handleInitiateTakeover = async () => {
    if (!socket || !targetOperatorId || !reason.trim()) return;

    setIsInitiating(true);
    try {
      socket.emit('initiateSessionTakeover', {
        targetOperatorId,
        reason: reason.trim(),
        implantId: selectedImplant || undefined,
      });
    } catch (error) {
      console.error('Failed to initiate session takeover:', error);
    } finally {
      setIsInitiating(false);
    }
  };

  const handleCompleteTakeover = async () => {
    if (!socket || !activeTakeover) return;

    try {
      socket.emit('completeSessionTakeover', {
        takeoverId: activeTakeover.id,
      });

      // Close dialog after completion
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Failed to complete session takeover:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'active':
        return 'error';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'default';
      default:
        return 'default';
    }
  };

  const isAdmin = user?.role === 'administrator';
  const isTargetUser = user?.id === targetOperatorId;

  if (!isAdmin && !isTargetUser) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '400px' },
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <AdminIcon color="error" />
          <Typography variant="h6">
            {isTargetUser ? 'Session Takeover Notice' : 'Initiate Session Takeover'}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {isTargetUser && activeTakeover ? (
          // Show takeover notice to target user
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body1" fontWeight="medium">
                An administrator is requesting to take over your session.
              </Typography>
            </Alert>

            <List dense>
              <ListItem>
                <ListItemIcon>
                  <AdminIcon />
                </ListItemIcon>
                <ListItemText primary="Administrator" secondary={activeTakeover.adminOperatorId} />
              </ListItem>

              <ListItem>
                <ListItemIcon>
                  <TimeIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Requested At"
                  secondary={formatTimestamp(activeTakeover.timestamp)}
                />
              </ListItem>

              {activeTakeover.implantId && (
                <ListItem>
                  <ListItemIcon>
                    <ComputerIcon />
                  </ListItemIcon>
                  <ListItemText primary="Affected Implant" secondary={activeTakeover.implantId} />
                </ListItem>
              )}

              <ListItem>
                <ListItemIcon>
                  <WarningIcon />
                </ListItemIcon>
                <ListItemText primary="Reason" secondary={activeTakeover.reason} />
              </ListItem>

              <ListItem>
                <ListItemIcon>
                  <AdminIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Status"
                  secondary={
                    <Chip
                      label={activeTakeover.status.toUpperCase()}
                      color={getStatusColor(activeTakeover.status) as any}
                      size="small"
                    />
                  }
                />
              </ListItem>
            </List>

            {activeTakeover.status === 'pending' && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  Your session will be taken over shortly. Please save any important work and
                  prepare to hand over control to the administrator.
                </Typography>
              </Alert>
            )}

            {activeTakeover.status === 'active' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  Your session has been taken over by an administrator. You may be disconnected from
                  the current implant.
                </Typography>
              </Alert>
            )}
          </Box>
        ) : isAdmin ? (
          // Show takeover initiation form to admin
          <Box>
            {!activeTakeover ? (
              <>
                <Alert severity="warning" sx={{ mb: 3 }}>
                  <Typography variant="body1" fontWeight="medium">
                    You are about to initiate a session takeover. This will forcibly disconnect the
                    target operator from their current session.
                  </Typography>
                </Alert>

                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>
                    Takeover Details
                  </Typography>

                  <List dense>
                    <ListItem>
                      <ListItemIcon>
                        <PersonIcon />
                      </ListItemIcon>
                      <ListItemText
                        primary="Target Operator"
                        secondary={`${targetUsername} (${targetOperatorId})`}
                      />
                    </ListItem>

                    <ListItem>
                      <ListItemIcon>
                        <AdminIcon />
                      </ListItemIcon>
                      <ListItemText
                        primary="Administrator"
                        secondary={`${user?.username} (${user?.id})`}
                      />
                    </ListItem>
                  </List>
                </Box>

                <Box mb={3}>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Specific Implant (Optional)</InputLabel>
                    <Select
                      value={selectedImplant}
                      label="Specific Implant (Optional)"
                      onChange={e => setSelectedImplant(e.target.value)}
                    >
                      <MenuItem value="">All implants</MenuItem>
                      {/* Add implant options here */}
                    </Select>
                  </FormControl>

                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Reason for Takeover"
                    placeholder="Provide a detailed reason for this session takeover..."
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    required
                    helperText="This reason will be logged and shown to the target operator"
                  />
                </Box>

                <Alert severity="error">
                  <Typography variant="body2">
                    <strong>Warning:</strong> This action will immediately notify the target
                    operator and may disrupt their current work. Use this feature responsibly and
                    only when necessary.
                  </Typography>
                </Alert>
              </>
            ) : (
              // Show active takeover status
              <Box>
                <Alert
                  severity={activeTakeover.status === 'completed' ? 'success' : 'info'}
                  sx={{ mb: 3 }}
                >
                  <Typography variant="body1" fontWeight="medium">
                    Session takeover{' '}
                    {activeTakeover.status === 'completed' ? 'completed' : 'in progress'}.
                  </Typography>
                </Alert>

                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <PersonIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Target Operator"
                      secondary={activeTakeover.targetOperatorId}
                    />
                  </ListItem>

                  <ListItem>
                    <ListItemIcon>
                      <TimeIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Initiated At"
                      secondary={formatTimestamp(activeTakeover.timestamp)}
                    />
                  </ListItem>

                  <ListItem>
                    <ListItemIcon>
                      <AdminIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Status"
                      secondary={
                        <Chip
                          label={activeTakeover.status.toUpperCase()}
                          color={getStatusColor(activeTakeover.status) as any}
                          size="small"
                        />
                      }
                    />
                  </ListItem>
                </List>

                {activeTakeover.status === 'pending' && (
                  <Box mt={2}>
                    <Button
                      variant="contained"
                      color="error"
                      onClick={handleCompleteTakeover}
                      fullWidth
                    >
                      Complete Takeover
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {activeTakeover?.status === 'completed' ? 'Close' : 'Cancel'}
        </Button>

        {isAdmin && !activeTakeover && (
          <Button
            variant="contained"
            color="error"
            onClick={handleInitiateTakeover}
            disabled={isInitiating || !reason.trim()}
          >
            {isInitiating ? 'Initiating...' : 'Initiate Takeover'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};
