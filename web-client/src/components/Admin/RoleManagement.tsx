/**
 * Role Management Component
 * Provides interface for managing operator roles and permissions
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Edit as EditIcon,
  Security as SecurityIcon,
  ExpandMore as ExpandMoreIcon,
  Person as PersonIcon,
  AdminPanelSettings as AdminIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { rbacService } from '../../services/rbacService';

interface Operator {
  id: string;
  username: string;
  email: string;
  role: string;
  lastLogin?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RoleDefinition {
  role: string;
  name: string;
  description: string;
  permissions: Permission[];
}

interface Permission {
  resource: string;
  actions: string[];
}

const RoleManagement: React.FC = () => {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [newRole, setNewRole] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [operatorsResponse, rolesResponse] = await Promise.all([
        rbacService.getOperators(),
        rbacService.getRoles(),
      ]);

      if (operatorsResponse.success && operatorsResponse.data) {
        setOperators(operatorsResponse.data);
      } else {
        throw new Error(operatorsResponse.error || 'Failed to fetch operators');
      }

      if (rolesResponse.success && rolesResponse.data) {
        setRoles(rolesResponse.data);
      } else {
        throw new Error(rolesResponse.error || 'Failed to fetch roles');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleEditRole = (operator: Operator) => {
    setSelectedOperator(operator);
    setNewRole(operator.role);
    setEditDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!selectedOperator || !newRole) return;

    try {
      const response = await rbacService.updateOperatorRole(selectedOperator.id, newRole);

      if (response.success) {
        await loadData(); // Reload data
        setEditDialogOpen(false);
        setSelectedOperator(null);
        setNewRole('');
      } else {
        setError(response.error || 'Failed to update role');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'administrator':
        return <AdminIcon color="error" />;
      case 'operator':
        return <SecurityIcon color="warning" />;
      case 'read_only':
        return <ViewIcon color="info" />;
      default:
        return <PersonIcon />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'administrator':
        return 'error';
      case 'operator':
        return 'warning';
      case 'read_only':
        return 'info';
      default:
        return 'default';
    }
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Role Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Operators Table */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Operators
              </Typography>

              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Username</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last Login</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {operators.map(operator => (
                      <TableRow key={operator.id}>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            {getRoleIcon(operator.role)}
                            {operator.username}
                          </Box>
                        </TableCell>
                        <TableCell>{operator.email}</TableCell>
                        <TableCell>
                          <Chip
                            label={operator.role.replace('_', ' ').toUpperCase()}
                            color={getRoleColor(operator.role) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={operator.isActive ? 'Active' : 'Inactive'}
                            color={operator.isActive ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{formatDate(operator.lastLogin)}</TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={() => handleEditRole(operator)}
                          >
                            Edit Role
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Role Definitions */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Role Definitions
              </Typography>

              {roles.map(role => (
                <Accordion key={role.role}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box display="flex" alignItems="center" gap={1}>
                      {getRoleIcon(role.role)}
                      <Typography variant="subtitle1">{role.name}</Typography>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {role.description}
                    </Typography>

                    <Typography variant="subtitle2" gutterBottom>
                      Permissions:
                    </Typography>

                    {role.permissions.map((permission, index) => (
                      <Box key={index} mb={1}>
                        <Typography variant="body2" fontWeight="medium">
                          {permission.resource.replace('_', ' ').toUpperCase()}
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                          {permission.actions.map(action => (
                            <Chip key={action} label={action} size="small" variant="outlined" />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </AccordionDetails>
                </Accordion>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>Edit Operator Role</DialogTitle>
        <DialogContent>
          {selectedOperator && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Operator: <strong>{selectedOperator.username}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Current Role: {selectedOperator.role.replace('_', ' ').toUpperCase()}
              </Typography>

              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>New Role</InputLabel>
                <Select value={newRole} onChange={e => setNewRole(e.target.value)} label="New Role">
                  {roles.map(role => (
                    <MenuItem key={role.role} value={role.role}>
                      <Box display="flex" alignItems="center" gap={1}>
                        {getRoleIcon(role.role)}
                        {role.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveRole} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RoleManagement;
