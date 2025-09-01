/**
 * PowerShell Modules component
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Chip,
  Alert,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Extension as ModuleIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { PowerShellService, PowerShellModule } from '../../services/powerShellService';
import { EnhancedImplant } from '../../services/websocketService';

interface PowerShellModulesProps {
  implant: EnhancedImplant;
}

const PowerShellModules: React.FC<PowerShellModulesProps> = ({ implant }) => {
  const [modules, setModules] = useState<PowerShellModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [loadModuleName, setLoadModuleName] = useState('');
  const [loadModuleContent, setLoadModuleContent] = useState('');
  const [loadFromFile, setLoadFromFile] = useState(false);

  useEffect(() => {
    if (implant.isConnected) {
      loadModules();
    }
  }, [implant.isConnected]);

  const loadModules = async () => {
    if (!implant.isConnected) {
      setError('Implant is not connected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await PowerShellService.listPowerShellModules(implant.id);

      // Parse the result if it's a command result
      let moduleList: PowerShellModule[] = [];
      if (result.result && result.result.output) {
        try {
          const parsed = JSON.parse(result.result.output);
          moduleList = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // If parsing fails, try to extract module info from text output
          moduleList = parseModulesFromText(result.result.output);
        }
      }

      setModules(moduleList.filter(Boolean));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load modules');
      setModules([]);
    } finally {
      setLoading(false);
    }
  };

  const parseModulesFromText = (output: string): PowerShellModule[] => {
    // Simple text parsing for module information
    const modules: PowerShellModule[] = [];
    const lines = output.split('\n');

    let currentModule: Partial<PowerShellModule> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes('Name') && trimmed.includes(':')) {
        if (currentModule.name) {
          modules.push(currentModule as PowerShellModule);
        }
        currentModule = { name: trimmed.split(':')[1]?.trim() || '' };
      } else if (trimmed.includes('Version') && trimmed.includes(':')) {
        currentModule.version = trimmed.split(':')[1]?.trim() || '';
      } else if (trimmed.includes('ModuleType') && trimmed.includes(':')) {
        currentModule.moduleType = trimmed.split(':')[1]?.trim() || '';
      } else if (trimmed.includes('Description') && trimmed.includes(':')) {
        currentModule.description = trimmed.split(':')[1]?.trim() || '';
      }
    }

    if (currentModule.name) {
      modules.push(currentModule as PowerShellModule);
    }

    return modules;
  };

  const handleLoadModule = async () => {
    if (!loadModuleName.trim()) {
      setError('Module name is required');
      return;
    }

    setError(null);

    try {
      await PowerShellService.loadPowerShellModule({
        implantId: implant.id,
        moduleName: loadModuleName.trim(),
        moduleContent: loadModuleContent.trim() || undefined,
        timeout: 30000,
      });

      setShowLoadDialog(false);
      setLoadModuleName('');
      setLoadModuleContent('');
      setLoadFromFile(false);

      // Refresh modules list
      setTimeout(() => {
        loadModules();
      }, 1000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load module');
    }
  };

  const getCommonModules = () => {
    return [
      {
        name: 'ActiveDirectory',
        description: 'Active Directory PowerShell module for domain operations',
        category: 'Microsoft',
      },
      {
        name: 'AzureAD',
        description: 'Azure Active Directory PowerShell module',
        category: 'Microsoft',
      },
      {
        name: 'Exchange',
        description: 'Exchange Server management module',
        category: 'Microsoft',
      },
      {
        name: 'ImportExcel',
        description: 'PowerShell module for Excel operations',
        category: 'Community',
      },
      {
        name: 'Pester',
        description: 'PowerShell testing framework',
        category: 'Testing',
      },
      {
        name: 'PSReadLine',
        description: 'Enhanced command line editing for PowerShell',
        category: 'Utility',
      },
    ];
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target?.result as string;
        setLoadModuleContent(content);
        setLoadModuleName(file.name.replace(/\.(ps1|psm1)$/i, ''));
      };
      reader.readAsText(file);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">PowerShell Modules</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadModules}
            disabled={loading || !implant.isConnected}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowLoadDialog(true)}
            disabled={!implant.isConnected}
          >
            Load Module
          </Button>
        </Box>
      </Box>

      {/* Connection Warning */}
      {!implant.isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Implant is not connected. Module operations are not available.
        </Alert>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Modules List */}
      {!loading && modules.length > 0 && (
        <Grid container spacing={2}>
          {modules.map((module, index) => (
            <Grid item xs={12} md={6} lg={4} key={`${module.name}-${index}`}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {module.name}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <Chip label={module.version || 'Unknown'} size="small" />
                    <Chip label={module.moduleType || 'Module'} size="small" variant="outlined" />
                  </Box>

                  {module.description && (
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {module.description}
                    </Typography>
                  )}

                  {module.author && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Author: {module.author}
                    </Typography>
                  )}

                  {module.path && (
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {module.path}
                    </Typography>
                  )}
                </CardContent>

                {(module.exportedCommands || module.exportedFunctions) && (
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="body2">
                        Exported Commands (
                        {(module.exportedCommands?.length || 0) +
                          (module.exportedFunctions?.length || 0)}
                        )
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {module.exportedCommands && module.exportedCommands.length > 0 && (
                        <Box sx={{ mb: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Commands:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            {module.exportedCommands.map(cmd => (
                              <Chip key={cmd} label={cmd} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      )}

                      {module.exportedFunctions && module.exportedFunctions.length > 0 && (
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Functions:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            {module.exportedFunctions.map(func => (
                              <Chip key={func} label={func} size="small" variant="outlined" />
                            ))}
                          </Box>
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* No Modules */}
      {!loading && modules.length === 0 && implant.isConnected && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <ModuleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Modules Loaded
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Load PowerShell modules to extend functionality
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowLoadDialog(true)}
          >
            Load Module
          </Button>
        </Box>
      )}

      {/* Common Modules Section */}
      {!loading && modules.length === 0 && implant.isConnected && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Common PowerShell Modules
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Click on any module to load it
          </Typography>

          <Grid container spacing={2}>
            {getCommonModules().map((module, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'action.hover' },
                  }}
                  onClick={() => {
                    setLoadModuleName(module.name);
                    setLoadModuleContent('');
                    setLoadFromFile(false);
                    setShowLoadDialog(true);
                  }}
                >
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      {module.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {module.description}
                    </Typography>
                    <Chip label={module.category} size="small" />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Load Module Dialog */}
      <Dialog
        open={showLoadDialog}
        onClose={() => setShowLoadDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Load PowerShell Module</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Module Name"
              value={loadModuleName}
              onChange={e => setLoadModuleName(e.target.value)}
              required
              helperText="Enter the name of the module to load (e.g., ActiveDirectory, AzureAD)"
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant={!loadFromFile ? 'contained' : 'outlined'}
                onClick={() => setLoadFromFile(false)}
              >
                Load by Name
              </Button>
              <Button
                variant={loadFromFile ? 'contained' : 'outlined'}
                onClick={() => setLoadFromFile(true)}
              >
                Load from File
              </Button>
            </Box>

            {loadFromFile && (
              <>
                <Box>
                  <input
                    accept=".ps1,.psm1"
                    style={{ display: 'none' }}
                    id="module-file-upload"
                    type="file"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="module-file-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      startIcon={<UploadIcon />}
                      fullWidth
                    >
                      Upload Module File (.ps1, .psm1)
                    </Button>
                  </label>
                </Box>

                <TextField
                  fullWidth
                  label="Module Content"
                  value={loadModuleContent}
                  onChange={e => setLoadModuleContent(e.target.value)}
                  multiline
                  rows={8}
                  InputProps={{
                    style: { fontFamily: 'monospace' },
                  }}
                  placeholder="# PowerShell module content will appear here after file upload
# Or you can paste module content directly"
                />
              </>
            )}

            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLoadDialog(false)}>Cancel</Button>
          <Button onClick={handleLoadModule} variant="contained">
            Load Module
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PowerShellModules;
