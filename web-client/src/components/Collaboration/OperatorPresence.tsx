/**
 * Operator Presence Component
 * Shows real-time presence indicators for all operators
 * Implements requirements 16.2, 16.3
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  Badge,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Person as PersonIcon,
  AdminPanelSettings as AdminIcon,
  Visibility as ViewIcon,
  Message as MessageIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../hooks/useAuth';

interface OperatorPresence {
  operatorId: string;
  username: string;
  role: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  lastActivity: string;
  currentImplant?: string;
  currentAction?: string;
  socketId?: string;
}

interface OperatorPresenceProps {
  onSendMessage?: (operatorId: string, username: string) => void;
  onInitiateTakeover?: (operatorId: string, username: string) => void;
}

export const OperatorPresence: React.FC<OperatorPresenceProps> = ({
  onSendMessage,
  onInitiateTakeover,
}) => {
  const { user } = useAuth();
  const { socket, isConnected } = useWebSocket();
  const [operators, setOperators] = useState<OperatorPresence[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedOperator, setSelectedOperator] = useState<OperatorPresence | null>(null);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Request initial presence data
    socket.emit('requestPresence');

    // Listen for presence updates
    const handlePresenceUpdate = (data: OperatorPresence) => {
      setOperators(prev => {
        const existing = prev.find(op => op.operatorId === data.operatorId);
        if (existing) {
          return prev.map(op => (op.operatorId === data.operatorId ? data : op));
        } else {
          return [...prev, data];
        }
      });
    };

    socket.on('operatorPresenceUpdate', handlePresenceUpdate);
    socket.on('operatorPresence', (data: { presence: OperatorPresence[] }) => {
      setOperators(data.presence);
    });

    return () => {
      socket.off('operatorPresenceUpdate', handlePresenceUpdate);
      socket.off('operatorPresence');
    };
  }, [socket, isConnected]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#4caf50';
      case 'away':
        return '#ff9800';
      case 'busy':
        return '#f44336';
      case 'offline':
        return '#9e9e9e';
      default:
        return '#9e9e9e';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'away':
        return 'Away';
      case 'busy':
        return 'Busy';
      case 'offline':
        return 'Offline';
      default:
        return 'Unknown';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'administrator':
        return <AdminIcon />;
      case 'operator':
        return <PersonIcon />;
      case 'read_only':
        return <ViewIcon />;
      default:
        return <PersonIcon />;
    }
  };

  const formatLastActivity = (lastActivity: string) => {
    const date = new Date(lastActivity);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, operator: OperatorPresence) => {
    setAnchorEl(event.currentTarget);
    setSelectedOperator(operator);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedOperator(null);
  };

  const handleSendMessage = () => {
    if (selectedOperator && onSendMessage) {
      onSendMessage(selectedOperator.operatorId, selectedOperator.username);
    }
    handleMenuClose();
  };

  const handleInitiateTakeover = () => {
    if (selectedOperator && onInitiateTakeover) {
      onInitiateTakeover(selectedOperator.operatorId, selectedOperator.username);
    }
    handleMenuClose();
  };

  const canInitiateTakeover =
    user?.role === 'administrator' && selectedOperator?.operatorId !== user?.id;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Operator Presence ({operators.filter(op => op.status !== 'offline').length} online)
        </Typography>

        <List dense>
          {operators.map(operator => (
            <ListItem key={operator.operatorId}>
              <ListItemAvatar>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  badgeContent={
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: getStatusColor(operator.status),
                        border: '2px solid white',
                      }}
                    />
                  }
                >
                  <Avatar sx={{ bgcolor: 'primary.main' }}>{getRoleIcon(operator.role)}</Avatar>
                </Badge>
              </ListItemAvatar>

              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight="medium">
                      {operator.username}
                      {operator.operatorId === user?.id && ' (You)'}
                    </Typography>
                    <Chip
                      label={getStatusText(operator.status)}
                      size="small"
                      sx={{
                        backgroundColor: getStatusColor(operator.status),
                        color: 'white',
                        fontSize: '0.7rem',
                        height: 20,
                      }}
                    />
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {formatLastActivity(operator.lastActivity)}
                    </Typography>
                    {operator.currentImplant && (
                      <Typography variant="caption" display="block" color="primary">
                        Working on: {operator.currentImplant}
                        {operator.currentAction && ` (${operator.currentAction})`}
                      </Typography>
                    )}
                  </Box>
                }
              />

              {operator.operatorId !== user?.id && (
                <ListItemSecondaryAction>
                  <Tooltip title="Actions">
                    <IconButton edge="end" size="small" onClick={e => handleMenuOpen(e, operator)}>
                      <MoreVertIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              )}
            </ListItem>
          ))}

          {operators.length === 0 && (
            <ListItem>
              <ListItemText
                primary="No operators online"
                secondary="You are the only operator currently connected"
              />
            </ListItem>
          )}
        </List>

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
          <MenuItem onClick={handleSendMessage}>
            <MessageIcon sx={{ mr: 1 }} />
            Send Message
          </MenuItem>

          {canInitiateTakeover && (
            <MenuItem onClick={handleInitiateTakeover}>
              <AdminIcon sx={{ mr: 1 }} />
              Initiate Takeover
            </MenuItem>
          )}
        </Menu>
      </CardContent>
    </Card>
  );
};
