/**
 * Command service for executing and managing commands
 */

import { apiClient } from './apiClient';

export interface CommandExecutionRequest {
  implantId: string;
  type: string;
  payload: string;
  timeout?: number;
  priority?: number;
}

export interface ShellCommandRequest {
  implantId: string;
  command: string;
  timeout?: number;
}

export interface PowerShellCommandRequest {
  implantId: string;
  command: string;
  timeout?: number;
}

export interface Command {
  id: string;
  implantId: string;
  operatorId: string;
  type: string;
  payload: string;
  timestamp: string;
  status: string;
  result?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTime: number;
  };
  executionTime?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommandProgress {
  commandId: string;
  status: string;
  progress?: number;
  message?: string;
  timestamp: string;
}

export interface CommandHistoryFilter {
  limit?: number;
  offset?: number;
  type?: string;
  status?: string;
}

export class CommandService {
  /**
   * Execute a generic command
   */
  static async executeCommand(request: CommandExecutionRequest): Promise<Command> {
    const response = await apiClient.post('/api/commands/execute', request);
    return response.data.data;
  }

  /**
   * Execute a shell command
   */
  static async executeShellCommand(request: ShellCommandRequest): Promise<Command> {
    const response = await apiClient.post('/api/commands/shell', request);
    return response.data.data;
  }

  /**
   * Execute a PowerShell command
   */
  static async executePowerShellCommand(request: PowerShellCommandRequest): Promise<Command> {
    const response = await apiClient.post('/api/commands/powershell', request);
    return response.data.data;
  }

  /**
   * Execute a PowerShell script
   */
  static async executePowerShellScript(request: {
    implantId: string;
    scriptContent: string;
    parameters?: { [key: string]: any };
    timeout?: number;
  }): Promise<Command> {
    const response = await apiClient.post('/api/commands/powershell/script', request);
    return response.data.data;
  }

  /**
   * Load a PowerShell module
   */
  static async loadPowerShellModule(request: {
    implantId: string;
    moduleName: string;
    moduleContent?: string;
    timeout?: number;
  }): Promise<Command> {
    const response = await apiClient.post('/api/commands/powershell/module/load', request);
    return response.data.data;
  }

  /**
   * List PowerShell modules
   */
  static async listPowerShellModules(implantId: string, timeout?: number): Promise<Command> {
    const response = await apiClient.get(`/api/commands/powershell/modules/${implantId}`, {
      params: { timeout },
    });
    return response.data.data;
  }

  /**
   * Cancel a command execution
   */
  static async cancelCommand(commandId: string): Promise<void> {
    await apiClient.post(`/api/commands/${commandId}/cancel`);
  }

  /**
   * Get command status and result
   */
  static async getCommandStatus(commandId: string): Promise<Command> {
    const response = await apiClient.get(`/api/commands/${commandId}`);
    return response.data.data;
  }

  /**
   * Get command history for an implant
   */
  static async getCommandHistory(
    implantId: string,
    filter?: CommandHistoryFilter
  ): Promise<Command[]> {
    const params = new URLSearchParams();
    if (filter?.limit) params.append('limit', filter.limit.toString());
    if (filter?.offset) params.append('offset', filter.offset.toString());
    if (filter?.type) params.append('type', filter.type);
    if (filter?.status) params.append('status', filter.status);

    const response = await apiClient.get(`/api/commands/history/${implantId}?${params.toString()}`);
    return response.data.data;
  }

  /**
   * Get pending commands for an implant
   */
  static async getPendingCommands(implantId: string): Promise<Command[]> {
    const response = await apiClient.get(`/api/commands/pending/${implantId}`);
    return response.data.data;
  }

  /**
   * Get active command executions
   */
  static async getActiveCommands(): Promise<CommandProgress[]> {
    const response = await apiClient.get('/api/commands/active');
    return response.data.data;
  }

  /**
   * Get command execution progress
   */
  static async getCommandProgress(commandId: string): Promise<CommandProgress> {
    const response = await apiClient.get(`/api/commands/progress/${commandId}`);
    return response.data.data;
  }
}
