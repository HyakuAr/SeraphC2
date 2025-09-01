/**
 * CommandInterface component - Main command execution interface
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  Divider,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  Stop as CancelIcon,
  History as HistoryIcon,
  Terminal as TerminalIcon,
  PowerSettingsNew as PowerShellIcon,
  Clear as ClearIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { CommandService, Command, CommandProgress } from '../../services/commandService';
import { useWebSocket } from '../../hooks/useWebSocket';
import { EnhancedImplant } from '../../services/websocketService';
import CommandOutput from './CommandOutput';
import CommandHistory from './CommandHistory';

interface CommandInterfaceProps {
  implant: EnhancedImplant;
}

const CommandInterface: React.FC<CommandInterfaceProps> = ({ implant }) => {
  const [commandType, setCommandType] = useState<'shell' | 'powershell'>('shell');
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentCommand, setCurrentCommand] = useState<Command | null>(null);
  const [commandProgress, setCommandProgress] = useState<CommandProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [commandHistory, setCommandHistory] = useState<Command[]>([]);
  const [activeCommands, setActiveCommands] = useState<CommandProgress[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const { socket } = useWebSocket();

  useEffect(() => {
    if (socket) {
      // Listen for command progress updates
      socket.on('commandProgress', (progress: CommandProgress) => {
        if (currentCommand && progress.commandId === currentCommand.id) {
          setCommandProgress(progress);
        }

        // Update active commands list
        setActiveCommands(prev => {
          const filtered = prev.filter(cmd => cmd.commandId !== progress.commandId);
          if (progress.status === 'executing' || progress.status === 'pending') {
            return [...filtered, progress];
          }
          return filtered;
        });
      });

      // Listen for command completion
      socket.on(
        'commandCompleted',
        ({ command, result, status }: { command: any; result: any; status: any }) => {
          if (currentCommand && command.id === currentCommand.id) {
            setCurrentCommand({ ...command, result, status });
            setIsExecuting(false);
            setCommandProgress(null);

            // Add to history
            setCommandHistory(prev => [{ ...command, result, status }, ...prev]);
          }
        }
      );

      // Listen for command failures
      socket.on('commandFailed', ({ command, error: cmdError }: { command: any; error: any }) => {
        if (currentCommand && command.id === currentCommand.id) {
          setError(`Command failed: ${cmdError}`);
          setIsExecuting(false);
          setCommandProgress(null);
        }
      });

      // Listen for command timeouts
      socket.on('commandTimeout', ({ command, timeout }: { command: any; timeout: any }) => {
        if (currentCommand && command.id === currentCommand.id) {
          setError(`Command timed out after ${timeout}ms`);
          setIsExecuting(false);
          setCommandProgress(null);
        }
      });

      // Listen for command cancellations
      socket.on('commandCancelled', ({ command }: { command: any }) => {
        if (currentCommand && command.id === currentCommand.id) {
          setIsExecuting(false);
          setCommandProgress(null);
          setError('Command was cancelled');
        }
      });

      return () => {
        socket.off('commandProgress');
        socket.off('commandCompleted');
        socket.off('commandFailed');
        socket.off('commandTimeout');
        socket.off('commandCancelled');
      };
    }
  }, [socket, currentCommand]);

  useEffect(() => {
    // Load command history when component mounts
    loadCommandHistory();
  }, [implant.id]);

  const loadCommandHistory = async () => {
    try {
      const history = await CommandService.getCommandHistory(implant.id, { limit: 20 });
      setCommandHistory(history);
    } catch (error) {
      console.error('Failed to load command history:', error);
    }
  };

  const handleExecuteCommand = async () => {
    if (!commandInput.trim() || !implant.isConnected) {
      return;
    }

    setError(null);
    setIsExecuting(true);
    setCurrentCommand(null);
    setCommandProgress(null);

    try {
      let command: Command;

      if (commandType === 'shell') {
        command = await CommandService.executeShellCommand({
          implantId: implant.id,
          command: commandInput.trim(),
          timeout: 30000, // 30 seconds
        });
      } else {
        command = await CommandService.executePowerShellCommand({
          implantId: implant.id,
          command: commandInput.trim(),
          timeout: 30000, // 30 seconds
        });
      }

      setCurrentCommand(command);

      // Clear input after successful execution
      setCommandInput('');

      // Focus back to input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to execute command');
      setIsExecuting(false);
    }
  };

  const handleCancelCommand = async () => {
    if (!currentCommand) return;

    try {
      await CommandService.cancelCommand(currentCommand.id);
      setIsExecuting(false);
      setCommandProgress(null);
      setError('Command cancelled');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to cancel command');
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isExecuting) {
        handleExecuteCommand();
      }
    }
  };

  const handleClearOutput = () => {
    setCurrentCommand(null);
    setCommandProgress(null);
    setError(null);
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(commandInput);
  };

  const getProgressValue = () => {
    if (commandProgress?.progress !== undefined) {
      return commandProgress.progress;
    }
    return isExecuting ? undefined : 0;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
      {/* Command Input Section */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TerminalIcon />
              Command Interface
            </Typography>
            <Chip
              label={implant.isConnected ? 'Connected' : 'Disconnected'}
              color={implant.isConnected ? 'success' : 'error'}
              size="small"
            />
            {activeCommands.length > 0 && (
              <Chip label={`${activeCommands.length} active`} color="warning" size="small" />
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Type</InputLabel>
              <Select
                value={commandType}
                label="Type"
                onChange={e => setCommandType(e.target.value as 'shell' | 'powershell')}
                disabled={isExecuting}
              >
                <MenuItem value="shell">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TerminalIcon fontSize="small" />
                    Shell
                  </Box>
                </MenuItem>
                <MenuItem value="powershell">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PowerShellIcon fontSize="small" />
                    PowerShell
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            <TextField
              ref={inputRef}
              fullWidth
              size="small"
              label="Command"
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isExecuting || !implant.isConnected}
              placeholder={
                commandType === 'shell'
                  ? 'Enter shell command (e.g., dir, whoami, systeminfo)'
                  : 'Enter PowerShell command (e.g., Get-Process, Get-Service)'
              }
              InputProps={{
                style: { fontFamily: 'monospace' },
              }}
            />

            <Tooltip title="Copy Command">
              <IconButton onClick={handleCopyCommand} disabled={!commandInput.trim()} size="small">
                <CopyIcon />
              </IconButton>
            </Tooltip>

            <Button
              variant="contained"
              onClick={handleExecuteCommand}
              disabled={isExecuting || !commandInput.trim() || !implant.isConnected}
              startIcon={<ExecuteIcon />}
              sx={{ minWidth: 100 }}
            >
              Execute
            </Button>

            {isExecuting && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleCancelCommand}
                startIcon={<CancelIcon />}
                sx={{ minWidth: 100 }}
              >
                Cancel
              </Button>
            )}

            <Tooltip title="Clear Output">
              <IconButton onClick={handleClearOutput} size="small">
                <ClearIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Command History">
              <IconButton
                onClick={() => setShowHistory(!showHistory)}
                size="small"
                color={showHistory ? 'primary' : 'default'}
              >
                <HistoryIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Progress Bar */}
          {isExecuting && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress
                variant={commandProgress?.progress !== undefined ? 'determinate' : 'indeterminate'}
                value={getProgressValue()}
              />
              {commandProgress?.message && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  {commandProgress.message}
                </Typography>
              )}
            </Box>
          )}

          {/* Error Display */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Connection Warning */}
          {!implant.isConnected && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Implant is not connected. Commands cannot be executed.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Command Output and History */}
      <Box sx={{ display: 'flex', gap: 2, flex: 1, minHeight: 0 }}>
        {/* Command Output */}
        <Paper sx={{ flex: showHistory ? 1 : 2, display: 'flex', flexDirection: 'column' }}>
          <CommandOutput
            command={currentCommand}
            isExecuting={isExecuting}
            progress={commandProgress}
          />
        </Paper>

        {/* Command History */}
        {showHistory && (
          <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <CommandHistory
              commands={commandHistory}
              onCommandSelect={command => {
                setCommandInput(command.payload);
                setCommandType(command.type === 'powershell' ? 'powershell' : 'shell');
                inputRef.current?.focus();
              }}
              onRefresh={loadCommandHistory}
            />
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default CommandInterface;
