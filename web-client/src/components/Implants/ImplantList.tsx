/**
 * ImplantList component - Displays list of implants with real-time status
 */

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Computer as ComputerIcon,
  Circle as CircleIcon,
  PowerSettingsNew as DisconnectIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../store/store';
import { disconnectImplant, setSelectedImplant } from '../../store/slices/implantSlice';
import { EnhancedImplant } from '../../services/websocketService';

interface ImplantListProps {
  implants: EnhancedImplant[];
  loading: boolean;
}

const ImplantList: React.FC<ImplantListProps> = ({ implants, loading }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedImplantId, setSelectedImplantId] = useState<string | null>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, implantId: string) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedImplantId(implantId);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedImplantId(null);
  };

  const handleDisconnect = async () => {
    if (selectedImplantId) {
      await dispatch(
        disconnectImplant({
          id: selectedImplantId,
          reason: 'Manual disconnect by operator',
        })
      );
    }
    handleMenuClose();
  };

  const handleViewDetails = () => {
    if (selectedImplantId) {
      const implant = implants.find(i => i.id === selectedImplantId);
      if (implant) {
        dispatch(setSelectedImplant(implant));
        // TODO: Navigate to implant details page
        console.log('View details for implant:', implant.hostname);
      }
    }
    handleMenuClose();
  };

  const getStatusColor = (status: string, isConnected: boolean) => {
    if (isConnected && status === 'active') return 'success';
    if (status === 'active') return 'warning';
    if (status === 'inactive') return 'warning';
    if (status === 'disconnected') return 'error';
    return 'default';
  };

  const getStatusText = (status: string, isConnected: boolean) => {
    if (isConnected && status === 'active') return 'Connected';
    if (status === 'active') return 'Active';
    if (status === 'inactive') return 'Inactive';
    if (status === 'disconnected') return 'Disconnected';
    return status;
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getOSIcon = (os: string) => {
    if (os.toLowerCase().includes('windows')) {
      return '🪟';
    }
    if (os.toLowerCase().includes('linux')) {
      return '🐧';
    }
    if (os.toLowerCase().includes('mac')) {
      return '🍎';
    }
    return '💻';
  };

  if (loading && implants.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (implants.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Implants
          </Typography>
          <Alert severity="info">
            No implants registered yet. Deploy an implant to see it appear here.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Implants ({implants.length})
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {implants.map(implant => (
            <Box
              key={implant.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  backgroundColor: 'action.hover',
                  borderColor: 'primary.main',
                },
              }}
              onClick={() => handleViewDetails()}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <ComputerIcon />
                </Avatar>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                      {implant.hostname}
                    </Typography>
                    <Typography variant="body2">{getOSIcon(implant.operatingSystem)}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {implant.username} • {implant.operatingSystem} • {implant.architecture}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Last seen: {formatLastSeen(implant.lastSeen)}
                    </Typography>
                    {implant.isConnected && (
                      <>
                        <CircleIcon sx={{ fontSize: 4, color: 'success.main' }} />
                        <Typography variant="caption" color="success.main">
                          Live
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title={`Protocol: ${implant.communicationProtocol.toUpperCase()}`}>
                  <Chip
                    label={implant.communicationProtocol.toUpperCase()}
                    size="small"
                    variant="outlined"
                  />
                </Tooltip>
                <Chip
                  label={getStatusText(implant.status, implant.isConnected)}
                  color={getStatusColor(implant.status, implant.isConnected)}
                  size="small"
                />
                <Tooltip title={`Privileges: ${implant.privileges}`}>
                  <Chip
                    label={implant.privileges.toUpperCase()}
                    size="small"
                    color={
                      implant.privileges === 'admin' || implant.privileges === 'system'
                        ? 'error'
                        : 'default'
                    }
                    variant="outlined"
                  />
                </Tooltip>
                <IconButton size="small" onClick={e => handleMenuOpen(e, implant.id)}>
                  <MoreVertIcon />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          <MenuItem onClick={handleViewDetails}>
            <InfoIcon sx={{ mr: 1 }} />
            View Details
          </MenuItem>
          <MenuItem onClick={handleDisconnect} sx={{ color: 'error.main' }}>
            <DisconnectIcon sx={{ mr: 1 }} />
            Disconnect
          </MenuItem>
        </Menu>
      </CardContent>
    </Card>
  );
};

export default ImplantList;
