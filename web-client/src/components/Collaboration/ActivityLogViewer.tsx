/**
 * Activity Log Viewer Component
 * Shows comprehensive activity logging with operator identification
 * Implements requirements 16.6
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Grid,
  Paper,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuth } from '../../hooks/useAuth';

interface ActivityLog {
  id: string;
  operatorId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: any;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  implantId?: string;
  success: boolean;
  error?: string;
}

interface ActivityLogViewerProps {
  operatorId?: string; // Filter by specific operator
  implantId?: string; // Filter by specific implant
  maxHeight?: string;
}

export const ActivityLogViewer: React.FC<ActivityLogViewerProps> = ({
  operatorId,
  implantId,
  maxHeight = '600px',
}) => {
  const { user } = useAuth();
  const { socket, isConnected } = useWebSocket();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    operatorId: operatorId || '',
    action: '',
    resource: '',
    startDate: null as Date | null,
    endDate: null as Date | null,
    success: 'all' as 'all' | 'true' | 'false',
    implantId: implantId || '',
  });

  useEffect(() => {
    if (user?.role !== 'administrator') return;
    loadActivityLogs();
  }, [user, page, rowsPerPage]);

  useEffect(() => {
    if (!socket || !isConnected || user?.role !== 'administrator') return;

    const handleActivityLogUpdate = (log: ActivityLog) => {
      setLogs(prev => [log, ...prev.slice(0, rowsPerPage - 1)]);
      setTotalCount(prev => prev + 1);
    };

    socket.on('activityLogUpdate', handleActivityLogUpdate);

    return () => {
      socket.off('activityLogUpdate', handleActivityLogUpdate);
    };
  }, [socket, isConnected, user?.role, rowsPerPage]);

  const loadActivityLogs = async () => {
    if (!socket || user?.role !== 'administrator') return;

    setLoading(true);
    try {
      const requestFilters: any = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };

      // Apply filters
      if (filters.operatorId) requestFilters.operatorId = filters.operatorId;
      if (filters.action) requestFilters.action = filters.action;
      if (filters.resource) requestFilters.resource = filters.resource;
      if (filters.startDate) requestFilters.startDate = filters.startDate.toISOString();
      if (filters.endDate) requestFilters.endDate = filters.endDate.toISOString();
      if (filters.success !== 'all') requestFilters.success = filters.success === 'true';
      if (filters.implantId) requestFilters.implantId = filters.implantId;

      socket.emit('requestActivityLogs', { filters: requestFilters });

      // Listen for response
      const handleActivityLogs = (data: { logs: ActivityLog[]; count: number }) => {
        setLogs(data.logs);
        setTotalCount(data.count);
        socket.off('activityLogs', handleActivityLogs);
      };

      socket.on('activityLogs', handleActivityLogs);
    } catch (error) {
      console.error('Failed to load activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPage(0);
    loadActivityLogs();
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    setFilters({
      operatorId: operatorId || '',
      action: '',
      resource: '',
      startDate: null,
      endDate: null,
      success: 'all',
      implantId: implantId || '',
    });
    setPage(0);
  };

  const handleExportLogs = () => {
    // Create CSV export
    const csvHeaders = [
      'Timestamp',
      'Operator',
      'Action',
      'Resource',
      'Resource ID',
      'Success',
      'IP Address',
      'Error',
    ];

    const csvRows = logs.map(log => [
      new Date(log.timestamp).toLocaleString(),
      log.username,
      log.action,
      log.resource,
      log.resourceId || '',
      log.success ? 'Yes' : 'No',
      log.ipAddress || '',
      log.error || '',
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getActionColor = (action: string) => {
    if (action.includes('login') || action.includes('session_start')) return 'success';
    if (action.includes('logout') || action.includes('session_end')) return 'default';
    if (action.includes('error') || action.includes('failed')) return 'error';
    if (action.includes('takeover') || action.includes('conflict')) return 'warning';
    return 'primary';
  };

  const getResourceIcon = (resource: string) => {
    switch (resource) {
      case 'system':
        return <InfoIcon />;
      case 'implant_access':
        return <ViewIcon />;
      default:
        return <InfoIcon />;
    }
  };

  if (user?.role !== 'administrator') {
    return <Alert severity="warning">Activity logs are only available to administrators.</Alert>;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardHeader
          title="Activity Logs"
          action={
            <Box display="flex" gap={1}>
              <Tooltip title="Filters">
                <IconButton onClick={() => setShowFilters(true)}>
                  <FilterIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export">
                <IconButton onClick={handleExportLogs} disabled={logs.length === 0}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Refresh">
                <IconButton onClick={loadActivityLogs} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>
          }
        />

        <CardContent sx={{ flex: 1, p: 0 }}>
          <TableContainer sx={{ maxHeight }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Operator</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>IP Address</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id} hover>
                    <TableCell>
                      <Typography variant="body2">{formatTimestamp(log.timestamp)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {log.username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {log.operatorId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.action}
                        size="small"
                        color={getActionColor(log.action) as any}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getResourceIcon(log.resource)}
                        <Box>
                          <Typography variant="body2">{log.resource}</Typography>
                          {log.resourceId && (
                            <Typography variant="caption" color="text.secondary">
                              {log.resourceId}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        {log.success ? (
                          <SuccessIcon color="success" fontSize="small" />
                        ) : (
                          <ErrorIcon color="error" fontSize="small" />
                        )}
                        <Typography variant="body2">
                          {log.success ? 'Success' : 'Failed'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {log.ipAddress || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => setSelectedLog(log)}>
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={e => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </CardContent>

        {/* Filters Dialog */}
        <Dialog open={showFilters} onClose={() => setShowFilters(false)} maxWidth="md" fullWidth>
          <DialogTitle>Filter Activity Logs</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Operator ID"
                  value={filters.operatorId}
                  onChange={e => setFilters(prev => ({ ...prev, operatorId: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Action"
                  value={filters.action}
                  onChange={e => setFilters(prev => ({ ...prev, action: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Resource"
                  value={filters.resource}
                  onChange={e => setFilters(prev => ({ ...prev, resource: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Success Status</InputLabel>
                  <Select
                    value={filters.success}
                    label="Success Status"
                    onChange={e =>
                      setFilters(prev => ({ ...prev, success: e.target.value as any }))
                    }
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="true">Success Only</MenuItem>
                    <MenuItem value="false">Failed Only</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Start Date"
                  value={filters.startDate}
                  onChange={date => setFilters(prev => ({ ...prev, startDate: date }))}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="End Date"
                  value={filters.endDate}
                  onChange={date => setFilters(prev => ({ ...prev, endDate: date }))}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClearFilters}>Clear</Button>
            <Button onClick={() => setShowFilters(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
          </DialogActions>
        </Dialog>

        {/* Log Details Dialog */}
        <Dialog
          open={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Activity Log Details</DialogTitle>
          <DialogContent>
            {selectedLog && (
              <Box>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Timestamp
                      </Typography>
                      <Typography variant="body1">
                        {formatTimestamp(selectedLog.timestamp)}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Operator
                      </Typography>
                      <Typography variant="body1">
                        {selectedLog.username} ({selectedLog.operatorId})
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Action
                      </Typography>
                      <Typography variant="body1">{selectedLog.action}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Resource
                      </Typography>
                      <Typography variant="body1">
                        {selectedLog.resource}
                        {selectedLog.resourceId && ` (${selectedLog.resourceId})`}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Success
                      </Typography>
                      <Typography variant="body1">{selectedLog.success ? 'Yes' : 'No'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        IP Address
                      </Typography>
                      <Typography variant="body1" fontFamily="monospace">
                        {selectedLog.ipAddress || 'N/A'}
                      </Typography>
                    </Grid>
                    {selectedLog.error && (
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Error
                        </Typography>
                        <Typography variant="body1" color="error">
                          {selectedLog.error}
                        </Typography>
                      </Grid>
                    )}
                    {selectedLog.details && (
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Details
                        </Typography>
                        <Paper sx={{ p: 1, backgroundColor: 'grey.50' }}>
                          <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                            {JSON.stringify(selectedLog.details, null, 2)}
                          </pre>
                        </Paper>
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedLog(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Card>
    </LocalizationProvider>
  );
};
