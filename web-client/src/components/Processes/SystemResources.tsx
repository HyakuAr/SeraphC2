/**
 * SystemResources - Component for displaying system resource information
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Card,
  CardContent,
  Chip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  NetworkCheck as NetworkIcon,
  Computer as ComputerIcon,
} from '@mui/icons-material';
import {
  SystemResources as SystemResourcesType,
  processService,
} from '../../services/processService';

interface SystemResourcesProps {
  implantId: string;
  systemResources: SystemResourcesType | null;
  onRefresh: () => void;
  loading: boolean;
}

export const SystemResources: React.FC<SystemResourcesProps> = ({
  implantId,
  systemResources,
  onRefresh,
  loading,
}) => {
  if (!systemResources) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6" color="text.secondary">
          No system resource data available
        </Typography>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          Load System Resources
        </Button>
      </Box>
    );
  }

  const memoryUsagePercent =
    (systemResources.memory.usedPhysical / systemResources.memory.totalPhysical) * 100;

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">System Resources</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* CPU Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ComputerIcon sx={{ mr: 1 }} />
                <Typography variant="h6">CPU</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Usage: {systemResources.cpu.usage.toFixed(1)}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={systemResources.cpu.usage}
                  sx={{ mt: 1, height: 8, borderRadius: 4 }}
                  color={
                    systemResources.cpu.usage > 80
                      ? 'error'
                      : systemResources.cpu.usage > 60
                        ? 'warning'
                        : 'primary'
                  }
                />
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Cores:</strong> {systemResources.cpu.cores}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Processes:</strong> {systemResources.cpu.processes}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Threads:</strong> {systemResources.cpu.threads}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Uptime:</strong> {processService.formatUptime(systemResources.uptime)}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Memory Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MemoryIcon sx={{ mr: 1 }} />
                <Typography variant="h6">Memory</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Usage: {processService.formatBytes(systemResources.memory.usedPhysical)} /{' '}
                  {processService.formatBytes(systemResources.memory.totalPhysical)} (
                  {memoryUsagePercent.toFixed(1)}%)
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={memoryUsagePercent}
                  sx={{ mt: 1, height: 8, borderRadius: 4 }}
                  color={
                    memoryUsagePercent > 80
                      ? 'error'
                      : memoryUsagePercent > 60
                        ? 'warning'
                        : 'primary'
                  }
                />
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Available:</strong>{' '}
                    {processService.formatBytes(systemResources.memory.availablePhysical)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Virtual Total:</strong>{' '}
                    {processService.formatBytes(systemResources.memory.totalVirtual)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Virtual Used:</strong>{' '}
                    {processService.formatBytes(systemResources.memory.usedVirtual)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>Page File:</strong>{' '}
                    {processService.formatBytes(systemResources.memory.pageFileUsage)}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Disk Information */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <StorageIcon sx={{ mr: 1 }} />
                <Typography variant="h6">Disk Drives</Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Drive</TableCell>
                      <TableCell>Label</TableCell>
                      <TableCell>File System</TableCell>
                      <TableCell>Total Size</TableCell>
                      <TableCell>Free Space</TableCell>
                      <TableCell>Used Space</TableCell>
                      <TableCell>Usage</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {systemResources.disk.drives.map(drive => (
                      <TableRow key={drive.drive}>
                        <TableCell>{drive.drive}</TableCell>
                        <TableCell>{drive.label || 'N/A'}</TableCell>
                        <TableCell>{drive.fileSystem}</TableCell>
                        <TableCell>{processService.formatBytes(drive.totalSize)}</TableCell>
                        <TableCell>{processService.formatBytes(drive.freeSpace)}</TableCell>
                        <TableCell>{processService.formatBytes(drive.usedSpace)}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={drive.usagePercentage}
                              sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                              color={
                                drive.usagePercentage > 90
                                  ? 'error'
                                  : drive.usagePercentage > 75
                                    ? 'warning'
                                    : 'primary'
                              }
                            />
                            <Typography variant="body2" sx={{ minWidth: 45 }}>
                              {drive.usagePercentage.toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Network Information */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <NetworkIcon sx={{ mr: 1 }} />
                <Typography variant="h6">Network Interfaces</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Total Bytes Received:</strong>{' '}
                  {processService.formatBytes(systemResources.network.totalBytesReceived)}
                </Typography>
                <Typography variant="body2">
                  <strong>Total Bytes Sent:</strong>{' '}
                  {processService.formatBytes(systemResources.network.totalBytesSent)}
                </Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Interface</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Bytes Received</TableCell>
                      <TableCell>Bytes Sent</TableCell>
                      <TableCell>Packets Received</TableCell>
                      <TableCell>Packets Sent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {systemResources.network.interfaces.map((iface, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {iface.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={iface.status || 'Unknown'}
                            color={iface.status === 'Up' ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {processService.formatBytes(iface.bytesReceived || 0)}
                        </TableCell>
                        <TableCell>{processService.formatBytes(iface.bytesSent || 0)}</TableCell>
                        <TableCell>{(iface.packetsReceived || 0).toLocaleString()}</TableCell>
                        <TableCell>{(iface.packetsSent || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Last updated: {systemResources.timestamp.toLocaleString()}
        </Typography>
      </Box>
    </Box>
  );
};
