import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MfaSetup from '../MfaSetup';
import { mfaService } from '../../../services/mfaService';

// Mock the MFA service
jest.mock('../../../services/mfaService');
const mockMfaService = mfaService as jest.Mocked<typeof mfaService>;

describe('MfaSetup', () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders initial setup step', () => {
    render(<MfaSetup onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    expect(screen.getByText('Setup Multi-Factor Authentication')).toBeInTheDocument();
    expect(screen.getByText('Generate QR Code')).toBeInTheDocument();
  });

  it('progresses through setup steps successfully', async () => {
    const mockSetupResponse = {
      success: true,
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,test',
        backupCodes: ['ABCD1234', 'EFGH5678'],
      },
    };

    mockMfaService.setupMfa.mockResolvedValue(mockSetupResponse);
    mockMfaService.verifyMfaToken.mockResolvedValue({ success: true });

    render(<MfaSetup onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Step 1: Generate QR Code
    fireEvent.click(screen.getByText('Generate QR Code'));

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeInTheDocument();
    });

    // Step 2: Verify token
    const tokenInput = screen.getByPlaceholderText('Enter 6-digit code from your app');
    fireEvent.change(tokenInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify & Continue'));

    await waitFor(() => {
      expect(screen.getByText('Save Your Backup Codes')).toBeInTheDocument();
    });

    // Step 3: Complete setup
    fireEvent.click(screen.getByText('Complete Setup'));

    expect(mockOnComplete).toHaveBeenCalled();
  });

  it('handles setup errors gracefully', async () => {
    mockMfaService.setupMfa.mockResolvedValue({
      success: false,
      error: 'Setup failed',
    });

    render(<MfaSetup onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText('Generate QR Code'));

    await waitFor(() => {
      expect(screen.getByText('Setup failed')).toBeInTheDocument();
    });
  });

  it('handles verification errors', async () => {
    const mockSetupResponse = {
      success: true,
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,test',
        backupCodes: ['ABCD1234', 'EFGH5678'],
      },
    };

    mockMfaService.setupMfa.mockResolvedValue(mockSetupResponse);
    mockMfaService.verifyMfaToken.mockResolvedValue({
      success: false,
      error: 'Invalid token',
    });

    render(<MfaSetup onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Generate QR code
    fireEvent.click(screen.getByText('Generate QR Code'));

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeInTheDocument();
    });

    // Try to verify with invalid token
    const tokenInput = screen.getByPlaceholderText('Enter 6-digit code from your app');
    fireEvent.change(tokenInput, { target: { value: '000000' } });
    fireEvent.click(screen.getByText('Verify & Continue'));

    await waitFor(() => {
      expect(screen.getByText('Invalid token')).toBeInTheDocument();
    });
  });

  it('validates token input format', () => {
    const mockSetupResponse = {
      success: true,
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,test',
        backupCodes: ['ABCD1234', 'EFGH5678'],
      },
    };

    mockMfaService.setupMfa.mockResolvedValue(mockSetupResponse);

    render(<MfaSetup onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Generate QR code first
    fireEvent.click(screen.getByText('Generate QR Code'));

    waitFor(() => {
      const tokenInput = screen.getByPlaceholderText('Enter 6-digit code from your app');

      // Test that only digits are allowed and limited to 6 characters
      fireEvent.change(tokenInput, { target: { value: 'abc123def456' } });
      expect(tokenInput).toHaveValue('123456');
    });
  });

  it('allows navigation back to previous step', async () => {
    const mockSetupResponse = {
      success: true,
      data: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,test',
        backupCodes: ['ABCD1234', 'EFGH5678'],
      },
    };

    mockMfaService.setupMfa.mockResolvedValue(mockSetupResponse);

    render(<MfaSetup onComplete={mockOnComplete} onCancel={mockOnCancel} />);

    // Generate QR code
    fireEvent.click(screen.getByText('Generate QR Code'));

    await waitFor(() => {
      expect(screen.getByText('Scan QR Code')).toBeInTheDocument();
    });

    // Go back
    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByText('Setup Multi-Factor Authentication')).toBeInTheDocument();
  });
});
