/**
 * CommandOutput component - Displays command execution output with formatting
 */

import React, { useEffect, useRef } from 'react';
import { Box, Typography, Paper, Chip, IconButton, Tooltip, Divider } from '@mui/material';
import {
  ContentCopy as CopyIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Schedule as PendingIcon,
  PlayArrow as ExecutingIcon,
} from '@mui/icons-material';
import { Command, CommandProgress } from '../../services/commandService';

interface CommandOutputProps {
  command: Command | null;
  isExecuting: boolean;
  progress: CommandProgress | null;
}

const CommandOutput: React.FC<CommandOutputProps> = ({ command, isExecuting, progress }) => {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new output arrives
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [command?.result]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <SuccessIcon color="success" fontSize="small" />;
      case 'failed':
      case 'timeout':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'executing':
        return <ExecutingIcon color="primary" fontSize="small" />;
      case 'pending':
        return <PendingIcon color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

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

  const formatOutput = (text: string) => {
    // Basic formatting for command output
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line, index) => (
        <div key={index} style={{ minHeight: '1.2em' }}>
          {line || '\u00A0'} {/* Non-breaking space for empty lines */}
        </div>
      ));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatExecutionTime = (time: number) => {
    if (time < 1000) {
      return `${time}ms`;
    }
    return `${(time / 1000).toFixed(2)}s`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6">Command Output</Typography>

        {(command || isExecuting) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            {command && (
              <>
                <Chip
                  icon={getStatusIcon(command.status) || undefined}
                  label={command.status.toUpperCase()}
                  color={getStatusColor(command.status) as any}
                  size="small"
                />
                <Chip label={command.type.toUpperCase()} variant="outlined" size="small" />
                {command.executionTime && (
                  <Chip
                    label={formatExecutionTime(command.executionTime)}
                    variant="outlined"
                    size="small"
                  />
                )}
              </>
            )}

            {isExecuting && progress && (
              <Chip
                icon={getStatusIcon(progress.status) || undefined}
                label={progress.status.toUpperCase()}
                color={getStatusColor(progress.status) as any}
                size="small"
              />
            )}
          </Box>
        )}
      </Box>

      {/* Output Content */}
      <Box
        ref={outputRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          fontFamily: 'monospace',
          fontSize: '0.875rem',
          lineHeight: 1.4,
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          minHeight: 200,
        }}
      >
        {!command && !isExecuting && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontStyle: 'italic', textAlign: 'center', mt: 4 }}
          >
            No command output to display. Execute a command to see results here.
          </Typography>
        )}

        {isExecuting && !command && (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="body2" color="primary">
              Executing command...
            </Typography>
            {progress?.message && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                {progress.message}
              </Typography>
            )}
          </Box>
        )}

        {command && (
          <Box>
            {/* Command Header */}
            <Box sx={{ mb: 2, pb: 1, borderBottom: '1px solid #333' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: '#569cd6', fontWeight: 'bold' }}>
                  {command.type === 'powershell' ? 'PS>' : '$'} {command.payload}
                </Typography>
                <Tooltip title="Copy Command">
                  <IconButton
                    size="small"
                    onClick={() => copyToClipboard(command.payload)}
                    sx={{ color: '#d4d4d4' }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography variant="caption" sx={{ color: '#808080' }}>
                Executed at {new Date(command.timestamp).toLocaleString()}
              </Typography>
            </Box>

            {/* Standard Output */}
            {command.result?.stdout && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#4ec9b0', fontWeight: 'bold' }}>
                    STDOUT
                  </Typography>
                  <Tooltip title="Copy Output">
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(command.result!.stdout)}
                      sx={{ color: '#d4d4d4' }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ color: '#d4d4d4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {formatOutput(command.result.stdout)}
                </Box>
              </Box>
            )}

            {/* Standard Error */}
            {command.result?.stderr && (
              <Box sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#f44336', fontWeight: 'bold' }}>
                    STDERR
                  </Typography>
                  <Tooltip title="Copy Error">
                    <IconButton
                      size="small"
                      onClick={() => copyToClipboard(command.result!.stderr)}
                      sx={{ color: '#d4d4d4' }}
                    >
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ color: '#f44336', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {formatOutput(command.result.stderr)}
                </Box>
              </Box>
            )}

            {/* Exit Code */}
            {command.result && (
              <Box sx={{ mt: 2, pt: 1, borderTop: '1px solid #333' }}>
                <Typography variant="caption" sx={{ color: '#808080' }}>
                  Exit Code:{' '}
                  <span
                    style={{
                      color: command.result.exitCode === 0 ? '#4ec9b0' : '#f44336',
                      fontWeight: 'bold',
                    }}
                  >
                    {command.result.exitCode}
                  </span>
                  {command.result.executionTime && (
                    <>
                      {' | '}
                      Execution Time: {formatExecutionTime(command.result.executionTime)}
                    </>
                  )}
                </Typography>
              </Box>
            )}

            {/* No Output Message */}
            {command.result && !command.result.stdout && !command.result.stderr && (
              <Typography variant="body2" sx={{ color: '#808080', fontStyle: 'italic' }}>
                Command completed with no output.
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default CommandOutput;
