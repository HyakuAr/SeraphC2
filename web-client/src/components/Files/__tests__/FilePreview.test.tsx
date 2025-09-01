/**
 * FilePreview Component Tests
 * Tests for the file preview dialog component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FilePreview } from '../FilePreview';
import { FileService } from '../../../services/fileService';

// Mock FileService
jest.mock('../../../services/fileService');
const mockFileService = FileService as jest.Mocked<typeof FileService>;

describe('FilePreview', () => {
  const mockTextFile = {
    name: 'test.txt',
    path: 'C:\\test.txt',
    size: 1024,
    isDirectory: false,
    permissions: 'rw-',
    lastModified: '2023-01-01T00:00:00Z',
  };

  const mockImageFile = {
    name: 'image.png',
    path: 'C:\\image.png',
    size: 2048,
    isDirectory: false,
    permissions: 'rw-',
    lastModified: '2023-01-01T00:00:00Z',
  };

  const mockLargeFile = {
    name: 'large.bin',
    path: 'C:\\large.bin',
    size: 20 * 1024 * 1024, // 20MB
    isDirectory: false,
    permissions: 'rw-',
    lastModified: '2023-01-01T00:00:00Z',
  };

  const mockProps = {
    open: true,
    file: mockTextFile,
    implantId: 'test-implant-id',
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileService.downloadFile.mockResolvedValue({
      transferId: 'test-transfer-id',
      remotePath: 'C:\\test.txt',
      status: 'initiated',
    });
  });

  it('renders preview dialog when open', () => {
    render(<FilePreview {...mockProps} />);

    expect(screen.getByText('test.txt')).toBeInTheDocument();
    expect(screen.getByText(/1 KB/)).toBeInTheDocument();
    expect(screen.getByText('C:\\test.txt')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<FilePreview {...mockProps} open={false} />);

    expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
  });

  it('shows preview tabs for text files', async () => {
    render(<FilePreview {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(screen.getByText('Properties')).toBeInTheDocument();
      expect(screen.getByText('Hex View')).toBeInTheDocument();
    });
  });

  it('shows only preview and properties tabs for images', async () => {
    render(<FilePreview {...mockProps} file={mockImageFile} />);

    await waitFor(() => {
      expect(screen.getByText('Preview')).toBeInTheDocument();
      expect(screen.getByText('Properties')).toBeInTheDocument();
      expect(screen.queryByText('Hex View')).not.toBeInTheDocument();
    });
  });

  it('shows error for large files', async () => {
    render(<FilePreview {...mockProps} file={mockLargeFile} />);

    await waitFor(() => {
      expect(screen.getByText(/File cannot be previewed/)).toBeInTheDocument();
    });
  });

  it('handles download button click', async () => {
    render(<FilePreview {...mockProps} />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadButton);

    expect(mockFileService.downloadFile).toHaveBeenCalledWith({
      implantId: 'test-implant-id',
      remotePath: 'C:\\test.txt',
      checksum: true,
    });
  });

  it('handles close button click', () => {
    render(<FilePreview {...mockProps} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('switches between tabs', async () => {
    render(<FilePreview {...mockProps} />);

    await waitFor(() => {
      expect(screen.getByText('Properties')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Properties'));

    expect(screen.getByText('File Properties')).toBeInTheDocument();
    expect(screen.getByText('Name:')).toBeInTheDocument();
    expect(screen.getByText('Size:')).toBeInTheDocument();
  });

  it('shows file properties correctly', async () => {
    render(<FilePreview {...mockProps} />);

    fireEvent.click(screen.getByText('Properties'));

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
      expect(screen.getByText('C:\\test.txt')).toBeInTheDocument();
      expect(screen.getByText('1 KB (1,024 bytes)')).toBeInTheDocument();
      expect(screen.getByText('File')).toBeInTheDocument();
    });
  });

  it('handles image zoom controls', async () => {
    render(<FilePreview {...mockProps} file={mockImageFile} />);

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    // Test zoom in
    const zoomInButton = screen.getByLabelText(/zoom in/i);
    fireEvent.click(zoomInButton);

    expect(screen.getByText('125%')).toBeInTheDocument();

    // Test zoom out
    const zoomOutButton = screen.getByLabelText(/zoom out/i);
    fireEvent.click(zoomOutButton);

    expect(screen.getByText('100%')).toBeInTheDocument();

    // Test reset zoom
    fireEvent.click(screen.getByText('100%'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('handles download errors', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    mockFileService.downloadFile.mockRejectedValue(new Error('Download failed'));

    render(<FilePreview {...mockProps} />);

    const downloadButton = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });

  it('formats dates correctly', () => {
    render(<FilePreview {...mockProps} />);

    fireEvent.click(screen.getByText('Properties'));

    expect(screen.getByText(/1\/1\/2023/)).toBeInTheDocument();
  });

  it('returns null when no file provided', () => {
    const { container } = render(<FilePreview {...mockProps} file={null} />);
    expect(container.firstChild).toBeNull();
  });
});
