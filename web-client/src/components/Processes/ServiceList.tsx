/**
 * ServiceList - Component for displaying and managing Windows services
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  RestartAlt as RestartIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import {
  processService,
  ServiceInfo,
  ServiceFilter,
  ServiceOperationResult,
} from '../../services/processService';

interface ServiceListProps {
  implantId: string;
}

export const ServiceList: React.FC<ServiceListProps> = ({ implantId }) => {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Filter state
  const [filter, setFilter] = useState<ServiceFilter>({});
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Running' | 'Stopped' | 'Paused' | ''>('');
  const [filterStartType, setFilterStartType] = useState<'Automatic' | 'Manual' | 'Disabled' | ''>(
    ''
  );

  // Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    action: () => {},
  });

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);

      const currentFilter: ServiceFilter = {};
      if (filterName) currentFilter.name = filterName;
      if (filterStatus) currentFilter.status = filterStatus;
      if (filterStartType) currentFilter.startType = filterStartType;

      const result = await processService.getServiceList(
        implantId,
        Object.keys(currentFilter).length > 0 ? currentFilter : undefined
      );

      setServices(result.services);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleStartService = async (service: ServiceInfo) => {
    try {
      const result = await processService.startService(implantId, service.name);
      if (result.success) {
        await loadServices();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start service');
    }
  };

  const handleStopService = async (service: ServiceInfo) => {
    try {
      const result = await processService.stopService(implantId, service.name);
      if (result.success) {
        await loadServices();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop service');
    }
  };

  const handleRestartService = async (service: ServiceInfo) => {
    try {
      const result = await processService.restartService(implantId, service.name);
      if (result.success) {
        await loadServices();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart service');
    }
  };

  const openConfirmDialog = (title: string, message: string, action: () => void) => {
    setConfirmDialog({
      open: true,
      title,
      message,
      action,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      open: false,
      title: '',
      message: '',
      action: () => {},
    });
  };

  const applyFilters = () => {
    setPage(0);
    loadServices();
  };

  const clearFilters = () => {
    setFilterName('');
    setFilterStatus('');
    setFilterStartType('');
    setPage(0);
    // Load services without filters
    setTimeout(loadServices, 100);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  useEffect(() => {
    loadServices();
  }, [implantId]);

  const displayedServices = services.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Services ({totalCount})</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadServices}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Filters
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              label="Service Name"
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                label="Status"
                onChange={e => setFilterStatus(e.target.value as any)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Running">Running</MenuItem>
                <MenuItem value="Stopped">Stopped</MenuItem>
                <MenuItem value="Paused">Paused</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Start Type</InputLabel>
              <Select
                value={filterStartType}
                label="Start Type"
                onChange={e => setFilterStartType(e.target.value as any)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Automatic">Automatic</MenuItem>
                <MenuItem value="Manual">Manual</MenuItem>
                <MenuItem value="Disabled">Disabled</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<SearchIcon />}
                onClick={applyFilters}
                disabled={loading}
              >
                Apply
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearIcon />}
                onClick={clearFilters}
                disabled={loading}
              >
                Clear
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Display Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Start Type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedServices.map(service => (
              <TableRow key={service.name} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {service.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title={service.displayName}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {service.displayName}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip
                    label={service.status}
                    color={processService.getServiceStatusColor(service.status) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip label={service.startType} variant="outlined" size="small" />
                </TableCell>
                <TableCell>
                  <Tooltip title={service.description || 'No description'}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                      {service.description || 'No description'}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {service.status === 'Stopped' && (
                      <Tooltip title="Start Service">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() =>
                            openConfirmDialog(
                              'Start Service',
                              `Are you sure you want to start service "${service.displayName}" (${service.name})?`,
                              () => handleStartService(service)
                            )
                          }
                        >
                          <StartIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {service.status === 'Running' && service.canStop && (
                      <Tooltip title="Stop Service">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() =>
                            openConfirmDialog(
                              'Stop Service',
                              `Are you sure you want to stop service "${service.displayName}" (${service.name})?`,
                              () => handleStopService(service)
                            )
                          }
                        >
                          <StopIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {service.status === 'Running' && (
                      <Tooltip title="Restart Service">
                        <IconButton
                          size="small"
                          color="warning"
                          onClick={() =>
                            openConfirmDialog(
                              'Restart Service',
                              `Are you sure you want to restart service "${service.displayName}" (${service.name})?`,
                              () => handleRestartService(service)
                            )
                          }
                        >
                          <RestartIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={totalCount}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={closeConfirmDialog}>
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.message}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeConfirmDialog}>Cancel</Button>
          <Button
            onClick={() => {
              confirmDialog.action();
              closeConfirmDialog();
            }}
            color="primary"
            variant="contained"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
