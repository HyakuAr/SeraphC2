/**
 * ProcessManager - Main component for process and service management
 * Implements requirements 12.1, 12.2, 12.3, 12.5 from the SeraphC2 specification
 */

import React, { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography, Alert, CircularProgress, Backdrop } from '@mui/material';
import { ProcessList } from './ProcessList';
import { ServiceList } from './ServiceList';
import { SystemResources } from './SystemResources';
import {
  processService,
  SystemResources as SystemResourcesType,
} from '../../services/processService';

interface ProcessManagerProps {
  implantId: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`process-tabpanel-${index}`}
      aria-labelledby={`process-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `process-tab-${index}`,
    'aria-controls': `process-tabpanel-${index}`,
  };
}

export const ProcessManager: React.FC<ProcessManagerProps> = ({ implantId }) => {
  const [tabValue, setTabValue] = useState(0);
  const [systemResources, setSystemResources] = useState<SystemResourcesType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const loadSystemResources = async () => {
    try {
      setLoading(true);
      setError(null);
      const resources = await processService.getSystemResources(implantId);
      setSystemResources(resources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system resources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tabValue === 2) {
      // System Resources tab
      loadSystemResources();
    }
  }, [tabValue, implantId]);

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Process & Service Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="process management tabs">
          <Tab label="Processes" {...a11yProps(0)} />
          <Tab label="Services" {...a11yProps(1)} />
          <Tab label="System Resources" {...a11yProps(2)} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <ProcessList implantId={implantId} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <ServiceList implantId={implantId} />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <SystemResources
          implantId={implantId}
          systemResources={systemResources}
          onRefresh={loadSystemResources}
          loading={loading}
        />
      </TabPanel>

      <Backdrop sx={{ color: '#fff', zIndex: theme => theme.zIndex.drawer + 1 }} open={loading}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </Box>
  );
};
