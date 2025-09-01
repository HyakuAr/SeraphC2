/**
 * Tests for ScreenMonitor component
 * Implements requirements 9.1, 9.2, 9.3 from the SeraphC2 specification
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ScreenMonitor } from '../ScreenMonitor';
import screenService from '../../../services/screenService';
import { useWebSocket } from '../../../hooks/useWebSocket';

// Mock dependencies
jest.mock('../../../services/screenService');
jest.mock('../../../hooks/useWebSocket');

const mockScreenService = screenService as jest.Mocked<typeof screenService>;
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

// Mock URL methods
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// Mock document methods
Object.defineProperty(document, 'fullscreenElement', {
  value: null,
  writable: true,
});

const mockRequestFullscreen = jest.fn();
const mockExitFullscreen = jest.fn();
Object.defineProperty(document, 'exitFullscreen', {
  value: mockExitFullscreen,
});

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('ScreenMonitor', () => {
  const mockSendMessage = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');

    mockUseWebSocket.mockReturnValue({
      isConnected: true,
      sendMessage: mockSendMessage,
      disconnect: jest.fn(),
    });

    // Mock container ref
    const mockContainer = {
      requestFullscreen: mockRequestFullscreen,
    };
    jest.spyOn(React, 'useRef').mockReturnValue({ current: mockContainer });
  });

  it('should render screen monitor interface', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    expect(screen.getByText('Screen Monitor')).toBeInTheDocument();
    expect(screen.getByText('Screenshot')).toBeInTheDocument();
    expect(screen.getByText('Start Stream')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockScreenService.getMonitors).toHaveBeenCalledWith('implant-1');
    });
  });

  it('should handle monitor loading error', async () => {
    mockScreenService.getMonitors.mockRejectedValue(new Error('Failed to load monitors'));

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith('Failed to load monitors');
    });

    expect(screen.getByText('Failed to load monitors')).toBeInTheDocument();
  });

  it('should take screenshot successfully', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    const mockScreenshot = {
      monitorId: 0,
      width: 1920,
      height: 1080,
      imageData: 'base64encodedimage',
      size: 123456,
      timestamp: new Date(),
      capturedMouseCursor: true,
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);
    mockScreenService.takeScreenshot.mockResolvedValue(mockScreenshot);
    mockScreenService.createImageBlobUrl.mockReturnValue('blob:mock-url');

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Screenshot')).toBeInTheDocument();
    });

    const screenshotButton = screen.getByText('Screenshot');
    fireEvent.click(screenshotButton);

    await waitFor(() => {
      expect(mockScreenService.takeScreenshot).toHaveBeenCalledWith({
        implantId: 'implant-1',
        monitorId: 0,
        quality: 75,
        captureMouseCursor: true,
      });
    });

    expect(mockScreenService.createImageBlobUrl).toHaveBeenCalledWith('base64encodedimage');
  });

  it('should start screen stream successfully', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    const mockStreamResult = {
      success: true,
      message: 'Stream started successfully',
      streamId: 'stream-123',
      config: {
        monitorId: 0,
        quality: 75,
        frameRate: 5,
        captureMouseCursor: true,
      },
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);
    mockScreenService.startScreenStream.mockResolvedValue(mockStreamResult);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Start Stream')).toBeInTheDocument();
    });

    const startStreamButton = screen.getByText('Start Stream');
    fireEvent.click(startStreamButton);

    await waitFor(() => {
      expect(mockScreenService.startScreenStream).toHaveBeenCalledWith('implant-1', {
        monitorId: 0,
        quality: 75,
        frameRate: 5,
        captureMouseCursor: true,
      });
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'subscribe_screen_stream',
      implantId: 'implant-1',
    });

    await waitFor(() => {
      expect(screen.getByText('Stop Stream')).toBeInTheDocument();
    });
  });

  it('should stop screen stream successfully', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    const mockStreamStartResult = {
      success: true,
      message: 'Stream started successfully',
      streamId: 'stream-123',
      config: {
        monitorId: 0,
        quality: 75,
        frameRate: 5,
        captureMouseCursor: true,
      },
    };

    const mockStreamStopResult = {
      success: true,
      message: 'Stream stopped successfully',
      streamId: 'stream-123',
      frameCount: 100,
      totalDataSent: 5000000,
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);
    mockScreenService.startScreenStream.mockResolvedValue(mockStreamStartResult);
    mockScreenService.stopScreenStream.mockResolvedValue(mockStreamStopResult);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Start Stream')).toBeInTheDocument();
    });

    // Start stream first
    const startStreamButton = screen.getByText('Start Stream');
    fireEvent.click(startStreamButton);

    await waitFor(() => {
      expect(screen.getByText('Stop Stream')).toBeInTheDocument();
    });

    // Stop stream
    const stopStreamButton = screen.getByText('Stop Stream');
    fireEvent.click(stopStreamButton);

    await waitFor(() => {
      expect(mockScreenService.stopScreenStream).toHaveBeenCalledWith('implant-1');
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: 'unsubscribe_screen_stream',
      implantId: 'implant-1',
    });

    await waitFor(() => {
      expect(screen.getByText('Start Stream')).toBeInTheDocument();
    });
  });

  it('should handle quality slider change', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Quality: 75%')).toBeInTheDocument();
    });

    // Find and interact with quality slider
    const qualitySlider = screen.getByRole('slider', { name: /quality/i });
    fireEvent.change(qualitySlider, { target: { value: 90 } });

    await waitFor(() => {
      expect(screen.getByText('Quality: 90%')).toBeInTheDocument();
    });
  });

  it('should handle frame rate slider change', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Frame Rate: 5 FPS')).toBeInTheDocument();
    });

    // Find and interact with frame rate slider
    const frameRateSlider = screen.getByRole('slider', { name: /frame rate/i });
    fireEvent.change(frameRateSlider, { target: { value: 15 } });

    await waitFor(() => {
      expect(screen.getByText('Frame Rate: 15 FPS')).toBeInTheDocument();
    });
  });

  it('should handle monitor selection change', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
        {
          id: 1,
          name: 'Monitor 1',
          isPrimary: false,
          width: 1280,
          height: 1024,
          x: 1920,
          y: 0,
          workingAreaWidth: 1280,
          workingAreaHeight: 984,
          workingAreaX: 1920,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 2,
      timestamp: new Date(),
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Resolution: 1920x1080')).toBeInTheDocument();
    });

    // Change monitor selection
    const monitorSelect = screen.getByLabelText('Monitor');
    fireEvent.mouseDown(monitorSelect);

    const monitor1Option = screen.getByText('Monitor 1');
    fireEvent.click(monitor1Option);

    await waitFor(() => {
      expect(screen.getByText('Resolution: 1280x1024')).toBeInTheDocument();
    });
  });

  it('should toggle fullscreen mode', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Fullscreen')).toBeInTheDocument();
    });

    const fullscreenButton = screen.getByLabelText('Fullscreen');
    fireEvent.click(fullscreenButton);

    expect(mockRequestFullscreen).toHaveBeenCalled();
  });

  it('should show WebSocket disconnection warning', () => {
    mockUseWebSocket.mockReturnValue({
      isConnected: false,
      sendMessage: mockSendMessage,
      disconnect: jest.fn(),
    });

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    expect(
      screen.getByText('WebSocket disconnected. Real-time streaming may not work.')
    ).toBeInTheDocument();
  });

  it('should process incoming screen frames', async () => {
    const mockOnMessage = jest.fn();

    mockUseWebSocket.mockImplementation(({ onMessage }) => {
      mockOnMessage.mockImplementation(onMessage);
      return {
        isConnected: true,
        sendMessage: mockSendMessage,
        disconnect: jest.fn(),
      };
    });

    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);
    mockScreenService.createImageBlobUrl.mockReturnValue('blob:mock-frame-url');

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    // Simulate receiving a screen frame
    const frameData = {
      type: 'screen_frame',
      implantId: 'implant-1',
      frame: {
        frameId: 1,
        timestamp: new Date().toISOString(),
        monitorId: 0,
        width: 1920,
        height: 1080,
        imageData: 'base64framedata',
        size: 50000,
      },
    };

    mockOnMessage(frameData);

    await waitFor(() => {
      expect(mockScreenService.createImageBlobUrl).toHaveBeenCalledWith('base64framedata');
    });
  });

  it('should download screenshot when download button is clicked', async () => {
    const mockMonitors = {
      monitors: [
        {
          id: 0,
          name: 'Monitor 0',
          isPrimary: true,
          width: 1920,
          height: 1080,
          x: 0,
          y: 0,
          workingAreaWidth: 1920,
          workingAreaHeight: 1040,
          workingAreaX: 0,
          workingAreaY: 40,
          bitsPerPixel: 32,
        },
      ],
      totalCount: 1,
      timestamp: new Date(),
    };

    const mockScreenshot = {
      monitorId: 0,
      width: 1920,
      height: 1080,
      imageData: 'base64encodedimage',
      size: 123456,
      timestamp: new Date(),
      capturedMouseCursor: true,
    };

    mockScreenService.getMonitors.mockResolvedValue(mockMonitors);
    mockScreenService.takeScreenshot.mockResolvedValue(mockScreenshot);
    mockScreenService.createImageBlobUrl.mockReturnValue('blob:mock-url');
    mockScreenService.downloadScreenshot.mockImplementation(() => {});

    renderWithTheme(<ScreenMonitor implantId="implant-1" onError={mockOnError} />);

    await waitFor(() => {
      expect(screen.getByText('Screenshot')).toBeInTheDocument();
    });

    // Take screenshot first
    const screenshotButton = screen.getByText('Screenshot');
    fireEvent.click(screenshotButton);

    await waitFor(() => {
      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    // Click download button
    const downloadButton = screen.getByText('Download');
    fireEvent.click(downloadButton);

    expect(mockScreenService.downloadScreenshot).toHaveBeenCalledWith(mockScreenshot);
  });
});
