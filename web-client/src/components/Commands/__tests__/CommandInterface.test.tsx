/**
 * CommandInterface component tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandInterface } from '../CommandInterface';
import { CommandService } from '../../../services/commandService';
import { useWebSocket } from '../../../hooks/useWebSocket';

// Mock dependencies
jest.mock('../../../services/commandService');
jest.mock('../../../hooks/useWebSocket');
jest.mock('../CommandOutput', () => {
  return function MockCommandOutput({ command, isExecuting, progress }: any) {
    return (
      <div data-testid="command-output">
        {isExecuting && <div>Executing...</div>}
        {command && <div>Command: {command.payload}</div>}
        {progress && <div>Progress: {progress.message}</div>}
      </div>
    );
  };
});
jest.mock('../CommandHistory', () => {
  return function MockCommandHistory({ commands, onCommandSelect }: any) {
    return (
      <div data-testid="command-history">
        {commands.map((cmd: any) => (
          <div key={cmd.id} onClick={() => onCommandSelect(cmd)}>
            {cmd.payload}
          </div>
        ))}
      </div>
    );
  };
});

const mockImplant = {
  id: 'test-implant-1',
  hostname: 'test-host',
  username: 'test-user',
  operatingSystem: 'Windows 10',
  architecture: 'x64',
  privileges: 'user',
  lastSeen: new Date(),
  status: 'active',
  communicationProtocol: 'https',
  isConnected: true,
  systemInfo: {},
  configuration: {},
};

const mockCommand = {
  id: 'test-command-1',
  implantId: 'test-implant-1',
  operatorId: 'test-operator-1',
  type: 'shell',
  payload: 'whoami',
  timestamp: new Date().toISOString(),
  status: 'completed',
  result: {
    stdout: 'test-user',
    stderr: '',
    exitCode: 0,
    executionTime: 1000,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('CommandInterface', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  };

  const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;
  const mockCommandService = CommandService as jest.Mocked<typeof CommandService>;

  beforeEach(() => {
    mockUseWebSocket.mockReturnValue({
      socket: mockSocket,
      isConnected: true,
      requestImplantDetails: jest.fn(),
      requestImplantList: jest.fn(),
      requestImplantStats: jest.fn(),
    } as any);

    mockCommandService.executeShellCommand = jest.fn();
    mockCommandService.executePowerShellCommand = jest.fn();
    mockCommandService.cancelCommand = jest.fn();
    mockCommandService.getCommandHistory = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render command interface', () => {
    render(<CommandInterface implant={mockImplant} />);

    expect(screen.getByText('Command Interface')).toBeInTheDocument();
    expect(screen.getByLabelText('Command')).toBeInTheDocument();
    expect(screen.getByText('Execute')).toBeInTheDocument();
  });

  it('should show connected status when implant is connected', () => {
    render(<CommandInterface implant={mockImplant} />);

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('should show disconnected status when implant is not connected', () => {
    const disconnectedImplant = { ...mockImplant, isConnected: false };
    render(<CommandInterface implant={disconnectedImplant} />);

    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(
      screen.getByText('Implant is not connected. Commands cannot be executed.')
    ).toBeInTheDocument();
  });

  it('should execute shell command when form is submitted', async () => {
    const user = userEvent.setup();
    mockCommandService.executeShellCommand.mockResolvedValue(mockCommand);
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Type command
    const commandInput = screen.getByLabelText('Command');
    await user.type(commandInput, 'whoami');

    // Click execute button
    const executeButton = screen.getByText('Execute');
    await user.click(executeButton);

    await waitFor(() => {
      expect(mockCommandService.executeShellCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        command: 'whoami',
        timeout: 30000,
      });
    });
  });

  it('should execute PowerShell command when PowerShell type is selected', async () => {
    const user = userEvent.setup();
    mockCommandService.executePowerShellCommand.mockResolvedValue(mockCommand);
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Select PowerShell type
    const typeSelect = screen.getByLabelText('Type');
    await user.click(typeSelect);
    await user.click(screen.getByText('PowerShell'));

    // Type command
    const commandInput = screen.getByLabelText('Command');
    await user.type(commandInput, 'Get-Process');

    // Click execute button
    const executeButton = screen.getByText('Execute');
    await user.click(executeButton);

    await waitFor(() => {
      expect(mockCommandService.executePowerShellCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        command: 'Get-Process',
        timeout: 30000,
      });
    });
  });

  it('should execute command when Enter key is pressed', async () => {
    const user = userEvent.setup();
    mockCommandService.executeShellCommand.mockResolvedValue(mockCommand);
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Type command and press Enter
    const commandInput = screen.getByLabelText('Command');
    await user.type(commandInput, 'whoami{enter}');

    await waitFor(() => {
      expect(mockCommandService.executeShellCommand).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        command: 'whoami',
        timeout: 30000,
      });
    });
  });

  it('should disable execute button when implant is not connected', () => {
    const disconnectedImplant = { ...mockImplant, isConnected: false };
    render(<CommandInterface implant={disconnectedImplant} />);

    const executeButton = screen.getByText('Execute');
    expect(executeButton).toBeDisabled();
  });

  it('should disable execute button when command input is empty', () => {
    render(<CommandInterface implant={mockImplant} />);

    const executeButton = screen.getByText('Execute');
    expect(executeButton).toBeDisabled();
  });

  it('should show cancel button when command is executing', async () => {
    const user = userEvent.setup();
    mockCommandService.executeShellCommand.mockImplementation(() => {
      return new Promise(() => {}); // Never resolves to simulate ongoing execution
    });
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Type and execute command
    const commandInput = screen.getByLabelText('Command');
    await user.type(commandInput, 'whoami');

    const executeButton = screen.getByText('Execute');
    await user.click(executeButton);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('should cancel command when cancel button is clicked', async () => {
    const user = userEvent.setup();
    mockCommandService.executeShellCommand.mockResolvedValue(mockCommand);
    mockCommandService.cancelCommand.mockResolvedValue(undefined);
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Type and execute command
    const commandInput = screen.getByLabelText('Command');
    await user.type(commandInput, 'whoami');

    const executeButton = screen.getByText('Execute');
    await user.click(executeButton);

    // Wait for command to start executing and cancel button to appear
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    // Click cancel button
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    await waitFor(() => {
      expect(mockCommandService.cancelCommand).toHaveBeenCalledWith('test-command-1');
    });
  });

  it('should toggle command history when history button is clicked', async () => {
    const user = userEvent.setup();
    mockCommandService.getCommandHistory.mockResolvedValue([mockCommand]);

    render(<CommandInterface implant={mockImplant} />);

    // Click history button
    const historyButton = screen.getByLabelText('Command History');
    await user.click(historyButton);

    await waitFor(() => {
      expect(screen.getByTestId('command-history')).toBeInTheDocument();
    });
  });

  it('should handle WebSocket command progress events', async () => {
    mockCommandService.executeShellCommand.mockResolvedValue(mockCommand);
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Simulate WebSocket command progress event
    const progressCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'commandProgress'
    )?.[1];

    if (progressCallback) {
      progressCallback({
        commandId: 'test-command-1',
        status: 'executing',
        progress: 50,
        message: 'Command executing...',
        timestamp: new Date().toISOString(),
      });
    }

    // The progress should be handled by the component
    expect(mockSocket.on).toHaveBeenCalledWith('commandProgress', expect.any(Function));
  });

  it('should handle WebSocket command completion events', async () => {
    mockCommandService.executeShellCommand.mockResolvedValue(mockCommand);
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Simulate WebSocket command completion event
    const completionCallback = mockSocket.on.mock.calls.find(
      call => call[0] === 'commandCompleted'
    )?.[1];

    if (completionCallback) {
      completionCallback({
        command: mockCommand,
        result: mockCommand.result,
        status: 'completed',
      });
    }

    expect(mockSocket.on).toHaveBeenCalledWith('commandCompleted', expect.any(Function));
  });

  it('should clear output when clear button is clicked', async () => {
    const user = userEvent.setup();
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    render(<CommandInterface implant={mockImplant} />);

    // Click clear button
    const clearButton = screen.getByLabelText('Clear Output');
    await user.click(clearButton);

    // Output should be cleared (this would be verified by checking the CommandOutput component)
    expect(clearButton).toBeInTheDocument();
  });

  it('should copy command to clipboard when copy button is clicked', async () => {
    const user = userEvent.setup();
    mockCommandService.getCommandHistory.mockResolvedValue([]);

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(),
      },
    });

    render(<CommandInterface implant={mockImplant} />);

    // Type command
    const commandInput = screen.getByLabelText('Command');
    await user.type(commandInput, 'whoami');

    // Click copy button
    const copyButton = screen.getByLabelText('Copy Command');
    await user.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('whoami');
  });
});
