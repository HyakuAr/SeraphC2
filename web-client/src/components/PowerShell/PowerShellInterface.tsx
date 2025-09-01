/**
 * Enhanced PowerShell Interface component with script management and favorites
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
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Grid,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  Stop as CancelIcon,
  History as HistoryIcon,
  PowerSettingsNew as PowerShellIcon,
  Clear as ClearIcon,
  ContentCopy as CopyIcon,
  Save as SaveIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteBorderIcon,
  Code as ScriptIcon,
  Extension as ModuleIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { CommandService, Command, CommandProgress } from '../../services/commandService';
import {
  PowerShellService,
  PowerShellScript,
  PowerShellFavorite,
} from '../../services/powerShellService';
import { useWebSocket } from '../../hooks/useWebSocket';
import { EnhancedImplant } from '../../services/websocketService';
import CommandOutput from '../Commands/CommandOutput';
import PowerShellScriptEditor from './PowerShellScriptEditor';
import PowerShellFavorites from './PowerShellFavorites';
import PowerShellModules from './PowerShellModules';

interface PowerShellInterfaceProps {
  implant: EnhancedImplant;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`powershell-tabpanel-${index}`}
      aria-labelledby={`powershell-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PowerShellInterface: React.FC<PowerShellInterfaceProps> = ({ implant }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentCommand, setCurrentCommand] = useState<Command | null>(null);
  const [commandProgress, setCommandProgress] = useState<CommandProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scripts, setScripts] = useState<PowerShellScript[]>([]);
  const [favorites, setFavorites] = useState<PowerShellFavorite[]>([]);
  const [showScriptDialog, setShowScriptDialog] = useState(false);
  const [showFavoriteDialog, setShowFavoriteDialog] = useState(false);
  const [selectedScript, setSelectedScript] = useState<PowerShellScript | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const { socket } = useWebSocket();

  useEffect(() => {
    if (socket) {
      // Listen for command progress updates
      socket.on('commandProgress', (progress: CommandProgress) => {
        if (currentCommand && progress.commandId === currentCommand.id) {
          setCommandProgress(progress);
        }
      });

      // Listen for command completion
      socket.on(
        'commandCompleted',
        ({ command, result, status }: { command: any; result: any; status: any }) => {
          if (currentCommand && command.id === currentCommand.id) {
            setCurrentCommand({ ...command, result, status });
            setIsExecuting(false);
            setCommandProgress(null);
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

      return () => {
        socket.off('commandProgress');
        socket.off('commandCompleted');
        socket.off('commandFailed');
      };
    }
  }, [socket, currentCommand]);

  useEffect(() => {
    loadScripts();
    loadFavorites();
  }, []);

  const loadScripts = async () => {
    try {
      const scriptList = await PowerShellService.getScripts();
      setScripts(scriptList);
    } catch (error) {
      console.error('Failed to load PowerShell scripts:', error);
    }
  };

  const loadFavorites = async () => {
    try {
      const favoriteList = await PowerShellService.getFavorites();
      setFavorites(favoriteList);
    } catch (error) {
      console.error('Failed to load PowerShell favorites:', error);
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
      const command = await PowerShellService.executePowerShellCommand({
        implantId: implant.id,
        command: commandInput.trim(),
        timeout: 30000,
      });

      setCurrentCommand(command);
      setCommandInput('');

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to execute PowerShell command');
      setIsExecuting(false);
    }
  };

  const handleExecuteScript = async (
    script: PowerShellScript,
    parameters?: { [key: string]: any }
  ) => {
    if (!implant.isConnected) {
      setError('Implant is not connected');
      return;
    }

    setError(null);
    setIsExecuting(true);
    setCurrentCommand(null);
    setCommandProgress(null);

    try {
      const command = await PowerShellService.executePowerShellScript({
        implantId: implant.id,
        scriptContent: script.content,
        parameters,
        timeout: 60000,
      });

      setCurrentCommand(command);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to execute PowerShell script');
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

  const handleSaveAsFavorite = async () => {
    if (!commandInput.trim()) return;

    try {
      await PowerShellService.createFavorite({
        name: `Command ${new Date().toLocaleString()}`,
        command: commandInput.trim(),
        category: 'Custom',
      });

      await loadFavorites();
      setShowFavoriteDialog(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save favorite');
    }
  };

  const handleUseFavorite = async (favorite: PowerShellFavorite) => {
    setCommandInput(favorite.command);

    try {
      await PowerShellService.useFavorite(favorite.id);
      await loadFavorites(); // Refresh to update usage count
    } catch (error) {
      console.error('Failed to update favorite usage:', error);
    }

    inputRef.current?.focus();
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!isExecuting) {
        handleExecuteCommand();
      }
    }
  };

  const getProgressValue = () => {
    if (commandProgress?.progress !== undefined) {
      return commandProgress.progress;
    }
    return isExecuting ? undefined : 0;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PowerShellIcon />
              Enhanced PowerShell Interface
            </Typography>
            <Chip
              label={implant.isConnected ? 'Connected' : 'Disconnected'}
              color={implant.isConnected ? 'success' : 'error'}
              size="small"
            />
          </Box>

          {/* Command Input */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              ref={inputRef}
              fullWidth
              size="small"
              label="PowerShell Command"
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isExecuting || !implant.isConnected}
              placeholder="Enter PowerShell command (e.g., Get-Process, Get-Service)"
              InputProps={{
                style: { fontFamily: 'monospace' },
              }}
              multiline
              maxRows={4}
            />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Tooltip title="Save as Favorite">
                <IconButton
                  onClick={() => setShowFavoriteDialog(true)}
                  disabled={!commandInput.trim()}
                  size="small"
                >
                  <FavoriteBorderIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Copy Command">
                <IconButton
                  onClick={() => navigator.clipboard.writeText(commandInput)}
                  disabled={!commandInput.trim()}
                  size="small"
                >
                  <CopyIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="Clear">
                <IconButton
                  onClick={() => {
                    setCommandInput('');
                    setCurrentCommand(null);
                    setError(null);
                  }}
                  size="small"
                >
                  <ClearIcon />
                </IconButton>
              </Tooltip>
            </Box>
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
            <Alert severity="warning">Implant is not connected. Commands cannot be executed.</Alert>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Output" icon={<PowerShellIcon />} />
            <Tab label="Scripts" icon={<ScriptIcon />} />
            <Tab label="Favorites" icon={<FavoriteIcon />} />
            <Tab label="Modules" icon={<ModuleIcon />} />
          </Tabs>
        </Box>

        <TabPanel value={activeTab} index={0}>
          <CommandOutput
            command={currentCommand}
            isExecuting={isExecuting}
            progress={commandProgress}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <PowerShellScriptEditor
            scripts={scripts}
            onScriptExecute={handleExecuteScript}
            onScriptsChange={loadScripts}
            implant={implant}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <PowerShellFavorites
            favorites={favorites}
            onFavoriteUse={handleUseFavorite}
            onFavoritesChange={loadFavorites}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <PowerShellModules implant={implant} />
        </TabPanel>
      </Paper>

      {/* Save Favorite Dialog */}
      <Dialog open={showFavoriteDialog} onClose={() => setShowFavoriteDialog(false)}>
        <DialogTitle>Save as Favorite</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Save this command as a favorite for quick access later.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            value={commandInput}
            disabled
            label="Command"
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowFavoriteDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveAsFavorite} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PowerShellInterface;
