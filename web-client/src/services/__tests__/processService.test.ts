/**
 * ProcessService Tests
 */

import { processService } from '../processService';
import { apiClient } from '../apiClient';

// Mock apiClient
jest.mock('../apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('ProcessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProcessList', () => {
    it('should get process list without filters', async () => {
      const mockResponse = {
        data: {
          processes: [
            {
              pid: 1234,
              name: 'notepad',
              executablePath: 'C:\\Windows\\System32\\notepad.exe',
              commandLine: 'notepad.exe test.txt',
              parentPid: 5678,
              sessionId: 1,
              cpuUsage: 0.5,
              memoryUsage: 1048576,
              workingSet: 1048576,
              handles: 50,
              threads: 2,
              startTime: '2023-01-01T10:00:00Z',
              owner: 'DOMAIN\\user',
              architecture: 'x64',
              status: 'Running' as const,
            },
          ],
          totalCount: 1,
          timestamp: '2023-01-01T12:00:00Z',
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await processService.getProcessList('implant-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/implants/implant-1/processes');
      expect(result.processes).toHaveLength(1);
      expect(result.processes[0].pid).toBe(1234);
      expect(result.processes[0].startTime).toBeInstanceOf(Date);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should get process list with filters', async () => {
      const mockResponse = {
        data: {
          processes: [],
          totalCount: 0,
          timestamp: '2023-01-01T12:00:00Z',
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const filter = {
        name: 'notepad',
        owner: 'user',
        minCpuUsage: 1.0,
        minMemoryUsage: 1000000,
        status: 'Running' as const,
      };

      await processService.getProcessList('implant-1', filter);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/implants/implant-1/processes?name=notepad&owner=user&minCpuUsage=1&minMemoryUsage=1000000&status=Running'
      );
    });
  });

  describe('killProcess', () => {
    it('should kill process by PID', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Process 1234 terminated successfully',
          processId: 1234,
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.killProcess('implant-1', 1234);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/processes/kill', {
        processId: 1234,
        processName: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.processId).toBe(1234);
    });

    it('should kill process by name', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Process notepad terminated successfully',
          processName: 'notepad',
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.killProcess('implant-1', undefined, 'notepad');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/processes/kill', {
        processId: undefined,
        processName: 'notepad',
      });
      expect(result.success).toBe(true);
      expect(result.processName).toBe('notepad');
    });
  });

  describe('suspendProcess', () => {
    it('should suspend process successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Process 1234 suspended successfully',
          processId: 1234,
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.suspendProcess('implant-1', 1234);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/processes/suspend', {
        processId: 1234,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('resumeProcess', () => {
    it('should resume process successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Process 1234 resumed successfully',
          processId: 1234,
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.resumeProcess('implant-1', 1234);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/processes/resume', {
        processId: 1234,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('getServiceList', () => {
    it('should get service list without filters', async () => {
      const mockResponse = {
        data: {
          services: [
            {
              name: 'Spooler',
              displayName: 'Print Spooler',
              description: 'Manages print jobs',
              status: 'Running' as const,
              startType: 'Automatic' as const,
              serviceType: 'Win32OwnProcess' as const,
              executablePath: 'C:\\Windows\\System32\\spoolsv.exe',
              logOnAs: 'LocalSystem',
              dependencies: [],
              dependents: [],
              canStop: true,
              canPauseAndContinue: false,
            },
          ],
          totalCount: 1,
          timestamp: '2023-01-01T12:00:00Z',
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await processService.getServiceList('implant-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/implants/implant-1/services');
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('Spooler');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should get service list with filters', async () => {
      const mockResponse = {
        data: {
          services: [],
          totalCount: 0,
          timestamp: '2023-01-01T12:00:00Z',
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const filter = {
        name: 'Spooler',
        status: 'Running' as const,
        startType: 'Automatic' as const,
      };

      await processService.getServiceList('implant-1', filter);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/implants/implant-1/services?name=Spooler&status=Running&startType=Automatic'
      );
    });
  });

  describe('startService', () => {
    it('should start service successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Service Spooler started successfully',
          serviceName: 'Spooler',
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.startService('implant-1', 'Spooler');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/services/start', {
        serviceName: 'Spooler',
      });
      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('Spooler');
    });
  });

  describe('stopService', () => {
    it('should stop service successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Service Spooler stopped successfully',
          serviceName: 'Spooler',
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.stopService('implant-1', 'Spooler');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/services/stop', {
        serviceName: 'Spooler',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('restartService', () => {
    it('should restart service successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          message: 'Service Spooler restarted successfully',
          serviceName: 'Spooler',
        },
      };

      mockApiClient.post.mockResolvedValue(mockResponse);

      const result = await processService.restartService('implant-1', 'Spooler');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/implants/implant-1/services/restart', {
        serviceName: 'Spooler',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('getSystemResources', () => {
    it('should get system resources successfully', async () => {
      const mockResponse = {
        data: {
          cpu: { usage: 25.5, cores: 4, processes: 150, threads: 1200 },
          memory: {
            totalPhysical: 8589934592,
            availablePhysical: 4294967296,
            usedPhysical: 4294967296,
            totalVirtual: 17179869184,
            availableVirtual: 12884901888,
            usedVirtual: 4294967296,
            pageFileUsage: 8589934592,
          },
          disk: {
            drives: [
              {
                drive: 'C:',
                label: 'System',
                fileSystem: 'NTFS',
                totalSize: 107374182400,
                freeSpace: 53687091200,
                usedSpace: 53687091200,
                usagePercentage: 50.0,
              },
            ],
          },
          network: {
            interfaces: [
              {
                name: 'Ethernet',
                description: 'Ethernet Adapter',
                type: 'Ethernet',
                status: 'Up' as const,
                speed: 1000000000,
                bytesReceived: 1048576,
                bytesSent: 2097152,
                packetsReceived: 1000,
                packetsSent: 1500,
                ipAddresses: ['192.168.1.100'],
                macAddress: '00:11:22:33:44:55',
              },
            ],
            totalBytesReceived: 1048576,
            totalBytesSent: 2097152,
          },
          uptime: 86400,
          timestamp: '2023-01-01T12:00:00Z',
        },
      };

      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await processService.getSystemResources('implant-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/implants/implant-1/system/resources');
      expect(result.cpu.usage).toBe(25.5);
      expect(result.memory.totalPhysical).toBe(8589934592);
      expect(result.disk.drives).toHaveLength(1);
      expect(result.network.interfaces).toHaveLength(1);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('utility methods', () => {
    it('should format bytes correctly', () => {
      expect(processService.formatBytes(0)).toBe('0 Bytes');
      expect(processService.formatBytes(1024)).toBe('1 KB');
      expect(processService.formatBytes(1048576)).toBe('1 MB');
      expect(processService.formatBytes(1073741824)).toBe('1 GB');
    });

    it('should format CPU usage correctly', () => {
      expect(processService.formatCpuUsage(25.567)).toBe('25.6%');
      expect(processService.formatCpuUsage(0)).toBe('0.0%');
      expect(processService.formatCpuUsage(100)).toBe('100.0%');
    });

    it('should format uptime correctly', () => {
      expect(processService.formatUptime(0)).toBe('0s');
      expect(processService.formatUptime(60)).toBe('1m');
      expect(processService.formatUptime(3600)).toBe('1h');
      expect(processService.formatUptime(86400)).toBe('1d');
      expect(processService.formatUptime(90061)).toBe('1d 1h 1m 1s');
    });

    it('should get correct process status colors', () => {
      expect(processService.getProcessStatusColor('Running')).toBe('success');
      expect(processService.getProcessStatusColor('Suspended')).toBe('warning');
      expect(processService.getProcessStatusColor('NotResponding')).toBe('error');
      expect(processService.getProcessStatusColor('Unknown')).toBe('default');
    });

    it('should get correct service status colors', () => {
      expect(processService.getServiceStatusColor('Running')).toBe('success');
      expect(processService.getServiceStatusColor('Stopped')).toBe('error');
      expect(processService.getServiceStatusColor('Paused')).toBe('warning');
      expect(processService.getServiceStatusColor('StartPending')).toBe('info');
      expect(processService.getServiceStatusColor('Unknown')).toBe('default');
    });
  });
});
