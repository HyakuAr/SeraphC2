import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Computer as ComputerIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';
import { RootState, AppDispatch } from '../store/store';
import { fetchImplants, fetchImplantStats } from '../store/slices/implantSlice';
import { useWebSocket } from '../hooks/useWebSocket';
import ImplantList from '../components/Implants/ImplantList';

const DashboardPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { implants, stats, loading, error } = useSelector((state: RootState) => state.implants);
  const { isConnected } = useWebSocket();

  useEffect(() => {
    // Fetch initial data
    dispatch(fetchImplants());
    dispatch(fetchImplantStats());
  }, [dispatch]);

  const StatCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    subtitle?: string;
  }> = ({ title, value, icon, color, subtitle }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 1,
              backgroundColor: `${color}.main`,
              color: 'white',
              mr: 2,
            }}
          >
            {icon}
          </Box>
          <Typography variant="h6" color="text.secondary">
            {title}
          </Typography>
        </Box>
        <Typography variant="h3" sx={{ mb: 1 }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  if (loading && !stats) {
    return (
      <Box
        sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Dashboard</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isConnected ? (
            <>
              <WifiIcon color="success" />
              <Typography variant="body2" color="success.main">
                Connected
              </Typography>
            </>
          ) : (
            <>
              <WifiOffIcon color="error" />
              <Typography variant="body2" color="error.main">
                Disconnected
              </Typography>
            </>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Implants"
            value={stats?.total || 0}
            icon={<ComputerIcon />}
            color="primary"
            subtitle="Registered devices"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Implants"
            value={stats?.active || 0}
            icon={<SecurityIcon />}
            color="success"
            subtitle="Currently active"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Connected"
            value={stats?.connected || 0}
            icon={<WifiIcon />}
            color="info"
            subtitle="Real-time connections"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Inactive"
            value={stats?.inactive || 0}
            icon={<TimelineIcon />}
            color="warning"
            subtitle="Not responding"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <ImplantList implants={implants} loading={loading} />
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                System Status
              </Typography>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">WebSocket Connection</Typography>
                  <Typography variant="body2" color={isConnected ? 'success.main' : 'error.main'}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isConnected ? 100 : 0}
                  color={isConnected ? 'success' : 'error'}
                />
              </Box>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Active Sessions</Typography>
                  <Typography variant="body2">{stats?.connected || 0}</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={stats?.total ? (stats.connected / stats.total) * 100 : 0}
                />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Success Rate</Typography>
                  <Typography variant="body2">
                    {stats?.total ? Math.round((stats.active / stats.total) * 100) : 0}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={stats?.total ? (stats.active / stats.total) * 100 : 0}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DashboardPage;
