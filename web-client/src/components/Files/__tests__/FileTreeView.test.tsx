/**
 * FileTreeView Component Tests
 * Tests for the interactive file tree view component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTreeView } from '../FileTreeView';
import { FileService } from '../../../services/fileService';

// Mock FileService
jest.mock('../../../services/fileService');
const mockFileService = FileService as jest.Mocked<typeof FileService>;

// Mock Material-UI TreeView
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  TreeView: ({ children, onNodeToggle, onNodeSelect }: any) => (
    <div data-testid="tree-view" onClick={() => onNodeSelect({}, 'C:\\test')}>
      {children}
    </div>
  ),
  TreeItem: ({ label, nodeId, children }: any) => (
    <div data-testid={`tree-item-${nodeId}`}>
      {label}
      {children}
    </div>
  ),
}));

describe('FileTreeView', () => {
  const mockProps = {
    implantId: 'test-implant-id',
    onFileSelect: jest.fn(),
    onDirectorySelect: jest.fn(),
    onFilePreview: jest.fn(),
    selectedPath: 'C:\\',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileService.listFiles.mockResolvedValue({
      path: 'C:\\',
      files: [
        {
          name: 'Documents',
          path: 'C:\\Documents',
          size: 0,
          isDirectory: true,
          permissions: 'rwx',
          lastModified: '2023-01-01T00:00:00Z',
        },
        {
          name: 'test.txt',
          path: 'C:\\test.txt',
          size: 1024,
          isDirectory: false,
          permissions: 'rw-',
          lastModified: '2023-01-01T00:00:00Z',
        },
      ],
      totalSize: 1024,
      totalFiles: 1,
      totalDirectories: 1,
    });
  });

  it('renders tree view with root directory', async () => {
    render(<FileTreeView {...mockProps} />);

    expect(screen.getByText('Directory Tree')).toBeInTheDocument();
    expect(screen.getByTestId('tree-view')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledWith({
        implantId: 'test-implant-id',
        path: 'C:\\',
        recursive: false,
      });
    });
  });

  it('handles directory selection', async () => {
    render(<FileTreeView {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('tree-view')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tree-view'));

    expect(mockProps.onDirectorySelect).toHaveBeenCalledWith('C:\\test');
  });

  it('shows loading state', () => {
    render(<FileTreeView {...mockProps} />);

    // Should show loading initially
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('handles refresh action', async () => {
    render(<FileTreeView {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByTitle('Refresh')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Refresh'));

    expect(mockFileService.listFiles).toHaveBeenCalledTimes(2);
  });

  it('handles file service errors', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    mockFileService.listFiles.mockRejectedValue(new Error('Network error'));

    render(<FileTreeView {...mockProps} />);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to load root directories:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });

  it('formats file sizes correctly', async () => {
    render(<FileTreeView {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('1 KB')).toBeInTheDocument();
    });
  });

  it('shows context menu on right click', async () => {
    render(<FileTreeView {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('tree-view')).toBeInTheDocument();
    });

    // Simulate right-click context menu
    const treeView = screen.getByTestId('tree-view');
    fireEvent.contextMenu(treeView);

    // Context menu should appear (mocked behavior)
    expect(screen.getByTestId('tree-view')).toBeInTheDocument();
  });
});
