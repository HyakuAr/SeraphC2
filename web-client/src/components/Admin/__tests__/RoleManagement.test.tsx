/**
 * Role Management Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoleManagement from '../RoleManagement';
import { rbacService } from '../../../services/rbacService';

// Mock the RBAC service
jest.mock('../../../services/rbacService', () => ({
  rbacService: {
    getOperators: jest.fn(),
    getRoles: jest.fn(),
    updateOperatorRole: jest.fn(),
  },
}));

const mockRbacService = rbacService as jest.Mocked<typeof rbacService>;

const mockOperators = [
  {
    id: 'op1',
    username: 'admin',
    email: 'admin@example.com',
    role: 'administrator',
    lastLogin: new Date('2024-01-01'),
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'op2',
    username: 'operator',
    email: 'operator@example.com',
    role: 'operator',
    lastLogin: new Date('2024-01-02'),
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  },
  {
    id: 'op3',
    username: 'readonly',
    email: 'readonly@example.com',
    role: 'read_only',
    lastLogin: undefined,
    isActive: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

const mockRoles = [
  {
    role: 'administrator',
    name: 'Administrator',
    description: 'Full access to all system functions',
    permissions: [
      { resource: 'system', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'operator', actions: ['create', 'read', 'update', 'delete', 'manage'] },
    ],
  },
  {
    role: 'operator',
    name: 'Operator',
    description: 'Can execute commands and perform most operations',
    permissions: [
      { resource: 'command', actions: ['create', 'read', 'execute', 'delete'] },
      { resource: 'file', actions: ['create', 'read', 'update', 'delete', 'upload', 'download'] },
    ],
  },
  {
    role: 'read_only',
    name: 'Read-Only',
    description: 'Can view implants and command results but cannot execute commands',
    permissions: [
      { resource: 'implant', actions: ['read', 'view'] },
      { resource: 'command', actions: ['read', 'view'] },
    ],
  },
];

describe('RoleManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    mockRbacService.getOperators.mockImplementation(() => new Promise(() => {}));
    mockRbacService.getRoles.mockImplementation(() => new Promise(() => {}));

    render(<RoleManagement />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render operators and roles after loading', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('Role Management')).toBeInTheDocument();
    });

    // Check operators table
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('operator')).toBeInTheDocument();
    expect(screen.getByText('readonly')).toBeInTheDocument();

    // Check role definitions
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Read-Only')).toBeInTheDocument();
  });

  it('should display error message on load failure', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: false,
      error: 'Failed to load operators',
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load operators')).toBeInTheDocument();
    });
  });

  it('should open edit dialog when edit button is clicked', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('Edit Role');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Operator Role')).toBeInTheDocument();
      expect(screen.getByText('Operator: admin')).toBeInTheDocument();
    });
  });

  it('should update operator role successfully', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });
    mockRbacService.updateOperatorRole.mockResolvedValue({
      success: true,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // Open edit dialog
    const editButtons = screen.getAllByText('Edit Role');
    fireEvent.click(editButtons[1]); // Edit operator user

    await waitFor(() => {
      expect(screen.getByText('Edit Operator Role')).toBeInTheDocument();
    });

    // Change role
    const roleSelect = screen.getByLabelText('New Role');
    fireEvent.mouseDown(roleSelect);

    await waitFor(() => {
      const adminOption = screen.getByText('Administrator');
      fireEvent.click(adminOption);
    });

    // Save changes
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockRbacService.updateOperatorRole).toHaveBeenCalledWith('op2', 'administrator');
    });
  });

  it('should handle role update failure', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });
    mockRbacService.updateOperatorRole.mockResolvedValue({
      success: false,
      error: 'Permission denied',
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // Open edit dialog and attempt to save
    const editButtons = screen.getAllByText('Edit Role');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Operator Role')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('should display correct status chips', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // Check role chips
    expect(screen.getByText('ADMINISTRATOR')).toBeInTheDocument();
    expect(screen.getByText('OPERATOR')).toBeInTheDocument();
    expect(screen.getByText('READ ONLY')).toBeInTheDocument();

    // Check status chips
    const activeChips = screen.getAllByText('Active');
    const inactiveChips = screen.getAllByText('Inactive');
    expect(activeChips).toHaveLength(2);
    expect(inactiveChips).toHaveLength(1);
  });

  it('should format dates correctly', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // Check that dates are formatted
    expect(screen.getByText('Never')).toBeInTheDocument(); // For readonly user with no lastLogin

    // Check that actual dates are formatted (will depend on locale)
    const dateElements = screen.getAllByText(/\d{1,2}\/\d{1,2}\/\d{4}/);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it('should expand role definitions to show permissions', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('Administrator')).toBeInTheDocument();
    });

    // Expand administrator role
    const adminAccordion = screen.getByText('Administrator').closest('button');
    if (adminAccordion) {
      fireEvent.click(adminAccordion);
    }

    await waitFor(() => {
      expect(screen.getByText('Full access to all system functions')).toBeInTheDocument();
      expect(screen.getByText('Permissions:')).toBeInTheDocument();
      expect(screen.getByText('SYSTEM')).toBeInTheDocument();
    });
  });

  it('should close edit dialog when cancel is clicked', async () => {
    mockRbacService.getOperators.mockResolvedValue({
      success: true,
      data: mockOperators,
    });
    mockRbacService.getRoles.mockResolvedValue({
      success: true,
      data: mockRoles,
    });

    render(<RoleManagement />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // Open edit dialog
    const editButtons = screen.getAllByText('Edit Role');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Operator Role')).toBeInTheDocument();
    });

    // Cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Edit Operator Role')).not.toBeInTheDocument();
    });
  });
});
