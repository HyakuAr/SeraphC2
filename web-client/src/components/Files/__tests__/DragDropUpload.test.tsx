/**
 * DragDropUpload Component Tests
 * Tests for the drag and drop file upload component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DragDropUpload } from '../DragDropUpload';
import { FileService } from '../../../services/fileService';

// Mock FileService
jest.mock('../../../services/fileService');
const mockFileService = FileService as jest.Mocked<typeof FileService>;

// Mock file for testing
const createMockFile = (name: string, size: number, type: string = 'text/plain') => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('DragDropUpload', () => {
  const mockProps = {
    implantId: 'test-implant-id',
    currentPath: 'C:\\test',
    onUploadComplete: jest.fn(),
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileService.uploadFile.mockResolvedValue({
      transferId: 'test-transfer-id',
      fileName: 'test.txt',
      fileSize: 1024,
      status: 'initiated',
    });
    mockFileService.cancelTransfer.mockResolvedValue();
  });

  it('renders drag and drop zone', () => {
    render(<DragDropUpload {...mockProps} />);

    expect(screen.getByText('Drop files here or click to browse')).toBeInTheDocument();
    expect(screen.getByText('Upload to: C:\\test')).toBeInTheDocument();
    expect(screen.getByText(/Max file size: 10 MB/)).toBeInTheDocument();
    expect(screen.getByText(/Max files: 5/)).toBeInTheDocument();
  });

  it('handles file selection via click', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    expect(dropZone).toBeInTheDocument();

    // Simulate file input change
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = createMockFile('test.txt', 1024);

    Object.defineProperty(fileInput, 'files', {
      value: [mockFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText('Upload Files to C:\\test')).toBeInTheDocument();
    });
  });

  it('handles drag and drop events', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    // Simulate drag over
    fireEvent.dragOver(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    // Simulate drop
    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Upload Files to C:\\test')).toBeInTheDocument();
    });
  });

  it('validates file size limits', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const largeFile = createMockFile('large.txt', 20 * 1024 * 1024); // 20MB

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [largeFile],
      },
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'File validation errors:',
        expect.arrayContaining([expect.stringContaining('File size exceeds limit')])
      );
    });

    consoleError.mockRestore();
  });

  it('validates file count limits', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const files = Array.from({ length: 6 }, (_, i) => createMockFile(`file${i}.txt`, 1024));

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files,
      },
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'File validation errors:',
        expect.arrayContaining([expect.stringContaining('Maximum 5 files allowed')])
      );
    });

    consoleError.mockRestore();
  });

  it('validates allowed file types', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    render(<DragDropUpload {...mockProps} allowedTypes={['txt', 'pdf']} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const invalidFile = createMockFile('test.exe', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [invalidFile],
      },
    });

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'File validation errors:',
        expect.arrayContaining([expect.stringContaining('File type not allowed')])
      );
    });

    consoleError.mockRestore();
  });

  it('starts upload process', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Start Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Upload'));

    expect(mockFileService.uploadFile).toHaveBeenCalledWith({
      implantId: 'test-implant-id',
      remotePath: 'C:\\test',
      file: mockFile,
    });
  });

  it('shows upload progress', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Start Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Upload'));

    await waitFor(() => {
      expect(screen.getByText('uploading')).toBeInTheDocument();
    });
  });

  it('handles upload cancellation', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Start Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Upload'));

    await waitFor(() => {
      const cancelButton = screen.getByLabelText(/cancel/i);
      expect(cancelButton).toBeInTheDocument();
      fireEvent.click(cancelButton);
    });

    expect(mockFileService.cancelTransfer).toHaveBeenCalled();
  });

  it('removes files from upload list', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });

    const deleteButton = screen.getByLabelText(/delete/i);
    fireEvent.click(deleteButton);

    expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
  });

  it('clears completed uploads', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Clear Completed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Clear Completed'));

    // Should clear completed uploads
    expect(screen.getByText('Clear Completed')).toBeInTheDocument();
  });

  it('handles upload errors', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    mockFileService.uploadFile.mockRejectedValue(new Error('Upload failed'));

    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Start Upload')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start Upload'));

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });

  it('calls onUploadComplete when dialog closes', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close'));

    expect(mockProps.onUploadComplete).toHaveBeenCalled();
  });

  it('formats file sizes correctly', async () => {
    render(<DragDropUpload {...mockProps} />);

    const dropZone = screen.getByText('Drop files here or click to browse').closest('div');
    const mockFile = createMockFile('test.txt', 1024);

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [mockFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('1 KB')).toBeInTheDocument();
    });
  });
});
