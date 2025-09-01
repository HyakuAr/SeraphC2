import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
  TextField,
  Chip,
  Grid,
  Paper,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
} from '@mui/material';
import { Security, QrCode, Backup, Settings, Delete } from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { mfaService } from '../../services/mfaService';
import MfaSetup from '../Auth/MfaSetup';

const MfaManagement: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mfaStatus, setMfaStatus] = useState<{
    configured: boolean;
    required: boolean;
    enforcementPolicy: {
      enforceForRole: string[];
      gracePeriodDays: number;
      allowBackupCodes: boolean;
    };
  } | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [policySettings, setPolicySettings] = useState({
    enforceForRole: [] as string[],
    gracePeriodDays: 7,
    allowBackupCodes: true,
  });

  useEffect(() => {
    loadMfaStatus();
  }, []);

  const loadMfaStatus = async () => {
    setLoading(true);
    try {
      const response = await mfaService.getMfaStatus();
      if (response.success && response.data) {
        setMfaStatus(response.data);
        setPolicySettings(response.data.enforcementPolicy);
      } else {
        setError(response.error || 'Failed to load MFA status');
      }
    } catch (err) {
      setError('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    setSuccess('MFA has been successfully configured');
    loadMfaStatus();
  };

  const handleDisableMfa = async () => {
    if (
      !window.confirm(
        'Are you sure you want to disable MFA? This will reduce your account security.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await mfaService.disableMfa();
      if (response.success) {
        setSuccess('MFA has been disabled');
        loadMfaStatus();
      } else {
        setError(response.error || 'Failed to disable MFA');
      }
    } catch (err) {
      setError('Failed to disable MFA');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setLoading(true);
    try {
      const response = await mfaService.regenerateBackupCodes();
      if (response.success && response.data) {
        setBackupCodes(response.data.backupCodes);
        setShowBackupCodes(true);
        setSuccess('New backup codes generated');
      } else {
        setError(response.error || 'Failed to generate backup codes');
      }
    } catch (err) {
      setError('Failed to generate backup codes');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePolicy = async () => {
    if (user?.role !== 'administrator') {
      setError('Only administrators can update MFA policy');
      return;
    }

    setLoading(true);
    try {
      const response = await mfaService.updateEnforcementPolicy(policySettings);
      if (response.success) {
        setSuccess('MFA policy updated successfully');
        loadMfaStatus();
      } else {
        setError(response.error || 'Failed to update MFA policy');
      }
    } catch (err) {
      setError('Failed to update MFA policy');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleToggle = (role: string) => {
    setPolicySettings(prev => ({
      ...prev,
      enforceForRole: prev.enforceForRole.includes(role)
        ? prev.enforceForRole.filter(r => r !== role)
        : [...prev.enforceForRole, role],
    }));
  };

  if (loading && !mfaStatus) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (showSetup) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
        <MfaSetup onComplete={handleSetupComplete} onCancel={() => setShowSetup(false)} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 2 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Security />
        Multi-Factor Authentication
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* MFA Status Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <QrCode />
                Your MFA Status
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Status
                </Typography>
                <Chip
                  label={mfaStatus?.configured ? 'Configured' : 'Not Configured'}
                  color={mfaStatus?.configured ? 'success' : 'warning'}
                  variant="outlined"
                />
              </Box>

              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Required for your role
                </Typography>
                <Chip
                  label={mfaStatus?.required ? 'Required' : 'Optional'}
                  color={mfaStatus?.required ? 'error' : 'default'}
                  variant="outlined"
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {!mfaStatus?.configured ? (
                  <Button
                    variant="contained"
                    onClick={() => setShowSetup(true)}
                    startIcon={<Security />}
                  >
                    Setup MFA
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      onClick={handleRegenerateBackupCodes}
                      startIcon={<Backup />}
                      disabled={loading}
                    >
                      New Backup Codes
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={handleDisableMfa}
                      startIcon={<Delete />}
                      disabled={loading}
                    >
                      Disable MFA
                    </Button>
                  </>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* MFA Policy Card (Admin Only) */}
        {user?.role === 'administrator' && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography
                  variant="h6"
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Settings />
                  Enforcement Policy
                </Typography>

                <Box sx={{ mb: 3 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Enforce MFA for roles
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {['administrator', 'operator', 'read_only'].map(role => (
                      <FormControlLabel
                        key={role}
                        control={
                          <Switch
                            checked={policySettings.enforceForRole.includes(role)}
                            onChange={() => handleRoleToggle(role)}
                          />
                        }
                        label={role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ')}
                      />
                    ))}
                  </Box>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <TextField
                    fullWidth
                    label="Grace Period (days)"
                    type="number"
                    value={policySettings.gracePeriodDays}
                    onChange={e =>
                      setPolicySettings(prev => ({
                        ...prev,
                        gracePeriodDays: parseInt(e.target.value) || 0,
                      }))
                    }
                    helperText="New users have this many days to setup MFA"
                  />
                </Box>

                <Box sx={{ mb: 3 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={policySettings.allowBackupCodes}
                        onChange={e =>
                          setPolicySettings(prev => ({
                            ...prev,
                            allowBackupCodes: e.target.checked,
                          }))
                        }
                      />
                    }
                    label="Allow backup codes"
                  />
                </Box>

                <Button
                  variant="contained"
                  onClick={handleUpdatePolicy}
                  disabled={loading}
                  fullWidth
                >
                  {loading ? <CircularProgress size={20} /> : 'Update Policy'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Backup Codes Dialog */}
      <Dialog
        open={showBackupCodes}
        onClose={() => setShowBackupCodes(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Backup />
          Your New Backup Codes
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>Important:</strong> Save these codes in a secure location. Each code can only
              be used once.
            </Typography>
          </Alert>

          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Grid container spacing={1}>
              {backupCodes.map((code, index) => (
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBackupCodes(false)}>I've Saved These Codes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MfaManagement;
