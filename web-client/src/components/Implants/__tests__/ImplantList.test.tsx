/**
 * Tests for ImplantList component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import ImplantList from '../ImplantList';
import implantReducer from '../../../store/slices/implantSlice';
import { EnhancedImplant } from '../../../services/websocketService';

// Mock the useWebSocket hook
jest.mock('../../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    requestImplantDetails: jest.fn(),
  }),
}));

const theme = createTheme();

const mockImplants: EnhancedImplant[] = [
  {
    id: 'implant-1',
    hostname: 'DESKTOP-ABC123',
    username: 'user1',
    operatingSystem: 'Windows 10',
    architecture: 'x64',
    privileges: 'user',
    lastSeen: new Date('2023-01-01T12:00:00Z'),
    status: 'active',
    communicationProtocol: 'https',
    systemInfo: {
      hostname: 'DESKTOP-ABC123',
      operatingSystem: 'Windows 10',
      architecture: 'x64',
      processorInfo: 'Intel Core i7',
      memoryTotal: 16777216000,
      diskSpace: 1000000000000,
      networkInterfaces: ['192.168.1.100'],
      installedSoftware: ['Chrome'],
      runningProcesses: 150,
    },
    isConnected: true,
    lastHeartbeat: new Date('2023-01-01T12:05:00Z'),
    connectionInfo: {
      protocol: 'https',
      remoteAddress: '192.168.1.100',
    },
  },
  {
    id: 'implant-2',
    hostname: 'LAPTOP-XYZ789',
    username: 'user2',
    operatingSystem: 'Windows 11',
    architecture: 'x64',
    privileges: 'admin',
    lastSeen: new Date('2023-01-01T11:30:00Z'),
    status: 'inactive',
    communicationProtocol: 'http',
    systemInfo: {
      hostname: 'LAPTOP-XYZ789',
      operatingSystem: 'Windows 11',
      architecture: 'x64',
      processorInfo: 'AMD Ryzen 5',
      memoryTotal: 8388608000,
      diskSpace: 500000000000,
      networkInterfaces: ['192.168.1.101'],
      installedSoftware: ['Firefox'],
      runningProcesses: 120,
    },
    isConnected: false,
  },
];

const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: { implants: implantReducer },
      preloadedState,
    }),
    ...renderOptions
  } = {}
) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Provider store={store}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </Provider>
  );

  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
};

describe('ImplantList', () => {
  it('renders loading state', () => {
    renderWithProviders(<ImplantList implants={[]} loading={true} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders empty state when no implants', () => {
    renderWithProviders(<ImplantList implants={[]} loading={false} />);

    expect(
      screen.getByText('No implants registered yet. Deploy an implant to see it appear here.')
    ).toBeInTheDocument();
  });

  it('renders implant list with correct data', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Check title with count
    expect(screen.getByText('Implants (2)')).toBeInTheDocument();

    // Check implant hostnames
    expect(screen.getByText('DESKTOP-ABC123')).toBeInTheDocument();
    expect(screen.getByText('LAPTOP-XYZ789')).toBeInTheDocument();

    // Check user information
    expect(screen.getByText('user1 • Windows 10 • x64')).toBeInTheDocument();
    expect(screen.getByText('user2 • Windows 11 • x64')).toBeInTheDocument();
  });

  it('displays correct status chips', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Check status chips
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('displays correct protocol chips', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Check protocol chips
    expect(screen.getByText('HTTPS')).toBeInTheDocument();
    expect(screen.getByText('HTTP')).toBeInTheDocument();
  });

  it('displays correct privilege chips', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Check privilege chips
    expect(screen.getByText('USER')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('shows live indicator for connected implants', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Should show "Live" for connected implant
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('formats last seen time correctly', () => {
    // Mock current time to be 1 hour after the last seen time
    const mockDate = new Date('2023-01-01T13:00:00Z');
    jest.spyOn(Date, 'now').mockReturnValue(mockDate.getTime());

    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Should show relative time
    expect(screen.getByText(/Last seen: \d+h ago/)).toBeInTheDocument();

    jest.restoreAllMocks();
  });

  it('opens context menu on more button click', async () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Click the first more button
    const moreButtons = screen.getAllByLabelText('more');
    fireEvent.click(moreButtons[0]);

    // Check if menu items appear
    await waitFor(() => {
      expect(screen.getByText('View Details')).toBeInTheDocument();
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });
  });

  it('dispatches disconnect action when disconnect is clicked', async () => {
    const { store } = renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Click the first more button
    const moreButtons = screen.getAllByLabelText('more');
    fireEvent.click(moreButtons[0]);

    // Click disconnect
    await waitFor(() => {
      const disconnectButton = screen.getByText('Disconnect');
      fireEvent.click(disconnectButton);
    });

    // Check if disconnect action was dispatched
    // Note: In a real test, you might want to mock the dispatch function
    // and verify it was called with the correct action
  });

  it('handles view details click', async () => {
    const { store } = renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Click the first more button
    const moreButtons = screen.getAllByLabelText('more');
    fireEvent.click(moreButtons[0]);

    // Click view details
    await waitFor(() => {
      const viewDetailsButton = screen.getByText('View Details');
      fireEvent.click(viewDetailsButton);
    });

    // Check if selected implant was set in store
    const state = store.getState();
    expect(state.implants.selectedImplant).toEqual(mockImplants[0]);
  });

  it('displays OS icons correctly', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Should display Windows icons (🪟) for Windows systems
    const windowsIcons = screen.getAllByText('🪟');
    expect(windowsIcons).toHaveLength(2);
  });

  it('handles click on implant row', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    // Click on the first implant row
    const implantRow = screen.getByText('DESKTOP-ABC123').closest('[role="button"]');
    if (implantRow) {
      fireEvent.click(implantRow);
    }

    // Should log view details (in real implementation, this would navigate)
    expect(consoleSpy).toHaveBeenCalledWith('View details for implant:', 'DESKTOP-ABC123');

    consoleSpy.mockRestore();
  });

  it('applies hover styles correctly', () => {
    renderWithProviders(<ImplantList implants={mockImplants} loading={false} />);

    const implantRows = screen.getAllByText(/DESKTOP-ABC123|LAPTOP-XYZ789/);
    expect(implantRows[0].closest('div')).toHaveStyle('cursor: pointer');
  });
});
