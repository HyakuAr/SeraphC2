/**
 * ImplantDetails component - Displays detailed information about a specific implant
 */

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Computer as ComputerIcon,
  Person as PersonIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  NetworkCheck as NetworkIcon,
  Security as SecurityIcon,
  Schedule as ScheduleIcon,
  PowerSettingsNew as DisconnectIcon,
  Refresh as RefreshIcon,
  Terminal as TerminalIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../../store/store';
import { fetchImplantDetails, disconnectImplant } from '../../store/slices/implantSlice';
import { useWebSocket } from '../../hooks/useWebSocket';
import { EnhancedImplant } from '../../services/websocketService';
import CommandInterface from '../Commands/CommandInterface';

interface ImplantDetailsProps {
  implant: EnhancedImplant;
  loading?: boolean;
}

const ImplantDetails: React.FC<ImplantDetailsProps> = ({ implant, loading = false }) => {
  const dispatch = useDispatch<AppDispatch>();
  const { requestImplantDetails } = useWebSocket();
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    // Request real-time updates for this implant
    if (implant.id) {
      requestImplantDetails(implant.id);
    }
  }, [implant.id, requestImplantDetails]);

  const handleRefresh = () => {
    dispatch(fetchImplantDetails(implant.id));
  };

  const handleDisconnect = async () => {
    await dispatch(
      disconnectImplant({
        id: implant.id,
        reason: 'Manual disconnect by operator',
      })
    );
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getStatusColor = (status: string, isConnected: boolean) => {
    if (isConnected && status === 'active') return 'success';
    if (status === 'active') return 'warning';
    if (status === 'inactive') return 'warning';
    if (status === 'disconnected') return 'error';
    return 'default';
  };

  if (loading) {
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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              mb: 3,
            }}
          >
            <Box>
              <Typography variant="h5" sx={{ mb: 1 }}>
                {implant.hostname}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Chip
                  label={implant.isConnected ? 'Connected' : implant.status}
                  color={getStatusColor(implant.status, implant.isConnected)}
                  size="small"
                />
                <Chip
                  label={implant.communicationProtocol.toUpperCase()}
                  variant="outlined"
                  size="small"
                />
                <Chip
                  label={implant.privileges.toUpperCase()}
                  color={
                    implant.privileges === 'admin' || implant.privileges === 'system'
                      ? 'error'
                      : 'default'
                  }
                  variant="outlined"
                  size="small"
                />
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DisconnectIcon />}
                onClick={handleDisconnect}
                disabled={!implant.isConnected}
              >
                Disconnect
              </Button>
            </Box>
          </Box>

          {implant.isConnected && (
            <Alert severity="success" sx={{ mb: 3 }}>
              Implant is currently connected and responding to commands.
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Basic Information
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <ComputerIcon />
                  </ListItemIcon>
                  <ListItemText primary="Hostname" secondary={implant.hostname} />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <PersonIcon />
                  </ListItemIcon>
                  <ListItemText primary="Username" secondary={implant.username} />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <SecurityIcon />
                  </ListItemIcon>
                  <ListItemText primary="Privileges" secondary={implant.privileges} />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <ScheduleIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Last Seen"
                    secondary={new Date(implant.lastSeen).toLocaleString()}
                  />
                </ListItem>
                {implant.lastHeartbeat && (
                  <ListItem>
                    <ListItemIcon>
                      <NetworkIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary="Last Heartbeat"
                      secondary={new Date(implant.lastHeartbeat).toLocaleString()}
                    />
                  </ListItem>
                )}
              </List>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                System Information
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon>
                    <ComputerIcon />
                  </ListItemIcon>
                  <ListItemText primary="Operating System" secondary={implant.operatingSystem} />
                </ListItem>
                <ListItem>
                  <ListItemIcon>
                    <MemoryIcon />
                  </ListItemIcon>
                  <ListItemText primary="Architecture" secondary={implant.architecture} />
                </ListItem>
                {implant.systemInfo && (
                  <>
                    {implant.systemInfo.processorInfo && (
                      <ListItem>
                        <ListItemIcon>
                          <MemoryIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="Processor"
                          secondary={implant.systemInfo.processorInfo}
                        />
                      </ListItem>
                    )}
                    {implant.systemInfo.memoryTotal && (
                      <ListItem>
                        <ListItemIcon>
                          <MemoryIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="Total Memory"
                          secondary={formatBytes(implant.systemInfo.memoryTotal)}
                        />
                      </ListItem>
                    )}
                    {implant.systemInfo.diskSpace && (
                      <ListItem>
                        <ListItemIcon>
                          <StorageIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary="Disk Space"
                          secondary={formatBytes(implant.systemInfo.diskSpace)}
                        />
                      </ListItem>
                    )}
                  </>
                )}
              </List>
            </Grid>

            {implant.connectionInfo && (
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Connection Information
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2" color="text.secondary">
                      Protocol
                    </Typography>
                    <Typography variant="body1">
                      {implant.connectionInfo.protocol.toUpperCase()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2" color="text.secondary">
                      Remote Address
                    </Typography>
                    <Typography variant="body1">{implant.connectionInfo.remoteAddress}</Typography>
                  </Grid>
                  {implant.connectionInfo.userAgent && (
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2" color="text.secondary">
                        User Agent
                      </Typography>
                      <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
                        {implant.connectionInfo.userAgent}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </Grid>
            )}

            {implant.systemInfo?.networkInterfaces &&
              implant.systemInfo.networkInterfaces.length > 0 && (
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Network Interfaces
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {implant.systemInfo.networkInterfaces.map((iface, index) => (
                      <Chip key={index} label={iface} variant="outlined" size="small" />
                    ))}
                  </Box>
                </Grid>
              )}

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" sx={{ mb: 2 }}>
                Configuration
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Callback Interval
                  </Typography>
                  <Typography variant="body1">
                    {implant.configuration?.callbackInterval || 'N/A'}ms
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Jitter
                  </Typography>
                  <Typography variant="body1">{implant.configuration?.jitter || 'N/A'}%</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Max Retries
                  </Typography>
                  <Typography variant="body1">
                    {implant.configuration?.maxRetries || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    Uptime
                  </Typography>
                  <Typography variant="body1">
                    {formatUptime(implant.createdAt || implant.lastSeen)}
                  </Typography>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab icon={<InfoIcon />} label="System Info" iconPosition="start" />
            <Tab
              icon={<TerminalIcon />}
              label="Command Interface"
              iconPosition="start"
              disabled={!implant.isConnected}
            />
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {activeTab === 0 && (
            <CardContent sx={{ height: '100%', overflow: 'auto' }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Detailed System Information
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Additional system information and details will be displayed here. This section can
                be expanded to show more comprehensive system data, running processes, network
                connections, and other relevant information.
              </Typography>
            </CardContent>
          )}

          {activeTab === 1 && (
            <Box sx={{ height: '100%', p: 2 }}>
              <CommandInterface implant={implant} />
            </Box>
          )}
        </Box>
      </Card>
    </Box>
  );
};

export default ImplantDetails;
