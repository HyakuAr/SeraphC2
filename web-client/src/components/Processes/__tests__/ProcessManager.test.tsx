/**
 * ProcessManager Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProcessManager } from '../ProcessManager';
import { processService } from '../../../services/processService';

// Mock the process service
jest.mock('../../../services/processService', () => ({
  processService: {
    getSystemResources: jest.fn(),
    formatBytes: jest.fn(bytes => `${bytes} bytes`),
    formatUptime: jest.fn(seconds => `${seconds}s`),
  },
}));

// Mock child components
jest.mock('../ProcessList', () => ({
  ProcessList: ({ implantId }: { implantId: string }) => (
    <div data-testid="process-list">Process List for {implantId}</div>
  ),
}));

jest.mock('../ServiceList', () => ({
  ServiceList: ({ implantId }: { implantId: string }) => (
    <div data-testid="service-list">Service List for {implantId}</div>
  ),
}));

jest.mock('../SystemResources', () => ({
  SystemResources: ({
    implantId,
    systemResources,
    onRefresh,
    loading,
  }: {
    implantId: string;
    systemResources: any;
    onRefresh: () => void;
    loading: boolean;
  }) => (
    <div data-testid="system-resources">
      <div>System Resources for {implantId}</div>
      <button onClick={onRefresh} disabled={loading}>
        Refresh Resources
      </button>
      {systemResources && <div>Resources loaded</div>}
      {loading && <div>Loading...</div>}
    </div>
  ),
}));

const mockProcessService = processService as jest.Mocked<typeof processService>;

describe('ProcessManager', () => {
  const mockImplantId = 'test-implant-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default tab (Processes)', () => {
    render(<ProcessManager implantId={mockImplantId} />);

    expect(screen.getByText('Process & Service Management')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Processes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'System Resources' })).toBeInTheDocument();
    expect(screen.getByTestId('process-list')).toBeInTheDocument();
  });

  it('should switch to Services tab when clicked', () => {
    render(<ProcessManager implantId={mockImplantId} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Services' }));

    expect(screen.getByTestId('service-list')).toBeInTheDocument();
    expect(screen.queryByTestId('process-list')).not.toBeInTheDocument();
  });

  it('should switch to System Resources tab and load resources', async () => {
    const mockResources = {
      cpu: { usage: 50, cores: 4, processes: 100, threads: 500 },
      memory: {
        totalPhysical: 8000000000,
        availablePhysical: 4000000000,
        usedPhysical: 4000000000,
      },
      disk: { drives: [] },
      network: { interfaces: [], totalBytesReceived: 0, totalBytesSent: 0 },
      uptime: 3600,
      timestamp: new Date(),
    };

    mockProcessService.getSystemResources.mockResolvedValue(mockResources);

    render(<ProcessManager implantId={mockImplantId} />);

    fireEvent.click(screen.getByRole('tab', { name: 'System Resources' }));

    await waitFor(() => {
      expect(screen.getByTestId('system-resources')).toBeInTheDocument();
    });

    expect(mockProcessService.getSystemResources).toHaveBeenCalledWith(mockImplantId);
  });

  it('should handle system resources loading error', async () => {
    mockProcessService.getSystemResources.mockRejectedValue(new Error('Failed to load resources'));

    render(<ProcessManager implantId={mockImplantId} />);

    fireEvent.click(screen.getByRole('tab', { name: 'System Resources' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to load resources')).toBeInTheDocument();
    });
  });

  it('should show loading state when fetching system resources', async () => {
    mockProcessService.getSystemResources.mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(<ProcessManager implantId={mockImplantId} />);

    fireEvent.click(screen.getByRole('tab', { name: 'System Resources' }));

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('should allow refreshing system resources', async () => {
    const mockResources = {
      cpu: { usage: 50, cores: 4, processes: 100, threads: 500 },
      memory: {
        totalPhysical: 8000000000,
        availablePhysical: 4000000000,
        usedPhysical: 4000000000,
      },
      disk: { drives: [] },
      network: { interfaces: [], totalBytesReceived: 0, totalBytesSent: 0 },
      uptime: 3600,
      timestamp: new Date(),
    };

    mockProcessService.getSystemResources.mockResolvedValue(mockResources);

    render(<ProcessManager implantId={mockImplantId} />);

    fireEvent.click(screen.getByRole('tab', { name: 'System Resources' }));

    await waitFor(() => {
      expect(screen.getByTestId('system-resources')).toBeInTheDocument();
    });

    // Click refresh button
    fireEvent.click(screen.getByText('Refresh Resources'));

    expect(mockProcessService.getSystemResources).toHaveBeenCalledTimes(2);
  });

  it('should dismiss error alert when close button is clicked', async () => {
    mockProcessService.getSystemResources.mockRejectedValue(new Error('Test error'));

    render(<ProcessManager implantId={mockImplantId} />);

    fireEvent.click(screen.getByRole('tab', { name: 'System Resources' }));

    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    // Find and click the close button on the alert
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Test error')).not.toBeInTheDocument();
    });
  });
});
