import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Chip,
  Grid,
  Paper,
  Divider,
} from '@mui/material';
import { QrCode, Security, Backup } from '@mui/icons-material';
import { mfaService } from '../../services/mfaService';

interface MfaSetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

const MfaSetup: React.FC<MfaSetupProps> = ({ onComplete, onCancel }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupData, setSetupData] = useState<{
    secret?: string;
    qrCodeUrl?: string;
    backupCodes?: string[];
  }>({});
  const [verificationToken, setVerificationToken] = useState('');

  const steps = ['Generate Secret', 'Verify Setup', 'Save Backup Codes'];

  const handleSetupMfa = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await mfaService.setupMfa();
      if (response.success && response.data) {
        setSetupData(response.data);
        setActiveStep(1);
      } else {
        setError(response.error || 'Failed to setup MFA');
      }
    } catch (err) {
      setError('Failed to setup MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySetup = async () => {
    if (!verificationToken.trim()) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await mfaService.verifyMfaToken(verificationToken);
      if (response.success) {
        setActiveStep(2);
      } else {
        setError(response.error || 'Invalid verification code');
      }
    } catch (err) {
      setError('Failed to verify MFA token');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onComplete();
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ textAlign: 'center' }}>
            <QrCode sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Setup Multi-Factor Authentication
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Enhance your account security with two-factor authentication using an authenticator
              app.
            </Typography>
            <Button
              variant="contained"
              onClick={handleSetupMfa}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <Security />}
            >
              {loading ? 'Generating...' : 'Generate QR Code'}
            </Button>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom sx={{ textAlign: 'center' }}>
              Scan QR Code
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </Typography>

            {setupData.qrCodeUrl && (
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <img
                  src={setupData.qrCodeUrl}
                  alt="MFA QR Code"
                  style={{ maxWidth: '200px', height: 'auto' }}
                />
              </Box>
            )}

            <Typography variant="body2" sx={{ mb: 2 }}>
              Or enter this secret manually:
            </Typography>
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.100' }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {setupData.secret}
              </Typography>
            </Paper>

            <TextField
              fullWidth
              label="Verification Code"
              placeholder="Enter 6-digit code from your app"
              value={verificationToken}
              onChange={e => setVerificationToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ maxLength: 6 }}
              sx={{ mb: 3 }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={() => setActiveStep(0)} disabled={loading}>
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleVerifySetup}
                disabled={loading || verificationToken.length !== 6}
                sx={{ flex: 1 }}
              >
                {loading ? <CircularProgress size={20} /> : 'Verify & Continue'}
              </Button>
            </Box>
          </Box>
        );

      case 2:
        return (
          <Box>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Backup sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Save Your Backup Codes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Store these backup codes in a safe place. You can use them to access your account if
                you lose your authenticator device.
              </Typography>
            </Box>

            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Important:</strong> Each backup code can only be used once. Store them
                securely and don't share them with anyone.
              </Typography>
            </Alert>

            <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
              <Grid container spacing={1}>
                {setupData.backupCodes?.map((code, index) => (
                  <Grid item xs={6} key={index}>
                    <Chip
                      label={code}
                      variant="outlined"
                      sx={{
                        fontFamily: 'monospace',
                        width: '100%',
                        justifyContent: 'center',
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Paper>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleComplete} sx={{ flex: 1 }}>
                Complete Setup
              </Button>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Card sx={{ maxWidth: 500, mx: 'auto' }}>
      <CardContent sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {renderStepContent()}
      </CardContent>
    </Card>
  );
};

export default MfaSetup;
