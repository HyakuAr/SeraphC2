/**
 * PowerShell Favorites component
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  CardActions,
  Grid,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as ExecuteIcon,
  Favorite as FavoriteIcon,
  TrendingUp as TrendingUpIcon,
  Category as CategoryIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { PowerShellService, PowerShellFavorite } from '../../services/powerShellService';

interface PowerShellFavoritesProps {
  favorites: PowerShellFavorite[];
  onFavoriteUse: (favorite: PowerShellFavorite) => void;
  onFavoritesChange: () => void;
}

interface FavoriteFormData {
  name: string;
  command: string;
  description: string;
  category: string;
}

const PowerShellFavorites: React.FC<PowerShellFavoritesProps> = ({
  favorites,
  onFavoriteUse,
  onFavoritesChange,
}) => {
  const [showEditor, setShowEditor] = useState(false);
  const [editingFavorite, setEditingFavorite] = useState<PowerShellFavorite | null>(null);
  const [formData, setFormData] = useState<FavoriteFormData>({
    name: '',
    command: '',
    description: '',
    category: 'Custom',
  });
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMostUsed, setShowMostUsed] = useState(false);

  const handleCreateFavorite = () => {
    setEditingFavorite(null);
    setFormData({
      name: '',
      command: '',
      description: '',
      category: 'Custom',
    });
    setError(null);
    setShowEditor(true);
  };

  const handleEditFavorite = (favorite: PowerShellFavorite) => {
    setEditingFavorite(favorite);
    setFormData({
      name: favorite.name,
      command: favorite.command,
      description: favorite.description || '',
      category: favorite.category || 'Custom',
    });
    setError(null);
    setShowEditor(true);
  };

  const handleSaveFavorite = async () => {
    setError(null);

    if (!formData.name.trim()) {
      setError('Favorite name is required');
      return;
    }

    if (!formData.command.trim()) {
      setError('Command is required');
      return;
    }

    try {
      if (editingFavorite) {
        await PowerShellService.updateFavorite(editingFavorite.id, {
          name: formData.name.trim(),
          command: formData.command.trim(),
          description: formData.description.trim() || undefined,
          category: formData.category,
        });
      } else {
        await PowerShellService.createFavorite({
          name: formData.name.trim(),
          command: formData.command.trim(),
          description: formData.description.trim() || undefined,
          category: formData.category,
        });
      }

      setShowEditor(false);
      onFavoritesChange();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save favorite');
    }
  };

  const handleDeleteFavorite = async (favorite: PowerShellFavorite) => {
    if (!window.confirm(`Are you sure you want to delete "${favorite.name}"?`)) {
      return;
    }

    try {
      await PowerShellService.deleteFavorite(favorite.id);
      onFavoritesChange();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete favorite');
    }
  };

  const getCategories = () => {
    const categories = new Set(favorites.map(f => f.category).filter(Boolean));
    return ['All', ...Array.from(categories).sort()];
  };

  const getFilteredFavorites = () => {
    let filtered = favorites;

    // Filter by category
    if (filterCategory !== 'All') {
      filtered = filtered.filter(f => f.category === filterCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        f =>
          f.name.toLowerCase().includes(query) ||
          f.command.toLowerCase().includes(query) ||
          f.description?.toLowerCase().includes(query)
      );
    }

    // Sort by usage if showing most used
    if (showMostUsed) {
      filtered = [...filtered].sort((a, b) => b.usageCount - a.usageCount);
    }

    return filtered;
  };

  const getCommonCommands = () => {
    return PowerShellService.getCommonCommands();
  };

  const addCommonCommand = (category: string, command: string) => {
    setFormData({
      name: command.split(' ')[0] || 'Command',
      command,
      description: `${category} command`,
      category,
    });
    setShowEditor(true);
  };

  return (
    <Box>
      {/* Header and Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">PowerShell Favorites</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateFavorite}>
          New Favorite
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          sx={{ minWidth: 200 }}
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={filterCategory}
            label="Category"
            onChange={e => setFilterCategory(e.target.value)}
          >
            {getCategories().map(category => (
              <MenuItem key={category} value={category}>
                {category}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant={showMostUsed ? 'contained' : 'outlined'}
          startIcon={<TrendingUpIcon />}
          onClick={() => setShowMostUsed(!showMostUsed)}
        >
          Most Used
        </Button>
      </Box>

      {/* Favorites List */}
      <Grid container spacing={2}>
        {getFilteredFavorites().map(favorite => (
          <Grid item xs={12} md={6} lg={4} key={favorite.id}>
            <Card>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    mb: 1,
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    {favorite.name}
                  </Typography>
                  <Chip
                    label={`${favorite.usageCount} uses`}
                    size="small"
                    color={favorite.usageCount > 5 ? 'primary' : 'default'}
                  />
                </Box>

                {favorite.description && (
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {favorite.description}
                  </Typography>
                )}

                <Box
                  sx={{
                    backgroundColor: 'grey.100',
                    p: 1,
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    mb: 1,
                    maxHeight: 100,
                    overflow: 'auto',
                  }}
                >
                  {favorite.command}
                </Box>

                <Box
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  {favorite.category && (
                    <Chip label={favorite.category} size="small" variant="outlined" />
                  )}
                  {favorite.lastUsed && (
                    <Typography variant="caption" color="text.secondary">
                      Last used: {new Date(favorite.lastUsed).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>
              </CardContent>

              <CardActions>
                <Button
                  size="small"
                  startIcon={<ExecuteIcon />}
                  onClick={() => onFavoriteUse(favorite)}
                >
                  Use
                </Button>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => handleEditFavorite(favorite)}
                >
                  Edit
                </Button>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteFavorite(favorite)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {getFilteredFavorites().length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <FavoriteIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {favorites.length === 0 ? 'No Favorites Yet' : 'No Matching Favorites'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {favorites.length === 0
              ? 'Save frequently used PowerShell commands as favorites'
              : 'Try adjusting your search or filter criteria'}
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateFavorite}>
            Create Favorite
          </Button>
        </Box>
      )}

      {/* Common Commands Section */}
      {favorites.length === 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Common PowerShell Commands
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Click on any command to add it as a favorite
          </Typography>

          {Object.entries(getCommonCommands()).map(([category, commands]) => (
            <Box key={category} sx={{ mb: 3 }}>
              <Typography
                variant="subtitle1"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <CategoryIcon fontSize="small" />
                {category}
              </Typography>
              <Grid container spacing={1}>
                {commands.map((command, index) => (
                  <Grid item xs={12} sm={6} md={4} key={index}>
                    <Card
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: 'action.hover' },
                      }}
                      onClick={() => addCommonCommand(category, command)}
                    >
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {command}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </Box>
      )}

      {/* Favorite Editor Dialog */}
      <Dialog open={showEditor} onClose={() => setShowEditor(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingFavorite ? 'Edit Favorite' : 'Create New Favorite'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Favorite Name"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />

            <TextField
              fullWidth
              label="PowerShell Command"
              value={formData.command}
              onChange={e => setFormData(prev => ({ ...prev, command: e.target.value }))}
              multiline
              rows={4}
              required
              InputProps={{
                style: { fontFamily: 'monospace' },
              }}
            />

            <TextField
              fullWidth
              label="Description"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              multiline
              rows={2}
            />

            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category}
                label="Category"
                onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
              >
                {PowerShellService.getCommandCategories().map(category => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {error && <Alert severity="error">{error}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEditor(false)}>Cancel</Button>
          <Button onClick={handleSaveFavorite} variant="contained">
            {editingFavorite ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PowerShellFavorites;
