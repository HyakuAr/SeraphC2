/**
 * PowerShell Script Editor component
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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Chip,
  Alert,
  Grid,
  Card,
  CardContent,
  CardActions,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as ExecuteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Code as CodeIcon,
  Description as DescriptionIcon,
  Label as TagIcon,
} from '@mui/icons-material';
import {
  PowerShellService,
  PowerShellScript,
  PowerShellParameter,
} from '../../services/powerShellService';
import { EnhancedImplant } from '../../services/websocketService';

interface PowerShellScriptEditorProps {
  scripts: PowerShellScript[];
  onScriptExecute: (script: PowerShellScript, parameters?: { [key: string]: any }) => void;
  onScriptsChange: () => void;
  implant: EnhancedImplant;
}

interface ScriptFormData {
  name: string;
  description: string;
  content: string;
  tags: string[];
}

const PowerShellScriptEditor: React.FC<PowerShellScriptEditorProps> = ({
  scripts,
  onScriptExecute,
  onScriptsChange,
  implant,
}) => {
  const [showEditor, setShowEditor] = useState(false);
  const [editingScript, setEditingScript] = useState<PowerShellScript | null>(null);
  const [formData, setFormData] = useState<ScriptFormData>({
    name: '',
    description: '',
    content: '',
    tags: [],
  });
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [executingScript, setExecutingScript] = useState<PowerShellScript | null>(null);
  const [scriptParameters, setScriptParameters] = useState<{ [key: string]: any }>({});

  const handleCreateScript = () => {
    setEditingScript(null);
    setFormData({
      name: '',
      description: '',
      content: '',
      tags: [],
    });
    setError(null);
    setValidationErrors([]);
    setShowEditor(true);
  };

  const handleEditScript = (script: PowerShellScript) => {
    setEditingScript(script);
    setFormData({
      name: script.name,
      description: script.description || '',
      content: script.content,
      tags: script.tags || [],
    });
    setError(null);
    setValidationErrors([]);
    setShowEditor(true);
  };

  const handleSaveScript = async () => {
    setError(null);
    setValidationErrors([]);

    // Validate form
    if (!formData.name.trim()) {
      setError('Script name is required');
      return;
    }

    if (!formData.content.trim()) {
      setError('Script content is required');
      return;
    }

    // Validate PowerShell syntax
    const validation = PowerShellService.validateScriptSyntax(formData.content);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    try {
      // Parse parameters from script content
      const parameters = PowerShellService.parseScriptParameters(formData.content);

      if (editingScript) {
        await PowerShellService.updateScript(editingScript.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          content: formData.content,
          parameters,
          tags: formData.tags,
        });
      } else {
        await PowerShellService.createScript({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          content: formData.content,
          parameters,
          tags: formData.tags,
        });
      }

      setShowEditor(false);
      onScriptsChange();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save script');
    }
  };

  const handleDeleteScript = async (script: PowerShellScript) => {
    if (!window.confirm(`Are you sure you want to delete "${script.name}"?`)) {
      return;
    }

    try {
      await PowerShellService.deleteScript(script.id);
      onScriptsChange();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete script');
    }
  };

  const handleExecuteScript = (script: PowerShellScript) => {
    if (!script.parameters || script.parameters.length === 0) {
      onScriptExecute(script);
      return;
    }

    // Script has parameters, show parameter dialog
    setExecutingScript(script);
    setScriptParameters({});
    setShowExecuteDialog(true);
  };

  const handleExecuteWithParameters = () => {
    if (!executingScript) return;

    onScriptExecute(executingScript, scriptParameters);
    setShowExecuteDialog(false);
    setExecutingScript(null);
    setScriptParameters({});
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  const getCommonTags = () => {
    return ['System', 'Network', 'Security', 'Administration', 'Monitoring', 'Utility'];
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">PowerShell Scripts</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateScript}>
          New Script
        </Button>
      </Box>

      {/* Scripts List */}
      <Grid container spacing={2}>
        {scripts.map(script => (
          <Grid item xs={12} md={6} lg={4} key={script.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {script.name}
                </Typography>

                {script.description && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {script.description}
                  </Typography>
                )}

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {script.tags?.map(tag => (
                    <Chip key={tag} label={tag} size="small" />
                  ))}
                </Box>

                {script.parameters && script.parameters.length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Parameters: {script.parameters.length}
                  </Typography>
                )}

                <Typography variant="caption" display="block" color="text.secondary">
                  Created: {new Date(script.createdAt).toLocaleDateString()}
                </Typography>
              </CardContent>

              <CardActions>
                <Button
                  size="small"
                  startIcon={<ExecuteIcon />}
                  onClick={() => handleExecuteScript(script)}
                  disabled={!implant.isConnected}
                >
                  Execute
                </Button>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => handleEditScript(script)}
                >
                  Edit
                </Button>
                <IconButton size="small" onClick={() => handleDeleteScript(script)} color="error">
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {scripts.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CodeIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No PowerShell Scripts
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create your first PowerShell script to get started
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateScript}>
            Create Script
          </Button>
        </Box>
      )}

      {/* Script Editor Dialog */}
      <Dialog open={showEditor} onClose={() => setShowEditor(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingScript ? 'Edit Script' : 'Create New Script'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Script Name"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />

            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              multiline
              rows={2}
            />

            <TextField
              fullWidth
              label="PowerShell Script Content"
              value={formData.content}
              onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
              multiline
              rows={12}
              required
              InputProps={{
                style: { fontFamily: 'monospace' },
              }}
              placeholder="# Enter your PowerShell script here
param(
    [Parameter(Mandatory=$true)]
    [string]$ComputerName
)

Get-ComputerInfo -ComputerName $ComputerName"
            />

            {/* Tags */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Tags
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                {formData.tags.map(tag => (
                  <Chip key={tag} label={tag} onDelete={() => handleRemoveTag(tag)} size="small" />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  label="Add Tag"
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                />
                <Button onClick={handleAddTag} disabled={!newTag.trim()}>
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                {getCommonTags().map(tag => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      if (!formData.tags.includes(tag)) {
                        setFormData(prev => ({
                          ...prev,
                          tags: [...prev.tags, tag],
                        }));
                      }
                    }}
                    disabled={formData.tags.includes(tag)}
                  />
                ))}
              </Box>
            </Box>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Alert severity="error">
                <Typography variant="subtitle2" gutterBottom>
                  Script Validation Errors:
                </Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {/* General Error */}
            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEditor(false)}>Cancel</Button>
          <Button onClick={handleSaveScript} variant="contained">
            {editingScript ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Execute with Parameters Dialog */}
      <Dialog
        open={showExecuteDialog}
        onClose={() => setShowExecuteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Execute Script with Parameters</DialogTitle>
        <DialogContent>
          {executingScript && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="h6" gutterBottom>
                {executingScript.name}
              </Typography>

              {executingScript.description && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {executingScript.description}
                </Typography>
              )}

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                Parameters:
              </Typography>

              {executingScript.parameters?.map(param => (
                <TextField
                  key={param.name}
                  fullWidth
                  label={param.name}
                  value={scriptParameters[param.name] || param.defaultValue || ''}
                  onChange={e =>
                    setScriptParameters(prev => ({
                      ...prev,
                      [param.name]: e.target.value,
                    }))
                  }
                  required={param.mandatory}
                  helperText={param.description || `Type: ${param.type}`}
                  sx={{ mb: 2 }}
                />
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExecuteDialog(false)}>Cancel</Button>
          <Button onClick={handleExecuteWithParameters} variant="contained">
            Execute
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PowerShellScriptEditor;
