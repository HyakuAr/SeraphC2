import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MfaVerification from '../MfaVerification';

describe('MfaVerification', () => {
  const mockOnVerify = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders MFA token input by default', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    expect(screen.getByText('Use backup code instead')).toBeInTheDocument();
  });

  it('switches to backup code input', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText('Use backup code instead'));

    expect(screen.getByText('Enter Backup Code')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter backup code')).toBeInTheDocument();
    expect(screen.getByText('Use authenticator app instead')).toBeInTheDocument();
  });

  it('validates MFA token format', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    const tokenInput = screen.getByPlaceholderText('000000');

    // Test that only digits are allowed and limited to 6 characters
    fireEvent.change(tokenInput, { target: { value: 'abc123def456' } });
    expect(tokenInput).toHaveValue('123456');
  });

  it('validates backup code format', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    // Switch to backup code mode
    fireEvent.click(screen.getByText('Use backup code instead'));

    const backupInput = screen.getByPlaceholderText('Enter backup code');

    // Test that only alphanumeric characters are allowed and converted to uppercase
    fireEvent.change(backupInput, { target: { value: 'abc123!@#' } });
    expect(backupInput).toHaveValue('ABC123');
  });

  it('calls onVerify with correct parameters for MFA token', async () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    const tokenInput = screen.getByPlaceholderText('000000');
    fireEvent.change(tokenInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByText('Verify'));

    expect(mockOnVerify).toHaveBeenCalledWith('123456', false);
  });

  it('calls onVerify with correct parameters for backup code', async () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    // Switch to backup code mode
    fireEvent.click(screen.getByText('Use backup code instead'));

    const backupInput = screen.getByPlaceholderText('Enter backup code');
    fireEvent.change(backupInput, { target: { value: 'ABCD1234' } });
    fireEvent.click(screen.getByText('Verify'));

    expect(mockOnVerify).toHaveBeenCalledWith('ABCD1234', true);
  });

  it('disables verify button for incomplete MFA token', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    const verifyButton = screen.getByText('Verify');
    expect(verifyButton).toBeDisabled();

    const tokenInput = screen.getByPlaceholderText('000000');
    fireEvent.change(tokenInput, { target: { value: '12345' } }); // Only 5 digits

    expect(verifyButton).toBeDisabled();

    fireEvent.change(tokenInput, { target: { value: '123456' } }); // 6 digits
    expect(verifyButton).not.toBeDisabled();
  });

  it('enables verify button for any backup code input', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    // Switch to backup code mode
    fireEvent.click(screen.getByText('Use backup code instead'));

    const verifyButton = screen.getByText('Verify');
    expect(verifyButton).toBeDisabled();

    const backupInput = screen.getByPlaceholderText('Enter backup code');
    fireEvent.change(backupInput, { target: { value: 'A' } });

    expect(verifyButton).not.toBeDisabled();
  });

  it('displays error message', () => {
    render(
      <MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} error="Invalid token" />
    );

    expect(screen.getByText('Invalid token')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} loading={true} />);

    // Find the submit button (the one with type="submit")
    const buttons = screen.getAllByRole('button');
    const verifyButton = buttons.find(button => button.getAttribute('type') === 'submit');
    expect(verifyButton).toBeDisabled();

    // Check for loading spinner (CircularProgress)
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('prevents form submission with empty input', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    const form = screen.getByRole('textbox').closest('form');
    fireEvent.submit(form!);

    expect(mockOnVerify).not.toHaveBeenCalled();
  });

  it('clears input when switching between modes', () => {
    render(<MfaVerification onVerify={mockOnVerify} onCancel={mockOnCancel} />);

    // Enter MFA token
    const tokenInput = screen.getByPlaceholderText('000000');
    fireEvent.change(tokenInput, { target: { value: '123456' } });
    expect(tokenInput).toHaveValue('123456');

    // Switch to backup code mode
    fireEvent.click(screen.getByText('Use backup code instead'));

    // Input should be cleared
    const backupInput = screen.getByPlaceholderText('Enter backup code');
    expect(backupInput).toHaveValue('');

    // Enter backup code
    fireEvent.change(backupInput, { target: { value: 'ABCD1234' } });
    expect(backupInput).toHaveValue('ABCD1234');

    // Switch back to MFA token mode
    fireEvent.click(screen.getByText('Use authenticator app instead'));

    // Input should be cleared again
    const newTokenInput = screen.getByPlaceholderText('000000');
    expect(newTokenInput).toHaveValue('');
  });
});
