/**
 * Process and Service Management Service
 * Handles API calls for process and service operations
 */

import { apiClient } from './apiClient';

export interface ProcessInfo {
  pid: number;
  name: string;
  executablePath: string;
  commandLine?: string;
  parentPid?: number;
  sessionId: number;
  cpuUsage: number;
  memoryUsage: number;
  workingSet: number;
  handles: number;
  threads: number;
  startTime: Date;
  owner?: string;
  architecture?: string;
  status: 'Running' | 'Suspended' | 'NotResponding';
}

export interface ServiceInfo {
  name: string;
  displayName: string;
  description?: string;
  status:
    | 'Running'
    | 'Stopped'
    | 'Paused'
    | 'StartPending'
    | 'StopPending'
    | 'ContinuePending'
    | 'PausePending';
  startType: 'Automatic' | 'Manual' | 'Disabled' | 'DelayedAutoStart';
  serviceType:
    | 'Win32OwnProcess'
    | 'Win32ShareProcess'
    | 'KernelDriver'
    | 'FileSystemDriver'
    | 'InteractiveProcess';
  executablePath?: string;
  logOnAs?: string;
  dependencies?: string[];
  dependents?: string[];
  canStop: boolean;
  canPauseAndContinue: boolean;
}

export interface SystemResources {
  cpu: {
    usage: number;
    cores: number;
    processes: number;
    threads: number;
  };
  memory: {
    totalPhysical: number;
    availablePhysical: number;
    usedPhysical: number;
    totalVirtual: number;
    availableVirtual: number;
    usedVirtual: number;
    pageFileUsage: number;
  };
  disk: {
    drives: DiskInfo[];
  };
  network: {
    interfaces: NetworkInterfaceInfo[];
    totalBytesReceived: number;
    totalBytesSent: number;
  };
  uptime: number;
  timestamp: Date;
}

export interface DiskInfo {
  drive: string;
  label?: string;
  fileSystem: string;
  totalSize: number;
  freeSpace: number;
  usedSpace: number;
  usagePercentage: number;
}

export interface NetworkInterfaceInfo {
  name: string;
  description: string;
  type: string;
  status: 'Up' | 'Down' | 'Testing' | 'Unknown' | 'Dormant' | 'NotPresent' | 'LowerLayerDown';
  speed: number;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  ipAddresses: string[];
  macAddress?: string;
}

export interface ProcessListResponse {
  processes: ProcessInfo[];
  totalCount: number;
  timestamp: Date;
}

export interface ServiceListResponse {
  services: ServiceInfo[];
  totalCount: number;
  timestamp: Date;
}

export interface ProcessOperationResult {
  success: boolean;
  message: string;
  processId?: number;
  processName?: string;
}

export interface ServiceOperationResult {
  success: boolean;
  message: string;
  serviceName: string;
}

export interface ProcessFilter {
  name?: string;
  owner?: string;
  minCpuUsage?: number;
  minMemoryUsage?: number;
  status?: 'Running' | 'Suspended' | 'NotResponding';
}

export interface ServiceFilter {
  name?: string;
  status?: 'Running' | 'Stopped' | 'Paused';
  startType?: 'Automatic' | 'Manual' | 'Disabled';
}

