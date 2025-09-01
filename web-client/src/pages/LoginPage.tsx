import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '../store/store';
import { loginUser, clearError, clearMfaState } from '../store/slices/authSlice';
import SeraphLogo from '../components/Branding/SeraphLogo';
import MfaVerification from '../components/Auth/MfaVerification';
import { mfaService } from '../services/mfaService';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { isLoading, error, isAuthenticated, requiresMfa, pendingMfaUser } = useSelector(
    (state: RootState) => state.auth
  );

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  React.useEffect(() => {
    // Clear any existing errors when component mounts
    dispatch(clearError());
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      return;
    }

    try {
      await dispatch(loginUser({ username, password })).unwrap();
      if (!requiresMfa) {
        navigate('/dashboard');
      }
    } catch (error) {
      // Error is handled by the slice
    }
  };

  const handleMfaVerification = async (token: string, isBackupCode = false) => {
    setMfaLoading(true);
    setMfaError(null);

    try {
      let response;
      if (isBackupCode) {
        response = await mfaService.verifyBackupCode(token);
      } else {
        response = await mfaService.verifyMfaToken(token);
      }

      if (response.success) {
        // Complete login with MFA token
        await dispatch(loginUser({ username, password, mfaToken: token })).unwrap();
        navigate('/dashboard');
      } else {
        setMfaError(response.error || 'Verification failed');
      }
    } catch (error) {
      setMfaError('Verification failed');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaCancel = () => {
    dispatch(clearMfaState());
    setMfaError(null);
  };

  // Show MFA verification if required
  if (requiresMfa && pendingMfaUser) {
    return (
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 4,
          }}
        >
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <SeraphLogo size="medium" variant="horizontal" />
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
              Welcome back, {pendingMfaUser.username}
            </Typography>
          </Box>

          <MfaVerification
            onVerify={handleMfaVerification}
            onCancel={handleMfaCancel}
            loading={mfaLoading}
            error={mfaError}
          />

          <Typography
            variant="caption"
            sx={{
              mt: 4,
              color: 'text.secondary',
              textAlign: 'center',
            }}
          >
            SeraphC2 Management Console v1.0.0
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Card
          sx={{
            width: '100%',
            maxWidth: 400,
            p: 2,
          }}
        >
          <CardContent>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                mb: 4,
              }}
            >
              <SeraphLogo size="large" variant="vertical" />
              <Typography
                variant="h5"
                sx={{
                  mt: 2,
                  color: 'text.primary',
                  textAlign: 'center',
                }}
              >
                Management Console
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'text.secondary',
                  textAlign: 'center',
                  mt: 1,
                }}
              >
                Sign in to access the command and control interface
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => dispatch(clearError())}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={isLoading}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                  height: 48,
                }}
                disabled={isLoading || !username.trim() || !password.trim()}
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Typography
          variant="caption"
          sx={{
            mt: 4,
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          SeraphC2 Management Console v1.0.0
        </Typography>
      </Box>
    </Container>
  );
};

export default LoginPage;
