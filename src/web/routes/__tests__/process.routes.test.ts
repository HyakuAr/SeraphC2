/**
 * Process Routes Tests
 * Tests for process and service management API endpoints
 */

import request from 'supertest';
import express from 'express';
import processRoutes from '../process.routes';
import { ProcessService } from '../../../core/services/process.service';

// Mock ProcessService
jest.mock('../../../core/services/process.service');
const MockProcessService = ProcessService as jest.MockedClass<typeof ProcessService>;

// Mock auth middleware
const mockAuthMiddleware = (req: any, _res: any, next: any) => {
  req.user = { id: 'operator-1', username: 'testuser' };
  next();
};

jest.mock('../../middleware/auth.middleware', () => ({
  authMiddleware: mockAuthMiddleware,
}));

describe('Process Routes', () => {
  let app: express.Application;
  let mockProcessService: jest.Mocked<ProcessService>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/implants', processRoutes);

    // Reset mocks
    jest.clearAllMocks();
    mockProcessService = MockProcessService.prototype as jest.Mocked<ProcessService>;
  });

  describe('GET /api/implants/:implantId/processes', () => {
    it('should get process list successfully', async () => {
      const mockProcessList = {
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
            startTime: new Date('2023-01-01T10:00:00Z'),
            owner: 'DOMAIN\\user',
            architecture: 'x64',
            status: 'Running' as const,
          },
        ],
        totalCount: 1,
        timestamp: new Date(),
      };

      mockProcessService.getProcessList = jest.fn().mockResolvedValue(mockProcessList);

      const response = await request(app).get('/api/implants/implant-1/processes').expect(200);

      expect(response.body).toEqual(mockProcessList);
      expect(mockProcessService.getProcessList).toHaveBeenCalledWith(
        'implant-1',
        'operator-1',
        undefined
      );
    });

    it('should get process list with filters', async () => {
      const mockProcessList = {
        processes: [],
        totalCount: 0,
        timestamp: new Date(),
      };

      mockProcessService.getProcessList = jest.fn().mockResolvedValue(mockProcessList);

      await request(app)
        .get('/api/implants/implant-1/processes')
        .query({
          name: 'notepad',
          owner: 'user',
          minCpuUsage: '1.0',
          minMemoryUsage: '1000000',
          status: 'Running',
        })
        .expect(200);

      expect(mockProcessService.getProcessList).toHaveBeenCalledWith('implant-1', 'operator-1', {
        name: 'notepad',
        owner: 'user',
        minCpuUsage: 1.0,
        minMemoryUsage: 1000000,
        status: 'Running',
      });
    });

    it('should handle invalid implant ID', async () => {
      const response = await request(app).get('/api/implants/invalid-id/processes').expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should handle service error', async () => {
      mockProcessService.getProcessList = jest.fn().mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes')
        .expect(500);

      expect(response.body.error).toBe('Failed to get process list');
    });
  });

  describe('POST /api/implants/:implantId/processes/kill', () => {
    it('should kill process by PID successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Process 1234 terminated successfully',
        processId: 1234,
      };

      mockProcessService.killProcess = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/kill')
        .send({ processId: 1234 })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.killProcess).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        1234,
        undefined
      );
    });

    it('should kill process by name successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Process notepad terminated successfully',
        processName: 'notepad',
      };

      mockProcessService.killProcess = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/kill')
        .send({ processName: 'notepad' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.killProcess).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        undefined,
        'notepad'
      );
    });

    it('should return 400 when neither processId nor processName provided', async () => {
      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/kill')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Either processId or processName must be specified');
    });

    it('should handle kill process failure', async () => {
      const mockResult = {
        success: false,
        message: 'Access denied',
        processId: 1234,
      };

      mockProcessService.killProcess = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/kill')
        .send({ processId: 1234 })
        .expect(400);

      expect(response.body).toEqual(mockResult);
    });
  });

  describe('POST /api/implants/:implantId/processes/suspend', () => {
    it('should suspend process successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Process 1234 suspended successfully',
        processId: 1234,
      };

      mockProcessService.suspendProcess = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/suspend')
        .send({ processId: 1234 })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.suspendProcess).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        1234
      );
    });

    it('should validate processId is required', async () => {
      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/suspend')
        .send({})
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/implants/:implantId/processes/resume', () => {
    it('should resume process successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Process 1234 resumed successfully',
        processId: 1234,
      };

      mockProcessService.resumeProcess = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/processes/resume')
        .send({ processId: 1234 })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.resumeProcess).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        1234
      );
    });
  });

  describe('GET /api/implants/:implantId/services', () => {
    it('should get service list successfully', async () => {
      const mockServiceList = {
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
        timestamp: new Date(),
      };

      mockProcessService.getServiceList = jest.fn().mockResolvedValue(mockServiceList);

      const response = await request(app)
        .get('/api/implants/550e8400-e29b-41d4-a716-446655440000/services')
        .expect(200);

      expect(response.body).toEqual(mockServiceList);
      expect(mockProcessService.getServiceList).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        undefined
      );
    });

    it('should get service list with filters', async () => {
      const mockServiceList = {
        services: [],
        totalCount: 0,
        timestamp: new Date(),
      };

      mockProcessService.getServiceList = jest.fn().mockResolvedValue(mockServiceList);

      await request(app)
        .get('/api/implants/550e8400-e29b-41d4-a716-446655440000/services')
        .query({
          name: 'Spooler',
          status: 'Running',
          startType: 'Automatic',
        })
        .expect(200);

      expect(mockProcessService.getServiceList).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        {
          name: 'Spooler',
          status: 'Running',
          startType: 'Automatic',
        }
      );
    });
  });

  describe('POST /api/implants/:implantId/services/start', () => {
    it('should start service successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Service Spooler started successfully',
        serviceName: 'Spooler',
      };

      mockProcessService.startService = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/services/start')
        .send({ serviceName: 'Spooler' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.startService).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        'Spooler'
      );
    });

    it('should validate serviceName is required', async () => {
      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/services/start')
        .send({})
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/implants/:implantId/services/stop', () => {
    it('should stop service successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Service Spooler stopped successfully',
        serviceName: 'Spooler',
      };

      mockProcessService.stopService = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/services/stop')
        .send({ serviceName: 'Spooler' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.stopService).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        'Spooler'
      );
    });
  });

  describe('POST /api/implants/:implantId/services/restart', () => {
    it('should restart service successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Service Spooler restarted successfully',
        serviceName: 'Spooler',
      };

      mockProcessService.restartService = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/implants/550e8400-e29b-41d4-a716-446655440000/services/restart')
        .send({ serviceName: 'Spooler' })
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(mockProcessService.restartService).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1',
        'Spooler'
      );
    });
  });

  describe('GET /api/implants/:implantId/system/resources', () => {
    it('should get system resources successfully', async () => {
      const mockResources = {
        cpu: {
          usage: 25.5,
          cores: 4,
          processes: 150,
          threads: 1200,
        },
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
        timestamp: new Date(),
      };

      mockProcessService.getSystemResources = jest.fn().mockResolvedValue(mockResources);

      const response = await request(app)
        .get('/api/implants/550e8400-e29b-41d4-a716-446655440000/system/resources')
        .expect(200);

      expect(response.body).toEqual(mockResources);
      expect(mockProcessService.getSystemResources).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'operator-1'
      );
    });

    it('should handle service error', async () => {
      mockProcessService.getSystemResources = jest
        .fn()
        .mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/api/implants/550e8400-e29b-41d4-a716-446655440000/system/resources')
        .expect(500);

      expect(response.body.error).toBe('Failed to get system resources');
    });
  });
});
