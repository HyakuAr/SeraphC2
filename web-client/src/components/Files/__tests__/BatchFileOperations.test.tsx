/**
 * BatchFileOperations Component Tests
 * Tests for the batch file operations component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BatchFileOperations } from '../BatchFileOperations';
import { FileService } from '../../../services/fileService';

// Mock FileService
jest.mock('../../../services/fileService');
const mockFileService = FileService as jest.Mocked<typeof FileService>;

describe('BatchFileOperations', () => {
  const mockFiles = [
    {
      name: 'file1.txt',
      path: 'C:\\file1.txt',
      size: 1024,
      isDirectory: false,
      permissions: 'rw-',
      lastModified: '2023-01-01T00:00:00Z',
    },
    {
      name: 'file2.txt',
      path: 'C:\\file2.txt',
      size: 2048,
      isDirectory: false,
      permissions: 'rw-',
      lastModified: '2023-01-01T00:00:00Z',
    },
    {
      name: 'Documents',
      path: 'C:\\Documents',
      size: 0,
      isDirectory: true,
      permissions: 'rwx',
      lastModified: '2023-01-01T00:00:00Z',
    },
  ];

  const mockProps = {
    implantId: 'test-implant-id',
    files: mockFiles,
    selectedFiles: new Set(['file1.txt']),
    onSelectionChange: jest.fn(),
    onOperationComplete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileService.downloadFile.mockResolvedValue({
      transferId: 'test-transfer-id',
      remotePath: 'C:\\file1.txt',
      status: 'initiated',
    });
    mockFileService.deleteFile.mockResolvedValue();
    mockFileService.copyFile.mockResolvedValue();
    mockFileService.renameFile.mockResolvedValue();
  });

  it('renders file list with selection controls', () => {
    render(<BatchFileOperations {...mockProps} />);

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('file1.txt')).toBeInTheDocument();
    expect(screen.getByText('file2.txt')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('handles select all functionality', () => {
    render(<BatchFileOperations {...mockProps} />);

    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);

    expect(mockProps.onSelectionChange).toHaveBeenCalledWith(
      new Set(['file1.txt', 'file2.txt', 'Documents'])
    );
  });

  it('handles individual file selection', () => {
    render(<BatchFileOperations {...mockProps} />);

    const file2Checkbox = screen.getByLabelText(/file2.txt/);
    fireEvent.click(file2Checkbox);

    expect(mockProps.onSelectionChange).toHaveBeenCalledWith(new Set(['file1.txt', 'file2.txt']));
  });

  it('handles batch download operation', async () => {
    render(<BatchFileOperations {...mockProps} />);

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(mockFileService.downloadFile).toHaveBeenCalledWith({
        implantId: 'test-implant-id',
        remotePath: 'C:\\file1.txt',
        checksum: true,
      });
    });
  });

  it('opens context menu for additional operations', () => {
    render(<BatchFileOperations {...mockProps} />);

    const moreButton = screen.getByLabelText(/more/i);
    fireEvent.click(moreButton);

    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Move')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('handles copy operation with destination path', async () => {
    render(<BatchFileOperations {...mockProps} />);

    const moreButton = screen.getByLabelText(/more/i);
    fireEvent.click(moreButton);

    fireEvent.click(screen.getByText('Copy'));

    expect(screen.getByText('Copy Files')).toBeInTheDocument();

    const destinationInput = screen.getByLabelText('Destination Path');
    fireEvent.change(destinationInput, { target: { value: 'C:\\backup' } });

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockFileService.copyFile).toHaveBeenCalledWith(
        'test-implant-id',
        'C:\\file1.txt',
        'C:\\backup\\file1.txt'
      );
    });
  });

  it('handles move operation with destination path', async () => {
    render(<BatchFileOperations {...mockProps} />);

    const moreButton = screen.getByLabelText(/more/i);
    fireEvent.click(moreButton);

    fireEvent.click(screen.getByText('Move'));

    expect(screen.getByText('Move Files')).toBeInTheDocument();

    const destinationInput = screen.getByLabelText('Destination Path');
    fireEvent.change(destinationInput, { target: { value: 'C:\\moved' } });

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockFileService.renameFile).toHaveBeenCalledWith(
        'test-implant-id',
        'C:\\file1.txt',
        'C:\\moved\\file1.txt'
      );
    });
  });

  it('handles delete operation with confirmation', async () => {
    render(<BatchFileOperations {...mockProps} />);

    const moreButton = screen.getByLabelText(/more/i);
    fireEvent.click(moreButton);

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete Files')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete 1 selected files?')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockFileService.deleteFile).toHaveBeenCalledWith('test-implant-id', 'C:\\file1.txt');
    });
  });

  it('shows operation progress', async () => {
    render(<BatchFileOperations {...mockProps} />);

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(screen.getByText('Operations (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Operations (1)'));

    expect(screen.getByText('Active Operations')).toBeInTheDocument();
    expect(screen.getByText('Download 1 files')).toBeInTheDocument();
  });

  it('handles operation errors', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    mockFileService.downloadFile.mockRejectedValue(new Error('Download failed'));

    render(<BatchFileOperations {...mockProps} />);

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to download file file1.txt:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });

  it('clears selection after operation completion', async () => {
    render(<BatchFileOperations {...mockProps} />);

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(mockProps.onSelectionChange).toHaveBeenCalledWith(new Set());
      expect(mockProps.onOperationComplete).toHaveBeenCalled();
    });
  });

  it('formats file sizes correctly', () => {
    render(<BatchFileOperations {...mockProps} />);

    expect(screen.getByText(/1 KB/)).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
  });

  it('shows directory indicator', () => {
    render(<BatchFileOperations {...mockProps} />);

    expect(screen.getByText('Directory')).toBeInTheDocument();
  });

  it('handles archive operation', async () => {
    render(<BatchFileOperations {...mockProps} />);

    const moreButton = screen.getByLabelText(/more/i);
    fireEvent.click(moreButton);

    fireEvent.click(screen.getByText('Archive'));

    // Archive operation should be initiated
    await waitFor(() => {
      expect(screen.getByText('Operations (1)')).toBeInTheDocument();
    });
  });

  it('removes completed operations', async () => {
    render(<BatchFileOperations {...mockProps} />);

    fireEvent.click(screen.getByText('Download'));

    await waitFor(() => {
      expect(screen.getByText('Operations (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Operations (1)'));

    // Wait for operation to complete
    await waitFor(() => {
      const deleteButton = screen.getByLabelText(/delete/i);
      expect(deleteButton).toBeInTheDocument();
      fireEvent.click(deleteButton);
    });
  });

  it('cancels dialog operations', () => {
    render(<BatchFileOperations {...mockProps} />);

    const moreButton = screen.getByLabelText(/more/i);
    fireEvent.click(moreButton);

    fireEvent.click(screen.getByText('Copy'));

    expect(screen.getByText('Copy Files')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Copy Files')).not.toBeInTheDocument();
  });
});
