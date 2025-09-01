/**
 * Tests for PowerShell Interface component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import PowerShellInterface from '../PowerShellInterface';
import { PowerShellService } from '../../../services/powerShellService';
import { useWebSocket } from '../../../hooks/useWebSocket';

// Mock dependencies
jest.mock('../../../services/powerShellService');
jest.mock('../../../hooks/useWebSocket');
jest.mock('../CommandOutput', () => {
  return function MockCommandOutput({ command, isExecuting }: any) {
    return (
      <div data-testid="command-output">
        {isExecuting ? 'Executing...' : command ? 'Command completed' : 'No command'}
      </div>
    );
  };
});
jest.mock('../PowerShellScriptEditor', () => {
  return function MockPowerShellScriptEditor({ onScriptExecute }: any) {
    return (
      <div data-testid="script-editor">
        <button onClick={() => onScriptExecute({ id: '1', content: 'Get-Process' })}>
          Execute Script
        </button>
      </div>
    );
  };
});
jest.mock('../PowerShellFavorites', () => {
  return function MockPowerShellFavorites({ onFavoriteUse }: any) {
    return (
      <div data-testid="favorites">
        <button onClick={() => onFavoriteUse({ id: '1', command: 'Get-Service' })}>
          Use Favorite
        </button>
      </div>
    );
  };
});
jest.mock('../PowerShellModules', () => {
  return function MockPowerShellModules() {
    return <div data-testid="modules">PowerShell Modules</div>;
  };
});

const mockPowerShellService = PowerShellService as jest.Mocked<typeof PowerShellService>;
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

const mockImplant = {
  id: 'implant-1',
  hostname: 'test-host',
  username: 'test-user',
  operatingSystem: 'Windows 10',
  architecture: 'x64',
  privileges: 'user' as const,
  lastSeen: new Date(),
  status: 'active' as const,
  communicationProtocol: 'https' as const,
  encryptionKey: 'test-key',
  configuration: {
    callbackInterval: 5000,
    jitter: 10,
    maxRetries: 3,
  },
  systemInfo: {
    hostname: 'test-host',
    operatingSystem: 'Windows 10',
    architecture: 'x64',
    processorInfo: 'Intel Core i7',
    memoryTotal: 16777216,
    diskSpace: 1073741824,
    networkInterfaces: ['Ethernet'],
    installedSoftware: ['Chrome', 'Firefox'],
    runningProcesses: 150,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  isConnected: true,
};

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('PowerShellInterface', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWebSocket.mockReturnValue({ socket: mockSocket as any });
    mockPowerShellService.getScripts.mockResolvedValue([]);
    mockPowerShellService.getFavorites.mockResolvedValue([]);
  });

  it('should render PowerShell interface', () => {
    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    expect(screen.getByText('Enhanced PowerShell Interface')).toBeInTheDocument();
    expect(screen.getByLabelText('PowerShell Command')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /execute/i })).toBeInTheDocument();
  });

  it('should show connection status', () => {
    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('should show disconnected status for disconnected implant', () => {
    const disconnectedImplant = { ...mockImplant, isConnected: false };
    renderWithTheme(<PowerShellInterface implant={disconnectedImplant} />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByText(/implant is not connected/i)).toBeInTheDocument();
  });

  it('should execute PowerShell command', async () => {
    const user = userEvent.setup();
    const mockCommand = {
      id: 'command-1',
      type: 'powershell',
      payload: 'Get-Process',
      status: 'pending',
    };

    mockPowerShellService.executePowerShellCommand.mockResolvedValue(mockCommand);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command');
    const executeButton = screen.getByRole('button', { name: /execute/i });

    await user.type(input, 'Get-Process');
    await user.click(executeButton);

    await waitFor(() => {
      expect(mockPowerShellService.executePowerShellCommand).toHaveBeenCalledWith({
        implantId: 'implant-1',
        command: 'Get-Process',
        timeout: 30000,
      });
    });
  });

  it('should execute command on Enter key press', async () => {
    const user = userEvent.setup();
    const mockCommand = {
      id: 'command-1',
      type: 'powershell',
      payload: 'Get-Service',
      status: 'pending',
    };

    mockPowerShellService.executePowerShellCommand.mockResolvedValue(mockCommand);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command');

    await user.type(input, 'Get-Service');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockPowerShellService.executePowerShellCommand).toHaveBeenCalledWith({
        implantId: 'implant-1',
        command: 'Get-Service',
        timeout: 30000,
      });
    });
  });

  it('should not execute empty command', async () => {
    const user = userEvent.setup();

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const executeButton = screen.getByRole('button', { name: /execute/i });

    await user.click(executeButton);

    expect(mockPowerShellService.executePowerShellCommand).not.toHaveBeenCalled();
  });

  it('should disable execution when implant is disconnected', () => {
    const disconnectedImplant = { ...mockImplant, isConnected: false };
    renderWithTheme(<PowerShellInterface implant={disconnectedImplant} />);

    const input = screen.getByLabelText('PowerShell Command');
    const executeButton = screen.getByRole('button', { name: /execute/i });

    expect(input).toBeDisabled();
    expect(executeButton).toBeDisabled();
  });

  it('should handle command execution error', async () => {
    const user = userEvent.setup();
    const error = new Error('Command execution failed');

    mockPowerShellService.executePowerShellCommand.mockRejectedValue(error);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command');
    const executeButton = screen.getByRole('button', { name: /execute/i });

    await user.type(input, 'Invalid-Command');
    await user.click(executeButton);

    await waitFor(() => {
      expect(screen.getByText(/command execution failed/i)).toBeInTheDocument();
    });
  });

  it('should clear command input after execution', async () => {
    const user = userEvent.setup();
    const mockCommand = {
      id: 'command-1',
      type: 'powershell',
      payload: 'Get-Process',
      status: 'pending',
    };

    mockPowerShellService.executePowerShellCommand.mockResolvedValue(mockCommand);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command') as HTMLInputElement;
    const executeButton = screen.getByRole('button', { name: /execute/i });

    await user.type(input, 'Get-Process');
    expect(input.value).toBe('Get-Process');

    await user.click(executeButton);

    await waitFor(() => {
      expect(input.value).toBe('');
    });
  });

  it('should show cancel button during execution', async () => {
    const user = userEvent.setup();
    let resolveCommand: (value: any) => void;
    const commandPromise = new Promise(resolve => {
      resolveCommand = resolve;
    });

    mockPowerShellService.executePowerShellCommand.mockReturnValue(commandPromise);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command');
    const executeButton = screen.getByRole('button', { name: /execute/i });

    await user.type(input, 'Get-Process');
    await user.click(executeButton);

    // Should show cancel button during execution
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(executeButton).toBeDisabled();

    // Resolve the command
    resolveCommand!({ id: 'command-1', status: 'completed' });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  it('should save command as favorite', async () => {
    const user = userEvent.setup();

    mockPowerShellService.createFavorite.mockResolvedValue({
      id: 'favorite-1',
      name: 'Test Favorite',
      command: 'Get-Process',
      operatorId: 'operator-1',
      createdAt: '2023-01-01T00:00:00Z',
      usageCount: 0,
    });

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command');
    await user.type(input, 'Get-Process');

    // Click save as favorite button
    const saveButton = screen.getByRole('button', { name: /save as favorite/i });
    await user.click(saveButton);

    // Should open dialog
    expect(screen.getByText('Save as Favorite')).toBeInTheDocument();

    // Click save in dialog
    const saveDialogButton = screen.getByRole('button', { name: 'Save' });
    await user.click(saveDialogButton);

    await waitFor(() => {
      expect(mockPowerShellService.createFavorite).toHaveBeenCalledWith({
        name: expect.stringContaining('Command'),
        command: 'Get-Process',
        category: 'Custom',
      });
    });
  });

  it('should copy command to clipboard', async () => {
    const user = userEvent.setup();
    const mockWriteText = jest.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command');
    await user.type(input, 'Get-Process');

    const copyButton = screen.getByRole('button', { name: /copy command/i });
    await user.click(copyButton);

    expect(mockWriteText).toHaveBeenCalledWith('Get-Process');
  });

  it('should clear command and output', async () => {
    const user = userEvent.setup();

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    const input = screen.getByLabelText('PowerShell Command') as HTMLInputElement;
    await user.type(input, 'Get-Process');

    const clearButton = screen.getByRole('button', { name: /clear/i });
    await user.click(clearButton);

    expect(input.value).toBe('');
  });

  it('should switch between tabs', async () => {
    const user = userEvent.setup();

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    // Should start on Output tab
    expect(screen.getByTestId('command-output')).toBeInTheDocument();

    // Click Scripts tab
    const scriptsTab = screen.getByRole('tab', { name: /scripts/i });
    await user.click(scriptsTab);

    expect(screen.getByTestId('script-editor')).toBeInTheDocument();

    // Click Favorites tab
    const favoritesTab = screen.getByRole('tab', { name: /favorites/i });
    await user.click(favoritesTab);

    expect(screen.getByTestId('favorites')).toBeInTheDocument();

    // Click Modules tab
    const modulesTab = screen.getByRole('tab', { name: /modules/i });
    await user.click(modulesTab);

    expect(screen.getByTestId('modules')).toBeInTheDocument();
  });

  it('should execute script from script editor', async () => {
    const user = userEvent.setup();
    const mockCommand = {
      id: 'command-1',
      type: 'powershell_script',
      status: 'pending',
    };

    mockPowerShellService.executePowerShellScript.mockResolvedValue(mockCommand);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    // Switch to Scripts tab
    const scriptsTab = screen.getByRole('tab', { name: /scripts/i });
    await user.click(scriptsTab);

    // Execute script from script editor
    const executeScriptButton = screen.getByText('Execute Script');
    await user.click(executeScriptButton);

    await waitFor(() => {
      expect(mockPowerShellService.executePowerShellScript).toHaveBeenCalledWith({
        implantId: 'implant-1',
        scriptContent: 'Get-Process',
        parameters: undefined,
        timeout: 60000,
      });
    });
  });

  it('should use favorite from favorites tab', async () => {
    const user = userEvent.setup();

    mockPowerShellService.useFavorite.mockResolvedValue({
      id: 'favorite-1',
      name: 'Test Favorite',
      command: 'Get-Service',
      operatorId: 'operator-1',
      createdAt: '2023-01-01T00:00:00Z',
      usageCount: 1,
    });

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    // Switch to Favorites tab
    const favoritesTab = screen.getByRole('tab', { name: /favorites/i });
    await user.click(favoritesTab);

    // Use favorite
    const useFavoriteButton = screen.getByText('Use Favorite');
    await user.click(useFavoriteButton);

    await waitFor(() => {
      expect(mockPowerShellService.useFavorite).toHaveBeenCalledWith('1');
    });

    // Should populate command input
    const input = screen.getByLabelText('PowerShell Command') as HTMLInputElement;
    expect(input.value).toBe('Get-Service');
  });

  it('should handle WebSocket events', () => {
    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    // Verify WebSocket event listeners are set up
    expect(mockSocket.on).toHaveBeenCalledWith('commandProgress', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('commandCompleted', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('commandFailed', expect.any(Function));
  });

  it('should load scripts and favorites on mount', async () => {
    const mockScripts = [{ id: 'script-1', name: 'Test Script', content: 'Get-Process' }];
    const mockFavorites = [{ id: 'favorite-1', name: 'Test Favorite', command: 'Get-Service' }];

    mockPowerShellService.getScripts.mockResolvedValue(mockScripts);
    mockPowerShellService.getFavorites.mockResolvedValue(mockFavorites);

    renderWithTheme(<PowerShellInterface implant={mockImplant} />);

    await waitFor(() => {
      expect(mockPowerShellService.getScripts).toHaveBeenCalled();
      expect(mockPowerShellService.getFavorites).toHaveBeenCalled();
    });
  });
});
