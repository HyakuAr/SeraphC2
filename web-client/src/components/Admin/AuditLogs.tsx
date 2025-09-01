/**
 * Audit Logs Component
 * Provides interface for viewing and filtering audit logs
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Info as InfoIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { auditService } from '../../services/auditService';

interface AuditLog {
  id: string;
  operatorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

interface AuditStatistics {
  totalLogs: number;
  successfulActions: number;
  failedActions: number;
  uniqueOperators: number;
  topActions: Array<{ action: string; count: number }>;
}

const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [statistics, setStatistics] = useState<AuditStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    success: '',
    startDate: null as Date | null,
    endDate: null as Date | null,
    operatorId: '',
  });

  const pageSize = 50;

  useEffect(() => {
    loadLogs();
    loadStatistics();
  }, [page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryParams = new URLSearchParams({
        limit: pageSize.toString(),
        offset: ((page - 1) * pageSize).toString(),
      });

      if (filters.action) queryParams.append('action', filters.action);
      if (filters.resourceType) queryParams.append('resourceType', filters.resourceType);
      if (filters.success) queryParams.append('success', filters.success);
      if (filters.startDate) queryParams.append('startDate', filters.startDate.toISOString());
      if (filters.endDate) queryParams.append('endDate', filters.endDate.toISOString());
      if (filters.operatorId) queryParams.append('operatorId', filters.operatorId);

      const response = await auditService.getLogs(queryParams.toString());

      if (response.success && response.data) {
        setLogs(response.data);
        // Calculate total pages based on whether we got a full page
        setTotalPages(response.data.length === pageSize ? page + 1 : page);
      } else {
        throw new Error(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append('startDate', filters.startDate.toISOString());
      if (filters.endDate) queryParams.append('endDate', filters.endDate.toISOString());

      const response = await auditService.getStatistics(queryParams.toString());

      if (response.success && response.data) {
        setStatistics(response.data);
      }
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };

  const handleFilterChange = (field: string, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(1); // Reset to first page when filters change
  };

  const handleClearFilters = () => {
    setFilters({
      action: '',
      resourceType: '',
      success: '',
      startDate: null,
      endDate: null,
      operatorId: '',
    });
    setPage(1);
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setDetailsDialogOpen(true);
  };

  const getStatusIcon = (success: boolean) => {
    return success ? (
      <SuccessIcon color="success" fontSize="small" />
    ) : (
      <ErrorIcon color="error" fontSize="small" />
    );
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading && logs.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Audit Logs
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Statistics Cards */}
        {statistics && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Total Logs
                  </Typography>
                  <Typography variant="h5">{statistics.totalLogs.toLocaleString()}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Successful Actions
                  </Typography>
                  <Typography variant="h5" color="success.main">
                    {statistics.successfulActions.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Failed Actions
                  </Typography>
                  <Typography variant="h5" color="error.main">
                    {statistics.failedActions.toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Active Operators
                  </Typography>
                  <Typography variant="h5">{statistics.uniqueOperators}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Filters */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <FilterIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Filters
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Action</InputLabel>
                  <Select
                    value={filters.action}
                    onChange={e => handleFilterChange('action', e.target.value)}
                    label="Action"
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="login">Login</MenuItem>
                    <MenuItem value="logout">Logout</MenuItem>
                    <MenuItem value="execute_command">Execute Command</MenuItem>
                    <MenuItem value="upload_file">Upload File</MenuItem>
                    <MenuItem value="download_file">Download File</MenuItem>
                    <MenuItem value="view_implants">View Implants</MenuItem>
                    <MenuItem value="update_operator_role">Update Role</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Resource</InputLabel>
                  <Select
                    value={filters.resourceType}
                    onChange={e => handleFilterChange('resourceType', e.target.value)}
                    label="Resource"
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="implant">Implant</MenuItem>
                    <MenuItem value="command">Command</MenuItem>
                    <MenuItem value="file">File</MenuItem>
                    <MenuItem value="operator">Operator</MenuItem>
                    <MenuItem value="system">System</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.success}
                    onChange={e => handleFilterChange('success', e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="">All</MenuItem>
                    <MenuItem value="true">Success</MenuItem>
                    <MenuItem value="false">Failed</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <DatePicker
                  label="Start Date"
                  value={filters.startDate}
                  onChange={date => handleFilterChange('startDate', date)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <DatePicker
                  label="End Date"
                  value={filters.endDate}
                  onChange={date => handleFilterChange('endDate', date)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <Box display="flex" gap={1}>
                  <Button variant="outlined" size="small" onClick={handleClearFilters}>
                    Clear
                  </Button>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={loadLogs}
                  >
                    Refresh
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardContent>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Resource</TableCell>
                    <TableCell>Operator</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          {getStatusIcon(log.success)}
                          <Chip
                            label={log.success ? 'Success' : 'Failed'}
                            color={log.success ? 'success' : 'error'}
                            size="small"
                          />
                        </Box>
                      </TableCell>
                      <TableCell>{formatDate(log.createdAt)}</TableCell>
                      <TableCell>{formatAction(log.action)}</TableCell>
                      <TableCell>
                        <Chip label={log.resourceType} variant="outlined" size="small" />
                      </TableCell>
                      <TableCell>{log.operatorId || 'System'}</TableCell>
                      <TableCell>{log.ipAddress || '-'}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          startIcon={<InfoIcon />}
                          onClick={() => handleViewDetails(log)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <Box display="flex" justifyContent="center" mt={2}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, newPage) => setPage(newPage)}
                color="primary"
              />
            </Box>
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <Dialog
          open={detailsDialogOpen}
          onClose={() => setDetailsDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>Audit Log Details</DialogTitle>
          <DialogContent>
            {selectedLog && (
              <Box>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Action</Typography>
                    <Typography variant="body2">{formatAction(selectedLog.action)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Resource Type</Typography>
                    <Typography variant="body2">{selectedLog.resourceType}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Status</Typography>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getStatusIcon(selectedLog.success)}
                      <Typography variant="body2">
                        {selectedLog.success ? 'Success' : 'Failed'}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Timestamp</Typography>
                    <Typography variant="body2">{formatDate(selectedLog.createdAt)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">IP Address</Typography>
                    <Typography variant="body2">{selectedLog.ipAddress || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle2">Resource ID</Typography>
                    <Typography variant="body2">{selectedLog.resourceId || 'N/A'}</Typography>
                  </Grid>
                  {selectedLog.errorMessage && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2">Error Message</Typography>
                      <Typography variant="body2" color="error">
                        {selectedLog.errorMessage}
                      </Typography>
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <Typography variant="subtitle2">Details</Typography>
                    <Paper sx={{ p: 1, bgcolor: 'grey.100' }}>
                      <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </pre>
                    </Paper>
                  </Grid>
                  {selectedLog.userAgent && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2">User Agent</Typography>
                      <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                        {selectedLog.userAgent}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default AuditLogs;
