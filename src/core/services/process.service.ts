/**
 * ProcessService - Manages process and service operations on implants
 * Implements requirements 12.1, 12.2, 12.3, 12.5 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { CommandManager } from '../engine/command-manager';
import {
  ProcessInfo,
  ServiceInfo,
  SystemResources,
  ProcessManagementRequest,
  ServiceManagementRequest,
  ProcessFilter,
  ServiceFilter,
  CommandType,
  Command,
} from '../../types/entities';
import { Logger } from '../../utils/logger';

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

export class ProcessService extends EventEmitter {
  private commandManager: CommandManager;
  private logger: Logger;

  constructor(commandManager: CommandManager) {
    super();
    this.commandManager = commandManager;
    this.logger = Logger.getInstance();
  }

  /**
   * Get list of processes from an implant
   */
  async getProcessList(
    implantId: string,
    operatorId: string,
    filter?: ProcessFilter
  ): Promise<ProcessListResponse> {
    try {
      this.logger.info('Getting process list', { implantId, operatorId, filter });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.PROCESS_LIST,
        payload: filter ? JSON.stringify(filter) : '',
        timeout: 30000,
      });

      // Wait for command completion
      const result = await this.waitForCommandCompletion(command.id, 35000);

      if (!result || !result.result?.stdout) {
        throw new Error('Failed to get process list from implant');
      }

      const processes = this.parseProcessList(result.result.stdout);
      const filteredProcesses = this.applyProcessFilter(processes, filter);

      const response: ProcessListResponse = {
        processes: filteredProcesses,
        totalCount: filteredProcesses.length,
        timestamp: new Date(),
      };

      this.emit('processListRetrieved', {
        implantId,
        operatorId,
        processCount: response.totalCount,
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to get process list', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Kill a process on an implant
   */
  async killProcess(
    implantId: string,
    operatorId: string,
    processId?: number,
    processName?: string
  ): Promise<ProcessOperationResult> {
    try {
      if (!processId && !processName) {
        throw new Error('Either processId or processName must be specified');
      }

      this.logger.info('Killing process', { implantId, operatorId, processId, processName });

      const payload = JSON.stringify({
        processId,
        processName,
      });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.PROCESS_KILL,
        payload,
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Process terminated successfully'
        : result.result?.stderr || 'Failed to terminate process';

      const operationResult: ProcessOperationResult = {
        success,
        message,
        processId,
        processName,
      };

      this.emit('processKilled', {
        implantId,
        operatorId,
        processId,
        processName,
        success,
      });

      return operationResult;
    } catch (error) {
      this.logger.error('Failed to kill process', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
        processId,
        processName,
      });
      throw error;
    }
  }

  /**
   * Suspend a process on an implant
   */
  async suspendProcess(
    implantId: string,
    operatorId: string,
    processId: number
  ): Promise<ProcessOperationResult> {
    try {
      this.logger.info('Suspending process', { implantId, operatorId, processId });

      const payload = JSON.stringify({ processId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.PROCESS_SUSPEND,
        payload,
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Process suspended successfully'
        : result.result?.stderr || 'Failed to suspend process';

      const operationResult: ProcessOperationResult = {
        success,
        message,
        processId,
      };

      this.emit('processSuspended', {
        implantId,
        operatorId,
        processId,
        success,
      });

      return operationResult;
    } catch (error) {
      this.logger.error('Failed to suspend process', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
        processId,
      });
      throw error;
    }
  }

  /**
   * Resume a process on an implant
   */
  async resumeProcess(
    implantId: string,
    operatorId: string,
    processId: number
  ): Promise<ProcessOperationResult> {
    try {
      this.logger.info('Resuming process', { implantId, operatorId, processId });

      const payload = JSON.stringify({ processId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.PROCESS_RESUME,
        payload,
        timeout: 15000,
      });

      const result = await this.waitForCommandCompletion(command.id, 20000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Process resumed successfully'
        : result.result?.stderr || 'Failed to resume process';

      const operationResult: ProcessOperationResult = {
        success,
        message,
        processId,
      };

      this.emit('processResumed', {
        implantId,
        operatorId,
        processId,
        success,
      });

      return operationResult;
    } catch (error) {
      this.logger.error('Failed to resume process', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
        processId,
      });
      throw error;
    }
  }

  /**
   * Get list of services from an implant
   */
  async getServiceList(
    implantId: string,
    operatorId: string,
    filter?: ServiceFilter
  ): Promise<ServiceListResponse> {
    try {
      this.logger.info('Getting service list', { implantId, operatorId, filter });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SERVICE_LIST,
        payload: filter ? JSON.stringify(filter) : '',
        timeout: 45000,
      });

      const result = await this.waitForCommandCompletion(command.id, 50000);

      if (!result || !result.result?.stdout) {
        throw new Error('Failed to get service list from implant');
      }

      const services = this.parseServiceList(result.result.stdout);
      const filteredServices = this.applyServiceFilter(services, filter);

      const response: ServiceListResponse = {
        services: filteredServices,
        totalCount: filteredServices.length,
        timestamp: new Date(),
      };

      this.emit('serviceListRetrieved', {
        implantId,
        operatorId,
        serviceCount: response.totalCount,
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to get service list', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Start a service on an implant
   */
  async startService(
    implantId: string,
    operatorId: string,
    serviceName: string
  ): Promise<ServiceOperationResult> {
    try {
      this.logger.info('Starting service', { implantId, operatorId, serviceName });

      const payload = JSON.stringify({ serviceName });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SERVICE_START,
        payload,
        timeout: 30000,
      });

      const result = await this.waitForCommandCompletion(command.id, 35000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Service started successfully'
        : result.result?.stderr || 'Failed to start service';

      const operationResult: ServiceOperationResult = {
        success,
        message,
        serviceName,
      };

      this.emit('serviceStarted', {
        implantId,
        operatorId,
        serviceName,
        success,
      });

      return operationResult;
    } catch (error) {
      this.logger.error('Failed to start service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
        serviceName,
      });
      throw error;
    }
  }

  /**
   * Stop a service on an implant
   */
  async stopService(
    implantId: string,
    operatorId: string,
    serviceName: string
  ): Promise<ServiceOperationResult> {
    try {
      this.logger.info('Stopping service', { implantId, operatorId, serviceName });

      const payload = JSON.stringify({ serviceName });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SERVICE_STOP,
        payload,
        timeout: 30000,
      });

      const result = await this.waitForCommandCompletion(command.id, 35000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Service stopped successfully'
        : result.result?.stderr || 'Failed to stop service';

      const operationResult: ServiceOperationResult = {
        success,
        message,
        serviceName,
      };

      this.emit('serviceStopped', {
        implantId,
        operatorId,
        serviceName,
        success,
      });

      return operationResult;
    } catch (error) {
      this.logger.error('Failed to stop service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
        serviceName,
      });
      throw error;
    }
  }

  /**
   * Restart a service on an implant
   */
  async restartService(
    implantId: string,
    operatorId: string,
    serviceName: string
  ): Promise<ServiceOperationResult> {
    try {
      this.logger.info('Restarting service', { implantId, operatorId, serviceName });

      const payload = JSON.stringify({ serviceName });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SERVICE_RESTART,
        payload,
        timeout: 45000,
      });

      const result = await this.waitForCommandCompletion(command.id, 50000);

      if (!result) {
        throw new Error('Command timed out or failed');
      }

      const success = result.result?.exitCode === 0;
      const message = success
        ? result.result?.stdout || 'Service restarted successfully'
        : result.result?.stderr || 'Failed to restart service';

      const operationResult: ServiceOperationResult = {
        success,
        message,
        serviceName,
      };

      this.emit('serviceRestarted', {
        implantId,
        operatorId,
        serviceName,
        success,
      });

      return operationResult;
    } catch (error) {
      this.logger.error('Failed to restart service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
        serviceName,
      });
      throw error;
    }
  }

  /**
   * Get system resource information from an implant
   */
  async getSystemResources(implantId: string, operatorId: string): Promise<SystemResources> {
    try {
      this.logger.info('Getting system resources', { implantId, operatorId });

      const command = await this.commandManager.executeCommand({
        implantId,
        operatorId,
        type: CommandType.SYSTEM_RESOURCES,
        payload: '',
        timeout: 30000,
      });

      const result = await this.waitForCommandCompletion(command.id, 35000);

      if (!result || !result.result?.stdout) {
        throw new Error('Failed to get system resources from implant');
      }

      const resources = this.parseSystemResources(result.result.stdout);

      this.emit('systemResourcesRetrieved', {
        implantId,
        operatorId,
        resources,
      });

      return resources;
    } catch (error) {
      this.logger.error('Failed to get system resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Wait for command completion with timeout
   */
  private async waitForCommandCompletion(
    commandId: string,
    timeout: number
  ): Promise<Command | null> {
    return new Promise(resolve => {
      const startTime = Date.now();

      const checkCommand = async () => {
        try {
          const command = await this.commandManager.getCommandStatus(commandId);

          if (
            command &&
            (command.status === 'completed' ||
              command.status === 'failed' ||
              command.status === 'timeout')
          ) {
            resolve(command);
            return;
          }

          if (Date.now() - startTime > timeout) {
            resolve(null);
            return;
          }

          setTimeout(checkCommand, 1000);
        } catch (error) {
          resolve(null);
        }
      };

      checkCommand();
    });
  }

  /**
   * Parse process list from PowerShell JSON output
   */
  private parseProcessList(output: string): ProcessInfo[] {
    try {
      const data = JSON.parse(output);
      const processes = Array.isArray(data) ? data : [data];

      return processes.map((proc: any) => ({
        pid: proc.Id || 0,
        name: proc.Name || '',
        executablePath: proc.Path || '',
        commandLine: proc.CommandLine || '',
        parentPid: proc.ParentId || 0,
        sessionId: proc.SessionId || 0,
        cpuUsage: proc.CPUUsage || 0,
        memoryUsage: proc.MemoryUsage || 0,
        workingSet: proc.WorkingSet || 0,
        handles: proc.HandleCount || 0,
        threads: proc.Threads || 0,
        startTime: proc.StartTime ? new Date(proc.StartTime) : new Date(),
        owner: proc.Owner || '',
        architecture: proc.Architecture || '',
        status: proc.Status || 'Running',
      }));
    } catch (error) {
      this.logger.error('Failed to parse process list', { error, output });
      return [];
    }
  }

  /**
   * Parse service list from PowerShell JSON output
   */
  private parseServiceList(output: string): ServiceInfo[] {
    try {
      const data = JSON.parse(output);
      const services = Array.isArray(data) ? data : [data];

      return services.map((svc: any) => ({
        name: svc.Name || '',
        displayName: svc.DisplayName || '',
        description: svc.Description || '',
        status: svc.Status || 'Unknown',
        startType: svc.StartType || 'Manual',
        serviceType: svc.ServiceType || 'Win32OwnProcess',
        executablePath: svc.ExecutablePath || '',
        logOnAs: svc.LogOnAs || '',
        dependencies: [],
        dependents: [],
        canStop: svc.CanStop || false,
        canPauseAndContinue: svc.CanPauseAndContinue || false,
      }));
    } catch (error) {
      this.logger.error('Failed to parse service list', { error, output });
      return [];
    }
  }

  /**
   * Parse system resources from PowerShell JSON output
   */
  private parseSystemResources(output: string): SystemResources {
    try {
      const data = JSON.parse(output);

      return {
        cpu: {
          usage: data.cpu?.usage || 0,
          cores: data.cpu?.cores || 1,
          processes: data.cpu?.processes || 0,
          threads: data.cpu?.threads || 0,
        },
        memory: {
          totalPhysical: data.memory?.totalPhysical || 0,
          availablePhysical: data.memory?.availablePhysical || 0,
          usedPhysical: data.memory?.usedPhysical || 0,
          totalVirtual: data.memory?.totalVirtual || 0,
          availableVirtual: data.memory?.availableVirtual || 0,
          usedVirtual: data.memory?.usedVirtual || 0,
          pageFileUsage: data.memory?.pageFileUsage || 0,
        },
        disk: {
          drives: data.disk?.drives || [],
        },
        network: {
          interfaces: data.network?.interfaces || [],
          totalBytesReceived: data.network?.totalBytesReceived || 0,
          totalBytesSent: data.network?.totalBytesSent || 0,
        },
        uptime: data.uptime || 0,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error('Failed to parse system resources', { error, output });
      throw new Error('Invalid system resources data received from implant');
    }
  }

  /**
   * Apply process filter to process list
   */
  private applyProcessFilter(processes: ProcessInfo[], filter?: ProcessFilter): ProcessInfo[] {
    if (!filter) return processes;

    return processes.filter(proc => {
      if (filter.name && !proc.name.toLowerCase().includes(filter.name.toLowerCase())) {
        return false;
      }

      if (filter.owner && !proc.owner?.toLowerCase().includes(filter.owner.toLowerCase())) {
        return false;
      }

      if (filter.minCpuUsage && proc.cpuUsage < filter.minCpuUsage) {
        return false;
      }

      if (filter.minMemoryUsage && proc.memoryUsage < filter.minMemoryUsage) {
        return false;
      }

      if (filter.status && proc.status !== filter.status) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply service filter to service list
   */
  private applyServiceFilter(services: ServiceInfo[], filter?: ServiceFilter): ServiceInfo[] {
    if (!filter) return services;

    return services.filter(svc => {
      if (filter.name && !svc.name.toLowerCase().includes(filter.name.toLowerCase())) {
        return false;
      }

      if (filter.status && svc.status !== filter.status) {
        return false;
      }

      if (filter.startType && svc.startType !== filter.startType) {
        return false;
      }

      return true;
    });
  }
}
