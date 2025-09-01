/**
 * CommandHistory component - Displays command history with filtering and search
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Paper,
  Divider,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { Command } from '../../services/commandService';

interface CommandHistoryProps {
  commands: Command[];
  onCommandSelect: (command: Command) => void;
  onRefresh: () => void;
}

const CommandHistory: React.FC<CommandHistoryProps> = ({
  commands,
  onCommandSelect,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredCommands = useMemo(() => {
    return commands.filter(command => {
      const matchesSearch =
        searchTerm === '' || command.payload.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || command.status === statusFilter;
      const matchesType = typeFilter === 'all' || command.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [commands, searchTerm, statusFilter, typeFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
      case 'timeout':
        return 'error';
      case 'executing':
        return 'primary';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const truncateCommand = (command: string, maxLength: number = 50) => {
    if (command.length <= maxLength) return command;
    return command.substring(0, maxLength) + '...';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const uniqueStatuses = Array.from(new Set(commands.map(cmd => cmd.status)));
  const uniqueTypes = Array.from(new Set(commands.map(cmd => cmd.type)));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Command History</Typography>
          <Tooltip title="Refresh History">
            <IconButton onClick={onRefresh} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Search and Filters */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            size="small"
            placeholder="Search commands..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={e => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All</MenuItem>
                {uniqueStatuses.map(status => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 80 }}>
              <InputLabel>Type</InputLabel>
              <Select value={typeFilter} label="Type" onChange={e => setTypeFilter(e.target.value)}>
                <MenuItem value="all">All</MenuItem>
                {uniqueTypes.map(type => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          {filteredCommands.length} of {commands.length} commands
        </Typography>
      </Box>

      {/* Command List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {filteredCommands.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {commands.length === 0
                ? 'No commands in history'
                : 'No commands match the current filters'}
            </Typography>
          </Box>
        ) : (
          <List dense>
            {filteredCommands.map((command, index) => (
              <React.Fragment key={command.id}>
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                  onClick={() => onCommandSelect(command)}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 'medium',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {truncateCommand(command.payload)}
                        </Typography>
                        <Chip
                          label={command.status}
                          color={getStatusColor(command.status) as any}
                          size="small"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={command.type}
                            variant="outlined"
                            size="small"
                            sx={{ fontSize: '0.65rem', height: 18 }}
                          />
                          {command.result?.exitCode !== undefined && (
                            <Typography
                              variant="caption"
                              sx={{
                                color:
                                  command.result.exitCode === 0 ? 'success.main' : 'error.main',
                                fontWeight: 'bold',
                              }}
                            >
                              Exit: {command.result.exitCode}
                            </Typography>
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(command.timestamp)}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Copy Command">
                        <IconButton
                          size="small"
                          onClick={e => {
                            e.stopPropagation();
                            copyToClipboard(command.payload);
                          }}
                        >
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Execute Again">
                        <IconButton
                          size="small"
                          onClick={e => {
                            e.stopPropagation();
                            onCommandSelect(command);
                          }}
                        >
                          <ExecuteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
                {index < filteredCommands.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
};

export default CommandHistory;
