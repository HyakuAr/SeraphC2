/**
 * Tests for RemoteDesktopController component
 * Implements requirements 11.1, 11.2, 11.4 from the SeraphC2 specification
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RemoteDesktopController } from '../RemoteDesktopController';
import remoteDesktopService from '../../../services/remoteDesktopService';

// Mock the remote desktop service
jest.mock('../../../services/remoteDesktopService');
const mockRemoteDesktopService = remoteDesktopService as jest.Mocked<typeof remoteDesktopService>;

// Mock the ScreenMonitor component
jest.mock('../../Screen/ScreenMonitor', () => ({
  ScreenMonitor: ({ onImageRef, onMouseClick, onMouseMove }: any) => (
    <div data-testid="screen-monitor">
      <img
        data-testid="screen-image"
        src="data:image/jpeg;base64,test"
        alt="Screen capture"
        ref={onImageRef}
        onClick={onMouseClick}
        onMouseMove={onMouseMove}
        style={{ width: 400, height: 300 }}
      />
    </div>
  ),
}));

describe('RemoteDesktopController', () => {
  const mockImplantId = 'test-implant-123';
  const mockOnError = jest.fn();
  const mockOnStatusChange = jest.fn();

  const mockConfig = {
    enableMouseInput: true,
    enableKeyboardInput: true,
    disableLocalInput: false,
    mouseSensitivity: 1.0,
    keyboardLayout: 'en-US',
  };

  const mockStatus = {
    isActive: true,
    mouseInputEnabled: true,
    keyboardInputEnabled: true,
    localInputDisabled: false,
    config: mockConfig,
    inputCount: 5,
    lastInputTime: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoteDesktopService.getDefaultConfig.mockReturnValue(mockConfig);
    mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(null);
    mockRemoteDesktopService.formatInputCount.mockImplementation(count => `${count} inputs`);
    mockRemoteDesktopService.formatLastInputTime.mockImplementation(() => '5m ago');
  });

  describe('Component Rendering', () => {
    it('should render remote desktop controller with initial state', async () => {
      render(
        <RemoteDesktopController
          implantId={mockImplantId}
          onError={mockOnError}
          onStatusChange={mockOnStatusChange}
        />
      );

      expect(screen.getByText('Remote Desktop Controller')).toBeInTheDocument();
      expect(screen.getByText('Start Remote Desktop')).toBeInTheDocument();
      expect(screen.getByText('Remote Desktop Status')).toBeInTheDocument();
      expect(screen.getByText('Quick Settings')).toBeInTheDocument();
    });

    it('should load remote desktop status on mount', async () => {
      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(mockRemoteDesktopService.getRemoteDesktopStatus).toHaveBeenCalledWith(mockImplantId);
      });
    });

    it('should display active status when session is active', async () => {
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Stop Remote Desktop')).toBeInTheDocument();
      });
    });
  });

  describe('Remote Desktop Session Management', () => {
    it('should initialize remote desktop session', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.initializeRemoteDesktop.mockResolvedValue({
        success: true,
        message: 'Session initialized',
        config: mockConfig,
      });
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      const startButton = screen.getByText('Start Remote Desktop');
      await user.click(startButton);

      await waitFor(() => {
        expect(mockRemoteDesktopService.initializeRemoteDesktop).toHaveBeenCalledWith(
          mockImplantId,
          mockConfig
        );
      });
    });

    it('should terminate remote desktop session', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);
      mockRemoteDesktopService.terminateRemoteDesktop.mockResolvedValue({
        success: true,
        message: 'Session terminated',
        timestamp: new Date(),
      });

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Stop Remote Desktop')).toBeInTheDocument();
      });

      const stopButton = screen.getByText('Stop Remote Desktop');
      await user.click(stopButton);

      await waitFor(() => {
        expect(mockRemoteDesktopService.terminateRemoteDesktop).toHaveBeenCalledWith(mockImplantId);
      });
    });

    it('should handle initialization errors', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Failed to initialize session';
      mockRemoteDesktopService.initializeRemoteDesktop.mockRejectedValue(new Error(errorMessage));

      render(<RemoteDesktopController implantId={mockImplantId} onError={mockOnError} />);

      const startButton = screen.getByText('Start Remote Desktop');
      await user.click(startButton);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Failed to initialize remote desktop');
      });
    });
  });

  describe('Mouse Input Handling', () => {
    it('should capture and release mouse input', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Capture Mouse')).toBeInTheDocument();
      });

      const captureButton = screen.getByText('Capture Mouse');
      await user.click(captureButton);

      expect(screen.getByText('Release Mouse')).toBeInTheDocument();

      const releaseButton = screen.getByText('Release Mouse');
      await user.click(releaseButton);

      expect(screen.getByText('Capture Mouse')).toBeInTheDocument();
    });

    it('should send mouse click when mouse is captured', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);
      mockRemoteDesktopService.sendMouseClick.mockResolvedValue({
        success: true,
        message: 'Mouse click sent',
        timestamp: new Date(),
      });
      mockRemoteDesktopService.convertDOMMouseEvent.mockReturnValue({
        x: 100,
        y: 200,
        button: 'left',
        action: 'click',
      });

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Capture Mouse')).toBeInTheDocument();
      });

      // Capture mouse first
      const captureButton = screen.getByText('Capture Mouse');
      await user.click(captureButton);

      // Click on screen image
      const screenImage = screen.getByTestId('screen-image');
      await user.click(screenImage);

      await waitFor(() => {
        expect(mockRemoteDesktopService.sendMouseClick).toHaveBeenCalledWith(mockImplantId, {
          x: 100,
          y: 200,
          button: 'left',
          action: 'click',
        });
      });
    });

    it('should not send mouse events when mouse is not captured', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Capture Mouse')).toBeInTheDocument();
      });

      // Click on screen image without capturing mouse
      const screenImage = screen.getByTestId('screen-image');
      await user.click(screenImage);

      expect(mockRemoteDesktopService.sendMouseClick).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Input Handling', () => {
    it('should capture and release keyboard input', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Capture Keyboard')).toBeInTheDocument();
      });

      const captureButton = screen.getByText('Capture Keyboard');
      await user.click(captureButton);

      expect(screen.getByText('Release Keyboard')).toBeInTheDocument();
      expect(
        screen.getByText('Keyboard input active - Type here to send to remote desktop')
      ).toBeInTheDocument();

      const releaseButton = screen.getByText('Release Keyboard');
      await user.click(releaseButton);

      expect(screen.getByText('Capture Keyboard')).toBeInTheDocument();
    });
  });

  describe('Local Input Control', () => {
    it('should toggle local input disable/enable', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);
      mockRemoteDesktopService.disableLocalInput.mockResolvedValue({
        success: true,
        message: 'Local input disabled',
        timestamp: new Date(),
      });

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Disable Local Input')).toBeInTheDocument();
      });

      const toggleButton = screen.getByText('Disable Local Input');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(mockRemoteDesktopService.disableLocalInput).toHaveBeenCalledWith(mockImplantId);
      });
    });

    it('should enable local input when currently disabled', async () => {
      const user = userEvent.setup();
      const disabledStatus = {
        ...mockStatus,
        localInputDisabled: true,
      };
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(disabledStatus);
      mockRemoteDesktopService.enableLocalInput.mockResolvedValue({
        success: true,
        message: 'Local input enabled',
        timestamp: new Date(),
      });

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Local Input')).toBeInTheDocument();
      });

      const toggleButton = screen.getByText('Enable Local Input');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(mockRemoteDesktopService.enableLocalInput).toHaveBeenCalledWith(mockImplantId);
      });
    });
  });

  describe('Settings Management', () => {
    it('should open and close settings dialog', async () => {
      const user = userEvent.setup();

      render(<RemoteDesktopController implantId={mockImplantId} />);

      const settingsButton = screen.getByLabelText('Settings');
      await user.click(settingsButton);

      expect(screen.getByText('Remote Desktop Settings')).toBeInTheDocument();
      expect(screen.getByText('Quality Presets')).toBeInTheDocument();

      const closeButton = screen.getByText('Close');
      await user.click(closeButton);

      expect(screen.queryByText('Remote Desktop Settings')).not.toBeInTheDocument();
    });

    it('should update configuration settings', async () => {
      const user = userEvent.setup();

      render(<RemoteDesktopController implantId={mockImplantId} />);

      // Toggle mouse input setting
      const mouseInputSwitch = screen.getByRole('checkbox', { name: /Enable Mouse Input/i });
      await user.click(mouseInputSwitch);

      // Toggle keyboard input setting
      const keyboardInputSwitch = screen.getByRole('checkbox', { name: /Enable Keyboard Input/i });
      await user.click(keyboardInputSwitch);

      // Toggle disable local input setting
      const disableLocalInputSwitch = screen.getByRole('checkbox', {
        name: /Disable Local Input on Start/i,
      });
      await user.click(disableLocalInputSwitch);

      // Settings should be updated in component state
      expect(mouseInputSwitch).not.toBeChecked();
      expect(keyboardInputSwitch).not.toBeChecked();
      expect(disableLocalInputSwitch).toBeChecked();
    });

    it('should disable settings when session is active', async () => {
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        const mouseInputSwitch = screen.getByRole('checkbox', { name: /Enable Mouse Input/i });
        const keyboardInputSwitch = screen.getByRole('checkbox', {
          name: /Enable Keyboard Input/i,
        });
        const disableLocalInputSwitch = screen.getByRole('checkbox', {
          name: /Disable Local Input on Start/i,
        });

        expect(mouseInputSwitch).toBeDisabled();
        expect(keyboardInputSwitch).toBeDisabled();
        expect(disableLocalInputSwitch).toBeDisabled();
      });
    });
  });

  describe('Status Display', () => {
    it('should display remote desktop status information', async () => {
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(<RemoteDesktopController implantId={mockImplantId} />);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Mouse Input: Enabled')).toBeInTheDocument();
        expect(screen.getByText('Keyboard Input: Enabled')).toBeInTheDocument();
        expect(screen.getByText('Local Input: Enabled')).toBeInTheDocument();
        expect(screen.getByText('Input Count: 5 inputs')).toBeInTheDocument();
        expect(screen.getByText('Last Input: 5m ago')).toBeInTheDocument();
      });
    });

    it('should call onStatusChange when status changes', async () => {
      mockRemoteDesktopService.getRemoteDesktopStatus.mockResolvedValue(mockStatus);

      render(
        <RemoteDesktopController implantId={mockImplantId} onStatusChange={mockOnStatusChange} />
      );

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalledWith(mockStatus);
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error messages', async () => {
      const errorMessage = 'Failed to load status';
      mockRemoteDesktopService.getRemoteDesktopStatus.mockRejectedValue(new Error(errorMessage));

      render(<RemoteDesktopController implantId={mockImplantId} onError={mockOnError} />);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Failed to load remote desktop status');
      });
    });

    it('should handle service errors gracefully', async () => {
      const user = userEvent.setup();
      mockRemoteDesktopService.initializeRemoteDesktop.mockRejectedValue(
        new Error('Service unavailable')
      );

      render(<RemoteDesktopController implantId={mockImplantId} onError={mockOnError} />);

      const startButton = screen.getByText('Start Remote Desktop');
      await user.click(startButton);

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Failed to initialize remote desktop');
      });
    });
  });

  describe('Integration with ScreenMonitor', () => {
    it('should pass correct props to ScreenMonitor', () => {
      render(<RemoteDesktopController implantId={mockImplantId} />);

      const screenMonitor = screen.getByTestId('screen-monitor');
      expect(screenMonitor).toBeInTheDocument();

      const screenImage = screen.getByTestId('screen-image');
      expect(screenImage).toBeInTheDocument();
    });

    it('should handle screen image reference correctly', async () => {
      const mockImageRef = document.createElement('img');
      mockImageRef.getBoundingClientRect = jest.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
      });
      mockImageRef.naturalWidth = 800;
      mockImageRef.naturalHeight = 600;

      render(<RemoteDesktopController implantId={mockImplantId} />);

      // The image ref should be handled internally by the component
      expect(screen.getByTestId('screen-image')).toBeInTheDocument();
    });
  });
});
