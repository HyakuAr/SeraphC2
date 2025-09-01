/**
 * ProcessList - Component for displaying and managing processes
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
  Stop as StopIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import {
  processService,
  ProcessInfo,
  ProcessFilter,
  ProcessOperationResult,
} from '../../services/processService';

interface ProcessListProps {
  implantId: string;
}

export const ProcessList: React.FC<ProcessListProps> = ({ implantId }) => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Filter state
  const [filter, setFilter] = useState<ProcessFilter>({});
  const [filterName, setFilterName] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Running' | 'Suspended' | 'NotResponding' | ''>(
    ''
  );
  const [filterMinCpu, setFilterMinCpu] = useState('');
  const [filterMinMemory, setFilterMinMemory] = useState('');

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

  const loadProcesses = async () => {
    try {
      setLoading(true);
      setError(null);

      const currentFilter: ProcessFilter = {};
      if (filterName) currentFilter.name = filterName;
      if (filterOwner) currentFilter.owner = filterOwner;
      if (filterStatus) currentFilter.status = filterStatus;
      if (filterMinCpu) currentFilter.minCpuUsage = parseFloat(filterMinCpu);
      if (filterMinMemory) currentFilter.minMemoryUsage = parseInt(filterMinMemory);

      const result = await processService.getProcessList(
        implantId,
        Object.keys(currentFilter).length > 0 ? currentFilter : undefined
      );

      setProcesses(result.processes);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load processes');
    } finally {
      setLoading(false);
    }
  };

  const handleKillProcess = async (process: ProcessInfo) => {
    try {
      const result = await processService.killProcess(implantId, process.pid);
      if (result.success) {
        await loadProcesses();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kill process');
    }
  };

  const handleSuspendProcess = async (process: ProcessInfo) => {
    try {
      const result = await processService.suspendProcess(implantId, process.pid);
      if (result.success) {
        await loadProcesses();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend process');
    }
  };

  const handleResumeProcess = async (process: ProcessInfo) => {
    try {
      const result = await processService.resumeProcess(implantId, process.pid);
      if (result.success) {
        await loadProcesses();
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume process');
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
    loadProcesses();
  };

  const clearFilters = () => {
    setFilterName('');
    setFilterOwner('');
    setFilterStatus('');
    setFilterMinCpu('');
    setFilterMinMemory('');
    setPage(0);
    // Load processes without filters
    setTimeout(loadProcesses, 100);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  useEffect(() => {
    loadProcesses();
  }, [implantId]);

  const displayedProcesses = processes.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Processes ({totalCount})</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadProcesses}
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
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="Process Name"
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="Owner"
              value={filterOwner}
              onChange={e => setFilterOwner(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filterStatus}
                label="Status"
                onChange={e => setFilterStatus(e.target.value as any)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="Running">Running</MenuItem>
                <MenuItem value="Suspended">Suspended</MenuItem>
                <MenuItem value="NotResponding">Not Responding</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="Min CPU %"
              type="number"
              value={filterMinCpu}
              onChange={e => setFilterMinCpu(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="Min Memory (MB)"
              type="number"
              value={filterMinMemory}
              onChange={e => setFilterMinMemory(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
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
              <TableCell>PID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>CPU %</TableCell>
              <TableCell>Memory</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Start Time</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedProcesses.map(process => (
              <TableRow key={process.pid} hover>
                <TableCell>{process.pid}</TableCell>
                <TableCell>
                  <Tooltip title={process.executablePath || process.name}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {process.name}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip
                    label={process.status}
                    color={processService.getProcessStatusColor(process.status) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>{processService.formatCpuUsage(process.cpuUsage)}</TableCell>
                <TableCell>{processService.formatBytes(process.memoryUsage)}</TableCell>
                <TableCell>{process.owner || 'N/A'}</TableCell>
                <TableCell>{process.startTime.toLocaleString()}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {process.status === 'Running' && (
                      <>
                        <Tooltip title="Suspend Process">
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() =>
                              openConfirmDialog(
                                'Suspend Process',
                                `Are you sure you want to suspend process "${process.name}" (PID: ${process.pid})?`,
                                () => handleSuspendProcess(process)
                              )
                            }
                          >
                            <PauseIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Kill Process">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() =>
                              openConfirmDialog(
                                'Kill Process',
                                `Are you sure you want to kill process "${process.name}" (PID: ${process.pid})? This action cannot be undone.`,
                                () => handleKillProcess(process)
                              )
                            }
                          >
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {process.status === 'Suspended' && (
                      <Tooltip title="Resume Process">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() =>
                            openConfirmDialog(
                              'Resume Process',
                              `Are you sure you want to resume process "${process.name}" (PID: ${process.pid})?`,
                              () => handleResumeProcess(process)
                            )
                          }
                        >
                          <PlayIcon />
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
