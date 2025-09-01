/**
 * FileBrowser component tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileBrowser } from '../FileBrowser';
import { FileService } from '../../../services/fileService';

// Mock the FileService
jest.mock('../../../services/fileService');

const mockFileService = FileService as jest.Mocked<typeof FileService>;

describe('FileBrowser', () => {
  const mockListing = {
    path: 'C:\\',
    files: [
      {
        name: 'Documents',
        path: 'C:\\Documents',
        size: 0,
        isDirectory: true,
        permissions: 'rwx',
        lastModified: '2023-01-01T00:00:00.000Z',
      },
      {
        name: 'test.txt',
        path: 'C:\\test.txt',
        size: 1024,
        isDirectory: false,
        permissions: 'rw-',
        lastModified: '2023-01-01T00:00:00.000Z',
      },
    ],
    totalSize: 1024,
    totalFiles: 1,
    totalDirectories: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileService.listFiles.mockResolvedValue(mockListing);
  });

  it('should render file browser with initial directory', async () => {
    render(<FileBrowser implantId="test-implant-1" initialPath="C:\\" />);

    // Should show loading initially
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // Should show file statistics
    expect(screen.getByText('1 files')).toBeInTheDocument();
    expect(screen.getByText('1 directories')).toBeInTheDocument();
    expect(screen.getByText('Total: 1.00 KB')).toBeInTheDocument();

    expect(mockFileService.listFiles).toHaveBeenCalledWith({
      implantId: 'test-implant-1',
      path: 'C:\\',
      recursive: false,
    });
  });

  it('should navigate to directory on double-click', async () => {
    const user = userEvent.setup();
    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('Documents')).toBeInTheDocument();
    });

    // Double-click on directory
    await user.dblClick(screen.getByText('Documents'));

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        path: 'C:\\Documents',
        recursive: false,
      });
    });
  });

  it('should select files on click', async () => {
    const user = userEvent.setup();
    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // Click on file to select it
    await user.click(screen.getByText('test.txt'));

    // Should show download and delete buttons for selected files
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('should open upload dialog', async () => {
    const user = userEvent.setup();
    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('Upload')).toBeInTheDocument();
    });

    // Click upload button
    await user.click(screen.getByText('Upload'));

    // Should open upload dialog
    expect(screen.getByText('Upload Files')).toBeInTheDocument();
  });

  it('should handle file upload', async () => {
    const user = userEvent.setup();
    mockFileService.uploadFile.mockResolvedValue({
      transferId: 'transfer_123',
      fileName: 'test.txt',
      fileSize: 1024,
      status: 'initiated',
    });

    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('Upload')).toBeInTheDocument();
    });

    // Click upload button
    await user.click(screen.getByText('Upload'));

    // Create a mock file
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    const fileInput = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;

    // Upload file
    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockFileService.uploadFile).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        remotePath: 'C:\\',
        file,
      });
    });
  });

  it('should handle file download', async () => {
    const user = userEvent.setup();
    mockFileService.downloadFile.mockResolvedValue({
      transferId: 'transfer_456',
      remotePath: 'C:\\test.txt',
      status: 'initiated',
    });

    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // Find and click the download button for the file
    const downloadButtons = screen.getAllByLabelText('Download');
    await user.click(downloadButtons[0]);

    await waitFor(() => {
      expect(mockFileService.downloadFile).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        remotePath: 'C:\\test.txt',
      });
    });
  });

  it('should handle file deletion', async () => {
    const user = userEvent.setup();
    mockFileService.performFileOperation.mockResolvedValue();

    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // Click on file to select it
    await user.click(screen.getByText('test.txt'));

    // Click delete button
    await user.click(screen.getByText('Delete'));

    // Should open delete confirmation dialog
    expect(screen.getByText('Delete File')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete "test.txt"?')).toBeInTheDocument();

    // Confirm deletion
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockFileService.performFileOperation).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operation: 'delete',
        sourcePath: 'C:\\test.txt',
      });
    });
  });

  it('should handle file rename', async () => {
    const user = userEvent.setup();
    mockFileService.performFileOperation.mockResolvedValue();

    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // Find and click the rename button for the file
    const renameButtons = screen.getAllByLabelText('Rename');
    await user.click(renameButtons[0]);

    // Should open rename dialog
    expect(screen.getByText('Rename File')).toBeInTheDocument();

    // Enter new name
    const nameInput = screen.getByLabelText('New Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'renamed.txt');

    // Confirm rename
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockFileService.performFileOperation).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operation: 'rename',
        sourcePath: 'C:\\test.txt',
        destinationPath: 'C:\\renamed.txt',
      });
    });
  });

  it('should handle file copy', async () => {
    const user = userEvent.setup();
    mockFileService.performFileOperation.mockResolvedValue();

    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    // Find and click the copy button for the file
    const copyButtons = screen.getAllByLabelText('Copy');
    await user.click(copyButtons[0]);

    // Should open copy dialog
    expect(screen.getByText('Copy File')).toBeInTheDocument();

    // Enter destination path
    const pathInput = screen.getByLabelText('Destination Path');
    await user.clear(pathInput);
    await user.type(pathInput, 'C:\\backup\\test.txt');

    // Confirm copy
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockFileService.performFileOperation).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        operation: 'copy',
        sourcePath: 'C:\\test.txt',
        destinationPath: 'C:\\backup\\test.txt',
      });
    });
  });

  it('should navigate up directory', async () => {
    const user = userEvent.setup();
    render(<FileBrowser implantId="test-implant-1" initialPath="C:\\Documents" />);

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        path: 'C:\\Documents',
        recursive: false,
      });
    });

    // Click back button
    const backButton = screen.getByLabelText('Back');
    await user.click(backButton);

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        path: 'C:\\',
        recursive: false,
      });
    });
  });

  it('should refresh directory', async () => {
    const user = userEvent.setup();
    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledTimes(1);
    });

    // Click refresh button
    const refreshButton = screen.getByLabelText('Refresh');
    await user.click(refreshButton);

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledTimes(2);
    });
  });

  it('should display error messages', async () => {
    mockFileService.listFiles.mockRejectedValue(new Error('Failed to load directory'));

    render(<FileBrowser implantId="test-implant-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load directory')).toBeInTheDocument();
    });
  });

  it('should navigate using breadcrumbs', async () => {
    const user = userEvent.setup();
    render(<FileBrowser implantId="test-implant-1" initialPath="C:\\Documents\\Projects" />);

    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Projects')).toBeInTheDocument();
    });

    // Click on Documents breadcrumb
    await user.click(screen.getByText('Documents'));

    await waitFor(() => {
      expect(mockFileService.listFiles).toHaveBeenCalledWith({
        implantId: 'test-implant-1',
        path: 'C:\\Documents',
        recursive: false,
      });
    });
  });
});
