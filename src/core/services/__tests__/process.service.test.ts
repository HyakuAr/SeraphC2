/**
 * ProcessService Tests
 * Tests for process and service management functionality
 */

import { ProcessService } from '../process.service';
import { CommandManager } from '../../engine/command-manager';
import { Command, CommandType, CommandStatus } from '../../../types/entities';

// Mock CommandManager
jest.mock('../../engine/command-manager');
const MockCommandManager = CommandManager as jest.MockedClass<typeof CommandManager>;

describe('ProcessService', () => {
  let processService: ProcessService;
  let mockCommandManager: jest.Mocked<CommandManager>;

  beforeEach(() => {
    mockCommandManager = {
      executeCommand: jest.fn(),
      getCommandStatus: jest.fn(),
    } as any;
    processService = new ProcessService(mockCommandManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProcessList', () => {
    it('should get process list successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_LIST,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: JSON.stringify([
            {
              Id: 1234,
              Name: 'notepad',
              Path: 'C:\\Windows\\System32\\notepad.exe',
              CommandLine: 'notepad.exe test.txt',
              ParentId: 5678,
              SessionId: 1,
              CPUUsage: 0.5,
              MemoryUsage: 1048576,
              WorkingSet: 1048576,
              HandleCount: 50,
              Threads: 2,
              StartTime: '2023-01-01T10:00:00Z',
              Owner: 'DOMAIN\\user',
              Architecture: 'x64',
              Status: 'Running',
            },
          ]),
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.getProcessList('implant-1', 'operator-1');

      expect(result.processes).toHaveLength(1);
      expect(result.processes[0]?.pid).toBe(1234);
      expect(result.processes[0]?.name).toBe('notepad');
      expect(result.processes[0]?.status).toBe('Running');
      expect(result.totalCount).toBe(1);
    });

    it('should apply process filters correctly', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_LIST,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: JSON.stringify([
            {
              Id: 1234,
              Name: 'notepad',
              Path: 'C:\\Windows\\System32\\notepad.exe',
              CPUUsage: 5.0,
              MemoryUsage: 2097152,
              Owner: 'DOMAIN\\user',
              Status: 'Running',
            },
            {
              Id: 5678,
              Name: 'calculator',
              Path: 'C:\\Windows\\System32\\calc.exe',
              CPUUsage: 0.1,
              MemoryUsage: 1048576,
              Owner: 'DOMAIN\\admin',
              Status: 'Running',
            },
          ]),
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const filter = {
        name: 'notepad',
        minCpuUsage: 1.0,
      };

      const result = await processService.getProcessList('implant-1', 'operator-1', filter);

      expect(result.processes).toHaveLength(1);
      expect(result.processes[0]?.name).toBe('notepad');
    });

    it('should handle command execution failure', async () => {
      mockCommandManager.executeCommand.mockRejectedValue(new Error('Command failed'));

      await expect(processService.getProcessList('implant-1', 'operator-1')).rejects.toThrow(
        'Command failed'
      );
    });
  });

  describe('killProcess', () => {
    it('should kill process by PID successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_KILL,
        payload: JSON.stringify({ processId: 1234 }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Process 1234 terminated successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.killProcess('implant-1', 'operator-1', 1234);

      expect(result.success).toBe(true);
      expect(result.processId).toBe(1234);
      expect(result.message).toBe('Process 1234 terminated successfully');
    });

    it('should kill process by name successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_KILL,
        payload: JSON.stringify({ processName: 'notepad' }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Process notepad terminated successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.killProcess(
        'implant-1',
        'operator-1',
        undefined,
        'notepad'
      );

      expect(result.success).toBe(true);
      expect(result.processName).toBe('notepad');
      expect(result.message).toBe('Process notepad terminated successfully');
    });

    it('should handle process kill failure', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_KILL,
        payload: JSON.stringify({ processId: 1234 }),
        timestamp: new Date(),
        status: CommandStatus.FAILED,
        result: {
          stdout: '',
          stderr: 'Access denied',
          exitCode: 1,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.killProcess('implant-1', 'operator-1', 1234);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Access denied');
    });

    it('should throw error when neither processId nor processName provided', async () => {
      await expect(processService.killProcess('implant-1', 'operator-1')).rejects.toThrow(
        'Either processId or processName must be specified'
      );
    });
  });

  describe('suspendProcess', () => {
    it('should suspend process successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_SUSPEND,
        payload: JSON.stringify({ processId: 1234 }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Process 1234 suspended successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.suspendProcess('implant-1', 'operator-1', 1234);

      expect(result.success).toBe(true);
      expect(result.processId).toBe(1234);
      expect(result.message).toBe('Process 1234 suspended successfully');
    });
  });

  describe('resumeProcess', () => {
    it('should resume process successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.PROCESS_RESUME,
        payload: JSON.stringify({ processId: 1234 }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Process 1234 resumed successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.resumeProcess('implant-1', 'operator-1', 1234);

      expect(result.success).toBe(true);
      expect(result.processId).toBe(1234);
      expect(result.message).toBe('Process 1234 resumed successfully');
    });
  });

  describe('getServiceList', () => {
    it('should get service list successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SERVICE_LIST,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: JSON.stringify([
            {
              Name: 'Spooler',
              DisplayName: 'Print Spooler',
              Status: 'Running',
              StartType: 'Automatic',
              ServiceType: 'Win32OwnProcess',
              Description: 'Manages print jobs',
              CanStop: true,
              CanPauseAndContinue: false,
            },
          ]),
          stderr: '',
          exitCode: 0,
          executionTime: 2000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.getServiceList('implant-1', 'operator-1');

      expect(result.services).toHaveLength(1);
      expect(result.services[0]?.name).toBe('Spooler');
      expect(result.services[0]?.displayName).toBe('Print Spooler');
      expect(result.services[0]?.status).toBe('Running');
      expect(result.totalCount).toBe(1);
    });
  });

  describe('startService', () => {
    it('should start service successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SERVICE_START,
        payload: JSON.stringify({ serviceName: 'Spooler' }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Service Spooler started successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.startService('implant-1', 'operator-1', 'Spooler');

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('Spooler');
      expect(result.message).toBe('Service Spooler started successfully');
    });
  });

  describe('stopService', () => {
    it('should stop service successfully', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SERVICE_STOP,
        payload: JSON.stringify({ serviceName: 'Spooler' }),
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'Service Spooler stopped successfully',
          stderr: '',
          exitCode: 0,
          executionTime: 1000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.stopService('implant-1', 'operator-1', 'Spooler');

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('Spooler');
      expect(result.message).toBe('Service Spooler stopped successfully');
    });
  });

  describe('getSystemResources', () => {
    it('should get system resources successfully', async () => {
      const mockResourceData = {
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
              bytesReceived: 1048576,
              bytesSent: 2097152,
              packetsReceived: 1000,
              packetsSent: 1500,
            },
          ],
          totalBytesReceived: 1048576,
          totalBytesSent: 2097152,
        },
        uptime: 86400,
        timestamp: new Date(),
      };

      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SYSTEM_RESOURCES,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: JSON.stringify(mockResourceData),
          stderr: '',
          exitCode: 0,
          executionTime: 2000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      const result = await processService.getSystemResources('implant-1', 'operator-1');

      expect(result.cpu.usage).toBe(25.5);
      expect(result.cpu.cores).toBe(4);
      expect(result.memory.totalPhysical).toBe(8589934592);
      expect(result.disk.drives).toHaveLength(1);
      expect(result.disk.drives[0]?.drive).toBe('C:');
      expect(result.network.interfaces).toHaveLength(1);
      expect(result.uptime).toBe(86400);
    });

    it('should handle invalid JSON response', async () => {
      const mockCommand: Command = {
        id: 'cmd-1',
        implantId: 'implant-1',
        operatorId: 'operator-1',
        type: CommandType.SYSTEM_RESOURCES,
        payload: '',
        timestamp: new Date(),
        status: CommandStatus.COMPLETED,
        result: {
          stdout: 'invalid json',
          stderr: '',
          exitCode: 0,
          executionTime: 2000,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCommandManager.executeCommand.mockResolvedValue(mockCommand);
      mockCommandManager.getCommandStatus.mockResolvedValue(mockCommand);

      await expect(processService.getSystemResources('implant-1', 'operator-1')).rejects.toThrow(
        'Invalid system resources data received from implant'
      );
    });
  });
});
