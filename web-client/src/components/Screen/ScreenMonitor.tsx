/**
 * ScreenMonitor - Main screen monitoring component for SeraphC2
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
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
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  CameraAlt,
  Settings,
  Download,
  Fullscreen,
  FullscreenExit,
  Refresh,
  Monitor,
} from '@mui/icons-material';
import { useWebSocket } from '../../hooks/useWebSocket';
import screenService, {
  MonitorInfo,
  ScreenStreamConfig,
  ScreenStreamStatus,
  ScreenshotResult,
  ScreenStreamFrame,
} from '../../services/screenService';

interface ScreenMonitorProps {
  implantId: string;
  onError?: (error: string) => void;
  onImageRef?: (ref: HTMLImageElement | null) => void;
  onMouseClick?: (event: React.MouseEvent<HTMLImageElement>) => void;
  onMouseMove?: (event: React.MouseEvent<HTMLImageElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLImageElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLImageElement>) => void;
}

export const ScreenMonitor: React.FC<ScreenMonitorProps> = ({
  implantId,
  onError,
  onImageRef,
  onMouseClick,
  onMouseMove,
  onDoubleClick,
  onContextMenu,
}) => {
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<number>(0);
  const [streamConfig, setStreamConfig] = useState<ScreenStreamConfig>({
    quality: 75,
    frameRate: 5,
    captureMouseCursor: true,
  });
  const [streamStatus, setStreamStatus] = useState<ScreenStreamStatus | null>(null);
  const [currentFrame, setCurrentFrame] = useState<ScreenStreamFrame | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // WebSocket connection for real-time frames
  const { socket, isConnected } = useWebSocket();

  // Handle WebSocket messages
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (data: any) => {
      if (data.type === 'screen_frame' && data.implantId === implantId) {
        const frame: ScreenStreamFrame = {
          ...data.frame,
          timestamp: new Date(data.frame.timestamp),
        };
        setCurrentFrame(frame);

        // Update stream status
        if (streamStatus) {
          setStreamStatus(prev =>
            prev
              ? {
                  ...prev,
                  frameCount: frame.frameId,
                  lastFrameTime: frame.timestamp,
                }
              : null
          );
        }
      }
    };

    socket.on('screen_frame', handleMessage);

    return () => {
      socket.off('screen_frame', handleMessage);
    };
  }, [socket, implantId, streamStatus]);

  // Load monitors on component mount
  useEffect(() => {
    loadMonitors();
  }, [implantId]);

  // Update image URL when frame changes
  useEffect(() => {
    if (currentFrame) {
      try {
        // Revoke previous URL to prevent memory leaks
        if (imageUrl) {
          screenService.revokeBlobUrl(imageUrl);
        }

        const newUrl = screenService.createImageBlobUrl(currentFrame.imageData);
        setImageUrl(newUrl);
      } catch (error) {
        console.error('Failed to create image URL:', error);
        setError('Failed to display screen frame');
      }
    }
  }, [currentFrame]);

  // Cleanup image URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        screenService.revokeBlobUrl(imageUrl);
      }
    };
  }, [imageUrl]);

  const loadMonitors = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await screenService.getMonitors(implantId);
      setMonitors(response.monitors);

      // Select primary monitor by default
      const primaryMonitor = response.monitors.find(m => m.isPrimary);
      if (primaryMonitor) {
        setSelectedMonitor(primaryMonitor.id);
        setStreamConfig(prev => ({ ...prev, monitorId: primaryMonitor.id }));
      }
    } catch (error) {
      const errorMessage = 'Failed to load monitors';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const takeScreenshot = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await screenService.takeScreenshot({
        implantId,
        monitorId: selectedMonitor,
        quality: streamConfig.quality,
        captureMouseCursor: streamConfig.captureMouseCursor,
      });

      setScreenshot(result);

      // Create and display image URL
      if (imageUrl) {
        screenService.revokeBlobUrl(imageUrl);
      }
      const newUrl = screenService.createImageBlobUrl(result.imageData);
      setImageUrl(newUrl);
    } catch (error) {
      const errorMessage = 'Failed to take screenshot';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const startStreaming = async () => {
    try {
      setLoading(true);
      setError(null);

      const config = {
        ...streamConfig,
        monitorId: selectedMonitor,
      };

      const result = await screenService.startScreenStream(implantId, config);

      if (result.success) {
        setIsStreaming(true);
        setStreamStatus({
          isActive: true,
          monitorId: selectedMonitor,
          config,
          frameCount: 0,
          totalDataSent: 0,
          averageFrameSize: 0,
          actualFrameRate: 0,
          startTime: new Date(),
        });

        // Subscribe to WebSocket frames
        socket?.emit('subscribe_screen_stream', {
          implantId,
        });
      } else {
        setError(result.message);
        onError?.(result.message);
      }
    } catch (error) {
      const errorMessage = 'Failed to start screen stream';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const stopStreaming = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await screenService.stopScreenStream(implantId);

      if (result.success) {
        setIsStreaming(false);
        setStreamStatus(null);
        setCurrentFrame(null);

        // Unsubscribe from WebSocket frames
        socket?.emit('unsubscribe_screen_stream', {
          implantId,
        });
      } else {
        setError(result.message);
        onError?.(result.message);
      }
    } catch (error) {
      const errorMessage = 'Failed to stop screen stream';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const updateStreamConfig = async (newConfig: Partial<ScreenStreamConfig>) => {
    try {
      if (isStreaming) {
        await screenService.updateStreamConfig(implantId, newConfig);
      }
      setStreamConfig(prev => ({ ...prev, ...newConfig }));
    } catch (error) {
      const errorMessage = 'Failed to update stream configuration';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  };

  const downloadScreenshot = () => {
    if (screenshot) {
      screenService.downloadScreenshot(screenshot);
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleMonitorChange = (monitorId: number) => {
    setSelectedMonitor(monitorId);
    if (isStreaming) {
      updateStreamConfig({ monitorId });
    }
  };

  const handleQualityChange = (quality: number) => {
    updateStreamConfig({ quality });
  };

  const handleFrameRateChange = (frameRate: number) => {
    updateStreamConfig({ frameRate });
  };

  const selectedMonitorInfo = monitors.find(m => m.id === selectedMonitor);

  return (
    <Box ref={containerRef}>
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" component="h2">
              Screen Monitor
            </Typography>
            <Box>
              <Tooltip title="Refresh Monitors">
                <IconButton onClick={loadMonitors} disabled={loading}>
                  <Refresh />
                </IconButton>
              </Tooltip>
              <Tooltip title="Settings">
                <IconButton onClick={() => setShowSettings(true)}>
                  <Settings />
                </IconButton>
              </Tooltip>
              <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                <IconButton onClick={toggleFullscreen}>
                  {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!isConnected && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              WebSocket disconnected. Real-time streaming may not work.
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              {/* Screen Display */}
              <Card variant="outlined" sx={{ minHeight: 400, position: 'relative' }}>
                <CardContent>
                  {loading && (
                    <Box display="flex" justifyContent="center" alignItems="center" height={300}>
                      <CircularProgress />
                    </Box>
                  )}

                  {imageUrl && !loading && (
                    <Box textAlign="center">
                      <img
                        ref={ref => {
                          (imageRef as React.MutableRefObject<HTMLImageElement | null>).current =
                            ref;
                          onImageRef?.(ref);
                        }}
                        src={imageUrl}
                        alt="Screen capture"
                        style={{
                          maxWidth: '100%',
                          maxHeight: isFullscreen ? '80vh' : '400px',
                          objectFit: 'contain',
                          cursor: onMouseClick ? 'crosshair' : 'default',
                        }}
                        onClick={onMouseClick}
                        onMouseMove={onMouseMove}
                        onDoubleClick={onDoubleClick}
                        onContextMenu={onContextMenu}
                      />

                      {/* Frame info overlay */}
                      {currentFrame && (
                        <Box
                          position="absolute"
                          top={8}
                          right={8}
                          bgcolor="rgba(0,0,0,0.7)"
                          color="white"
                          p={1}
                          borderRadius={1}
                        >
                          <Typography variant="caption">
                            Frame #{currentFrame.frameId} | {currentFrame.width}x
                            {currentFrame.height} |{' '}
                            {screenService.formatFileSize(currentFrame.size)}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}

                  {!imageUrl && !loading && (
                    <Box display="flex" justifyContent="center" alignItems="center" height={300}>
                      <Typography variant="body2" color="textSecondary">
                        No screen capture available. Take a screenshot or start streaming.
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* Controls */}
              <Box mt={2} display="flex" gap={1} flexWrap="wrap">
                <Button
                  variant="contained"
                  startIcon={<CameraAlt />}
                  onClick={takeScreenshot}
                  disabled={loading || monitors.length === 0}
                >
                  Screenshot
                </Button>

                {!isStreaming ? (
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<PlayArrow />}
                    onClick={startStreaming}
                    disabled={loading || monitors.length === 0}
                  >
                    Start Stream
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<Stop />}
                    onClick={stopStreaming}
                    disabled={loading}
                  >
                    Stop Stream
                  </Button>
                )}

                {screenshot && (
                  <Button variant="outlined" startIcon={<Download />} onClick={downloadScreenshot}>
                    Download
                  </Button>
                )}
              </Box>
            </Grid>

            <Grid item xs={12} md={4}>
              {/* Monitor Selection */}
              <Card variant="outlined" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Monitor Selection
                  </Typography>

                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Monitor</InputLabel>
                    <Select
                      value={selectedMonitor}
                      onChange={e => handleMonitorChange(e.target.value as number)}
                      disabled={loading}
                    >
                      {monitors.map(monitor => (
                        <MenuItem key={monitor.id} value={monitor.id}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Monitor fontSize="small" />
                            {monitor.name}
                            {monitor.isPrimary && <Chip label="Primary" size="small" />}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedMonitorInfo && (
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        Resolution: {selectedMonitorInfo.width}x{selectedMonitorInfo.height}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Position: ({selectedMonitorInfo.x}, {selectedMonitorInfo.y})
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Color Depth: {selectedMonitorInfo.bitsPerPixel} bits
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* Stream Status */}
              {streamStatus && (
                <Card variant="outlined" sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      Stream Status
                    </Typography>

                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <Chip
                        label={streamStatus.isActive ? 'Active' : 'Inactive'}
                        color={streamStatus.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>

                    <Typography variant="body2" color="textSecondary">
                      Frames: {streamStatus.frameCount}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Data Sent: {screenService.formatFileSize(streamStatus.totalDataSent)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Frame Rate: {screenService.formatFrameRate(streamStatus.actualFrameRate)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Avg Frame Size: {screenService.formatFileSize(streamStatus.averageFrameSize)}
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {/* Quick Settings */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>
                    Quick Settings
                  </Typography>

                  <Box mb={2}>
                    <Typography variant="body2" gutterBottom>
                      Quality: {streamConfig.quality}%
                    </Typography>
                    <Slider
                      value={streamConfig.quality}
                      onChange={(_, value) => handleQualityChange(value as number)}
                      min={1}
                      max={100}
                      step={5}
                      marks={[
                        { value: 25, label: 'Low' },
                        { value: 50, label: 'Med' },
                        { value: 75, label: 'High' },
                        { value: 100, label: 'Max' },
                      ]}
                      disabled={loading}
                    />
                  </Box>

                  <Box mb={2}>
                    <Typography variant="body2" gutterBottom>
                      Frame Rate: {streamConfig.frameRate} FPS
                    </Typography>
                    <Slider
                      value={streamConfig.frameRate}
                      onChange={(_, value) => handleFrameRateChange(value as number)}
                      min={1}
                      max={30}
                      step={1}
                      marks={[
                        { value: 1, label: '1' },
                        { value: 5, label: '5' },
                        { value: 15, label: '15' },
                        { value: 30, label: '30' },
                      ]}
                      disabled={loading}
                    />
                  </Box>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={streamConfig.captureMouseCursor}
                        onChange={e => updateStreamConfig({ captureMouseCursor: e.target.checked })}
                        disabled={loading}
                      />
                    }
                    label="Capture Mouse Cursor"
                  />
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Screen Monitor Settings</DialogTitle>
        <DialogContent>
          <Box py={2}>
            <Typography variant="subtitle2" gutterBottom>
              Advanced Configuration
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Custom Width</InputLabel>
              <Select
                value={streamConfig.width || ''}
                onChange={e =>
                  updateStreamConfig({ width: (e.target.value as number) || undefined })
                }
              >
                <MenuItem value="">Auto</MenuItem>
                <MenuItem value={640}>640px</MenuItem>
                <MenuItem value={800}>800px</MenuItem>
                <MenuItem value={1024}>1024px</MenuItem>
                <MenuItem value={1280}>1280px</MenuItem>
                <MenuItem value={1920}>1920px</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Custom Height</InputLabel>
              <Select
                value={streamConfig.height || ''}
                onChange={e =>
                  updateStreamConfig({ height: (e.target.value as number) || undefined })
                }
              >
                <MenuItem value="">Auto</MenuItem>
                <MenuItem value={480}>480px</MenuItem>
                <MenuItem value={600}>600px</MenuItem>
                <MenuItem value={768}>768px</MenuItem>
                <MenuItem value={720}>720px</MenuItem>
                <MenuItem value={1080}>1080px</MenuItem>
              </Select>
            </FormControl>

            <Typography variant="body2" color="textSecondary">
              Custom dimensions will resize the captured screen. Leave as "Auto" to use monitor's
              native resolution.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ScreenMonitor;