class ProcessService {
  /**
   * Get list of processes from an implant
   */
  async getProcessList(implantId: string, filter?: ProcessFilter): Promise<ProcessListResponse> {
    const params = new URLSearchParams();

    if (filter?.name) params.append('name', filter.name);
    if (filter?.owner) params.append('owner', filter.owner);
    if (filter?.minCpuUsage !== undefined)
      params.append('minCpuUsage', filter.minCpuUsage.toString());
    if (filter?.minMemoryUsage !== undefined)
      params.append('minMemoryUsage', filter.minMemoryUsage.toString());
    if (filter?.status) params.append('status', filter.status);

    const queryString = params.toString();
    const url = `/api/implants/${implantId}/processes${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<ProcessListResponse>(url);

    // Convert date strings to Date objects
    response.data.processes = response.data.processes.map(process => ({
      ...process,
      startTime: new Date(process.startTime),
    }));
    response.data.timestamp = new Date(response.data.timestamp);

    return response.data;
  }

  /**
   * Kill a process on an implant
   */
  async killProcess(
    implantId: string,
    processId?: number,
    processName?: string
  ): Promise<ProcessOperationResult> {
    const response = await apiClient.post<ProcessOperationResult>(
      `/api/implants/${implantId}/processes/kill`,
      { processId, processName }
    );
    return response.data;
  }

  /**
   * Suspend a process on an implant
   */
  async suspendProcess(implantId: string, processId: number): Promise<ProcessOperationResult> {
    const response = await apiClient.post<ProcessOperationResult>(
      `/api/implants/${implantId}/processes/suspend`,
      { processId }
    );
    return response.data;
  }

  /**
   * Resume a process on an implant
   */
  async resumeProcess(implantId: string, processId: number): Promise<ProcessOperationResult> {
    const response = await apiClient.post<ProcessOperationResult>(
      `/api/implants/${implantId}/processes/resume`,
      { processId }
    );
    return response.data;
  }

  /**
   * Get list of services from an implant
   */
  async getServiceList(implantId: string, filter?: ServiceFilter): Promise<ServiceListResponse> {
    const params = new URLSearchParams();

    if (filter?.name) params.append('name', filter.name);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.startType) params.append('startType', filter.startType);

    const queryString = params.toString();
    const url = `/api/implants/${implantId}/services${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<ServiceListResponse>(url);

    // Convert timestamp to Date object
    response.data.timestamp = new Date(response.data.timestamp);

    return response.data;
  }

  /**
   * Start a service on an implant
   */
  async startService(implantId: string, serviceName: string): Promise<ServiceOperationResult> {
    const response = await apiClient.post<ServiceOperationResult>(
      `/api/implants/${implantId}/services/start`,
      { serviceName }
    );
    return response.data;
  }

  /**
   * Stop a service on an implant
   */
  async stopService(implantId: string, serviceName: string): Promise<ServiceOperationResult> {
    const response = await apiClient.post<ServiceOperationResult>(
      `/api/implants/${implantId}/services/stop`,
      { serviceName }
    );
    return response.data;
  }

  /**
   * Restart a service on an implant
   */
  async restartService(implantId: string, serviceName: string): Promise<ServiceOperationResult> {
    const response = await apiClient.post<ServiceOperationResult>(
      `/api/implants/${implantId}/services/restart`,
      { serviceName }
    );
    return response.data;
  }

  /**
   * Get system resource information from an implant
   */
  async getSystemResources(implantId: string): Promise<SystemResources> {
    const response = await apiClient.get<SystemResources>(
      `/api/implants/${implantId}/system/resources`
    );

    // Convert timestamp to Date object
    response.data.timestamp = new Date(response.data.timestamp);

    return response.data;
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Format CPU usage percentage
   */
  formatCpuUsage(usage: number): string {
    return `${usage.toFixed(1)}%`;
  }

  /**
   * Format uptime in human readable format
   */
  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  /**
   * Get status color for process status
   */
  getProcessStatusColor(status: string): string {
    switch (status) {
      case 'Running':
        return 'success';
      case 'Suspended':
        return 'warning';
      case 'NotResponding':
        return 'error';
      default:
        return 'default';
    }
  }

  /**
   * Get status color for service status
   */
  getServiceStatusColor(status: string): string {
    switch (status) {
      case 'Running':
        return 'success';
      case 'Stopped':
        return 'error';
      case 'Paused':
        return 'warning';
      case 'StartPending':
      case 'StopPending':
      case 'ContinuePending':
      case 'PausePending':
        return 'info';
      default:
        return 'default';
    }
  }
}

export const processService = new ProcessService();
