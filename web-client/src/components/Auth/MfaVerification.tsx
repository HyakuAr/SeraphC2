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
  Link,
  Divider,
} from '@mui/material';
import { Security, Backup } from '@mui/icons-material';

interface MfaVerificationProps {
  onVerify: (token: string, isBackupCode?: boolean) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

const MfaVerification: React.FC<MfaVerificationProps> = ({
  onVerify,
  onCancel,
  loading = false,
  error = null,
}) => {
  const [token, setToken] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    await onVerify(token, useBackupCode);
  };

  const toggleBackupCode = () => {
    setUseBackupCode(!useBackupCode);
    setToken('');
  };

  return (
    <Card sx={{ maxWidth: 400, mx: 'auto' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          {useBackupCode ? (
            <Backup sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
          ) : (
            <Security sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          )}
          <Typography variant="h6" gutterBottom>
            {useBackupCode ? 'Enter Backup Code' : 'Two-Factor Authentication'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {useBackupCode
              ? 'Enter one of your backup codes to continue'
              : 'Enter the 6-digit code from your authenticator app'}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label={useBackupCode ? 'Backup Code' : 'Authentication Code'}
            placeholder={useBackupCode ? 'Enter backup code' : '000000'}
            value={token}
            onChange={e => {
              if (useBackupCode) {
                setToken(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              } else {
                setToken(e.target.value.replace(/\D/g, '').slice(0, 6));
              }
            }}
            inputProps={{
              maxLength: useBackupCode ? 8 : 6,
              style: { fontFamily: 'monospace', textAlign: 'center', fontSize: '1.2rem' },
            }}
            sx={{ mb: 3 }}
            autoFocus
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading || !token.trim() || (!useBackupCode && token.length !== 6)}
            sx={{ mb: 2, height: 48 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Verify'}
          </Button>

          <Button fullWidth variant="outlined" onClick={onCancel} disabled={loading} sx={{ mb: 2 }}>
            Cancel
          </Button>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ textAlign: 'center' }}>
          <Link
            component="button"
            type="button"
            variant="body2"
            onClick={toggleBackupCode}
            disabled={loading}
            sx={{ cursor: 'pointer' }}
          >
            {useBackupCode ? 'Use authenticator app instead' : 'Use backup code instead'}
          </Link>
        </Box>
      </CardContent>
    </Card>
  );
};

export default MfaVerification;
