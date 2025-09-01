/**
 * File Tree View Component - Interactive tree view for file system navigation
 * Implements requirement 10.1 for tree view directory structure
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  InsertDriveFile as FileIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as RenameIcon,
  FileCopy as CopyIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import { FileService, FileInfo } from '../../services/fileService';

interface FileTreeNode extends FileInfo {
  children?: FileTreeNode[];
  loaded?: boolean;
  loading?: boolean;
}

interface FileTreeViewProps {
  implantId: string;
  onFileSelect?: (file: FileInfo) => void;
  onDirectorySelect?: (path: string) => void;
  onFilePreview?: (file: FileInfo) => void;
  selectedPath?: string;
}

interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  file: FileInfo | null;
}

export const FileTreeView: React.FC<FileTreeViewProps> = ({
  implantId,
  onFileSelect,
  onDirectorySelect,
  onFilePreview,
  selectedPath,
}) => {
  const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
  const [expanded, setExpanded] = useState<string[]>(['C:\\']);
  const [loading, setLoading] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Load root directories
  const loadRootDirectories = useCallback(async () => {
    setLoading(true);
    try {
      const result = await FileService.listFiles({
        implantId,
        path: 'C:\\',
        recursive: false,
      });

      const rootNode: FileTreeNode = {
        name: 'C:\\',
        path: 'C:\\',
        size: 0,
        isDirectory: true,
        permissions: '',
        lastModified: new Date().toISOString(),
        children: result.files
          .filter(f => f.isDirectory)
          .map(f => ({
            ...f,
            loaded: false,
            loading: false,
          })),
        loaded: true,
        loading: false,
      };

      setTreeData([rootNode]);
    } catch (error) {
      console.error('Failed to load root directories:', error);
    } finally {
      setLoading(false);
    }
  }, [implantId]);

  // Load directory children
  const loadDirectoryChildren = useCallback(
    async (node: FileTreeNode): Promise<FileTreeNode[]> => {
      try {
        const result = await FileService.listFiles({
          implantId,
          path: node.path,
          recursive: false,
        });

        return result.files
          .filter(f => f.isDirectory)
          .map(f => ({
            ...f,
            loaded: false,
            loading: false,
          }));
      } catch (error) {
        console.error(`Failed to load children for ${node.path}:`, error);
        return [];
      }
    },
    [implantId]
  );

  // Handle node toggle
  const handleNodeToggle = async (event: React.SyntheticEvent | null, nodeIds: string[]) => {
    setExpanded(nodeIds);

    // Find newly expanded nodes that need loading
    const newlyExpanded = nodeIds.filter(id => !expanded.includes(id));

    for (const nodeId of newlyExpanded) {
      const node = findNodeByPath(treeData, nodeId);
      if (node && node.isDirectory && !node.loaded && !node.loading) {
        // Mark as loading
        updateNodeInTree(nodeId, { loading: true });

        // Load children
        const children = await loadDirectoryChildren(node);

        // Update node with children
        updateNodeInTree(nodeId, {
          children,
          loaded: true,
          loading: false,
        });
      }
    }
  };

  // Find node by path
  const findNodeByPath = (nodes: FileTreeNode[], path: string): FileTreeNode | null => {
    for (const node of nodes) {
      if (node.path === path) {
        return node;
      }
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // Update node in tree
  const updateNodeInTree = (path: string, updates: Partial<FileTreeNode>) => {
    setTreeData(prevData => updateNodeRecursive(prevData, path, updates));
  };

  // Recursive node update helper
  const updateNodeRecursive = (
    nodes: FileTreeNode[],
    path: string,
    updates: Partial<FileTreeNode>
  ): FileTreeNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, ...updates };
      }
      if (node.children) {
        return {
          ...node,
          children: updateNodeRecursive(node.children, path, updates),
        };
      }
      return node;
    });
  };

  // Handle node select
  const handleNodeSelect = (event: React.SyntheticEvent | null, nodeId: string) => {
    const node = findNodeByPath(treeData, nodeId);
    if (node) {
      if (node.isDirectory) {
        onDirectorySelect?.(node.path);
      } else {
        onFileSelect?.(node);
      }
    }
  };

  // Handle context menu
  const handleContextMenu = (event: React.MouseEvent, file: FileInfo) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      file,
    });
  };

  // Close context menu
  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  // Handle context menu actions
  const handleContextMenuAction = async (action: string) => {
    if (!contextMenu?.file) return;

    const file = contextMenu.file;
    handleContextMenuClose();

    switch (action) {
      case 'preview':
        onFilePreview?.(file);
        break;
      case 'download':
        try {
          await FileService.downloadFile({
            implantId,
            remotePath: file.path,
            checksum: true,
          });
        } catch (error) {
          console.error('Download failed:', error);
        }
        break;
      case 'delete':
        try {
          await FileService.deleteFile(implantId, file.path);
          // Refresh parent directory
          loadRootDirectories();
        } catch (error) {
          console.error('Delete failed:', error);
        }
        break;
      // Add more actions as needed
    }
  };

  // Render tree item
  const renderTreeItem = (node: FileTreeNode): React.ReactNode => {
    const hasChildren = node.isDirectory && (node.children?.length || 0) > 0;
    const isSelected = selectedPath === node.path;

    return (
      <TreeItem
        key={node.path}
        itemId={node.path}
        label={
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              py: 0.5,
              backgroundColor: isSelected ? 'action.selected' : 'transparent',
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            }}
            onContextMenu={e => handleContextMenu(e, node)}
          >
            {node.loading ? (
              <CircularProgress size={16} sx={{ mr: 1 }} />
            ) : node.isDirectory ? (
              expanded.includes(node.path) ? (
                <FolderOpenIcon sx={{ mr: 1, color: 'primary.main' }} />
              ) : (
                <FolderIcon sx={{ mr: 1, color: 'primary.main' }} />
              )
            ) : (
              <FileIcon sx={{ mr: 1 }} />
            )}
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              {node.name}
            </Typography>
            {!node.isDirectory && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {formatFileSize(node.size)}
              </Typography>
            )}
          </Box>
        }
      >
        {hasChildren && node.children?.map(child => renderTreeItem(child))}
      </TreeItem>
    );
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Initial load
  useEffect(() => {
    loadRootDirectories();
  }, [loadRootDirectories]);

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Directory Tree
        </Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={loadRootDirectories} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tree View */}
      <SimpleTreeView
        expandedItems={expanded}
        onExpandedItemsChange={(event, itemIds) => handleNodeToggle(event, itemIds)}
        onSelectedItemsChange={(event, itemId) => handleNodeSelect(event, itemId || '')}
        sx={{ flexGrow: 1, overflowY: 'auto' }}
      >
        {treeData.map(node => renderTreeItem(node))}
      </SimpleTreeView>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
      >
        {!contextMenu?.file?.isDirectory && (
          <MenuItem onClick={() => handleContextMenuAction('preview')}>
            <ListItemIcon>
              <PreviewIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Preview</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => handleContextMenuAction('download')}>
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleContextMenuAction('delete')}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
};
