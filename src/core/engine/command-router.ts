/**
 * CommandRouter - Routes commands to implants and manages command execution
 * Implements requirements 1.2 and 8.1 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { CommandRepository } from '../repositories/interfaces';
import { PostgresCommandRepository } from '../repositories/command.repository';
import { ImplantManager } from './implant-manager';
import { createErrorWithContext } from '../../types/errors';
import {
  Command,
  CommandType,
  CommandStatus,
  CreateCommandData,
  UpdateCommandData,
  CommandResult,
} from '../../types/entities';
import { Logger } from '../../utils/logger';

export interface CommandExecutionContext {
  command: Command;
  implantId: string;
  operatorId: string;
  startTime: Date;
  timeout?: number;
}

export interface CommandQueueItem {
  command: Command;
  priority: number;
  retryCount: number;
  maxRetries: number;
}

export class CommandRouter extends EventEmitter {
  private commandRepository: CommandRepository;
  private implantManager: ImplantManager;
  private logger: Logger;
  private executionContexts: Map<string, CommandExecutionContext>;
  private commandQueues: Map<string, CommandQueueItem[]>; // Per-implant command queues
  private defaultTimeout: number;
  private maxRetries: number;

  constructor(
    implantManager: ImplantManager,
    commandRepository?: CommandRepository,
    defaultTimeout: number = 30000, // 30 seconds
    maxRetries: number = 3
  ) {
    super();
    this.implantManager = implantManager;
    this.commandRepository = commandRepository || new PostgresCommandRepository();
    this.logger = Logger.getInstance();
    this.executionContexts = new Map();
    this.commandQueues = new Map();
    this.defaultTimeout = defaultTimeout;
    this.maxRetries = maxRetries;

    this.setupEventHandlers();
  }

  /**
   * Queue a command for execution on an implant
   */
  async queueCommand(
    implantId: string,
    operatorId: string,
    type: CommandType,
    payload: string,
    priority: number = 0
  ): Promise<Command> {
    try {
      // Validate implant exists and is active
      const implant = await this.implantManager.getImplant(implantId);
      if (!implant) {
        throw new Error(`Implant ${implantId} not found`);
      }

      // Create command in database
      const createData: CreateCommandData = {
        implantId,
        operatorId,
        type,
        payload,
      };

      const command = await this.commandRepository.create(createData);

      // Add to implant's command queue
      const queueItem: CommandQueueItem = {
        command,
        priority,
        retryCount: 0,
        maxRetries: this.maxRetries,
      };

      this.addToQueue(implantId, queueItem);

      this.logger.info('Command queued', {
        commandId: command.id,
        implantId,
        operatorId,
        type,
        priority,
      });

      this.emit('commandQueued', {
        command,
        implantId,
        operatorId,
        priority,
      });

      return command;
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Get pending commands for an implant
   */
  async getPendingCommands(implantId: string): Promise<Command[]> {
    try {
      // Get commands from queue (in-memory)
      const queue = this.commandQueues.get(implantId) || [];
      const queuedCommands = queue
        .sort((a, b) => b.priority - a.priority) // Higher priority first
        .map(item => item.command);

      // Also get any pending commands from database that might not be in queue
      const dbPendingCommands = await this.commandRepository.findPendingCommands(implantId);

      // Merge and deduplicate
      const allCommands = [...queuedCommands];
      for (const dbCommand of dbPendingCommands) {
        if (!allCommands.find(cmd => cmd.id === dbCommand.id)) {
          allCommands.push(dbCommand);
        }
      }

      return allCommands;
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Mark command as executing
   */
  async startCommandExecution(commandId: string, timeout?: number): Promise<void> {
    try {
      const command = await this.commandRepository.findById(commandId);
      if (!command) {
        throw new Error(`Command ${commandId} not found`);
      }

      // Store queue item for potential retry before removing from queue
      const queueItem = this.findInQueue(command.implantId, commandId);

      // Update command status to executing
      await this.commandRepository.updateCommandStatus(commandId, CommandStatus.EXECUTING);

      // Create execution context with queue item for retry
      const context: CommandExecutionContext & { queueItem?: CommandQueueItem | undefined } = {
        command,
        implantId: command.implantId,
        operatorId: command.operatorId,
        startTime: new Date(),
        timeout: timeout || this.defaultTimeout,
      };

      if (queueItem) {
        (context as any).queueItem = queueItem;
      }

      this.executionContexts.set(commandId, context);

      // Remove from queue
      this.removeFromQueue(command.implantId, commandId);

      // Set timeout for command execution
      if (context.timeout) {
        setTimeout(() => {
          this.handleCommandTimeout(commandId);
        }, context.timeout);
      }

      this.logger.info('Command execution started', {
        commandId,
        implantId: command.implantId,
        type: command.type,
        timeout: context.timeout,
      });

      this.emit('commandExecutionStarted', {
        command,
        context,
      });
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Complete command execution with result
   */
  async completeCommandExecution(
    commandId: string,
    result: CommandResult,
    status: CommandStatus = CommandStatus.COMPLETED
  ): Promise<void> {
    try {
      const context = this.executionContexts.get(commandId);
      if (!context) {
        throw new Error(`No execution context found for command ${commandId}`);
      }

      const executionTime = Date.now() - context.startTime.getTime();

      // Update command with result
      const updateData: UpdateCommandData = {
        status,
        result,
        executionTime,
      };

      await this.commandRepository.update(commandId, updateData);

      // Clean up execution context
      this.executionContexts.delete(commandId);

      this.logger.info('Command execution completed', {
        commandId,
        implantId: context.implantId,
        status,
        executionTime,
        exitCode: result.exitCode,
      });

      this.emit('commandExecutionCompleted', {
        command: context.command,
        result,
        status,
        executionTime,
      });
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Fail command execution
   */
  async failCommandExecution(commandId: string, errorMessage: string): Promise<void> {
    try {
      const context = this.executionContexts.get(commandId);
      if (!context) {
        throw new Error(`No execution context found for command ${commandId}`);
      }

      const executionTime = Date.now() - context.startTime.getTime();

      const result: CommandResult = {
        stdout: '',
        stderr: errorMessage,
        exitCode: -1,
        executionTime,
      };

      const updateData: UpdateCommandData = {
        status: CommandStatus.FAILED,
        result,
        executionTime,
      };

      await this.commandRepository.update(commandId, updateData);

      // Check if we should retry
      const queueItem = (context as any).queueItem;
      if (queueItem && queueItem.retryCount < queueItem.maxRetries) {
        queueItem.retryCount++;
        queueItem.command.status = CommandStatus.PENDING;

        // Re-queue for retry
        this.addToQueue(context.implantId, queueItem);

        this.logger.warn('Command failed, retrying', {
          commandId,
          retryCount: queueItem.retryCount,
          maxRetries: queueItem.maxRetries,
        });
      } else {
        // Clean up execution context
        this.executionContexts.delete(commandId);

        this.logger.error('Command execution failed', undefined, {
          commandId,
          implantId: context.implantId,
          error: errorMessage,
          executionTime,
        });
      }

      this.emit('commandExecutionFailed', {
        command: context.command,
        error: errorMessage,
        executionTime,
      });
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Get command execution status
   */
  async getCommandStatus(commandId: string): Promise<Command | null> {
    return this.commandRepository.findById(commandId);
  }

  /**
   * Get command history for an implant
   */
  async getCommandHistory(
    implantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Command[]> {
    return this.commandRepository.getCommandHistory(implantId, limit, offset);
  }

  /**
   * Cancel a pending or executing command
   */
  async cancelCommand(commandId: string): Promise<void> {
    try {
      const command = await this.commandRepository.findById(commandId);
      if (!command) {
        throw new Error(`Command ${commandId} not found`);
      }

      if (command.status === CommandStatus.COMPLETED || command.status === CommandStatus.FAILED) {
        throw new Error(`Cannot cancel command with status: ${command.status}`);
      }

      // Remove from queue if pending
      if (command.status === CommandStatus.PENDING) {
        this.removeFromQueue(command.implantId, commandId);
      }

      // Clean up execution context if executing
      if (command.status === CommandStatus.EXECUTING) {
        this.executionContexts.delete(commandId);
      }

      // Update command status
      await this.commandRepository.updateCommandStatus(commandId, CommandStatus.FAILED);

      this.logger.info('Command cancelled', {
        commandId,
        implantId: command.implantId,
        previousStatus: command.status,
      });

      this.emit('commandCancelled', {
        command,
      });
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): { [implantId: string]: number } {
    const stats: { [implantId: string]: number } = {};

    for (const [implantId, queue] of this.commandQueues.entries()) {
      stats[implantId] = queue.length;
    }

    return stats;
  }

  /**
   * Add command to implant's queue
   */
  private addToQueue(implantId: string, queueItem: CommandQueueItem): void {
    if (!this.commandQueues.has(implantId)) {
      this.commandQueues.set(implantId, []);
    }

    const queue = this.commandQueues.get(implantId)!;
    queue.push(queueItem);

    // Sort by priority (higher priority first)
    queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove command from implant's queue
   */
  private removeFromQueue(implantId: string, commandId: string): void {
    const queue = this.commandQueues.get(implantId);
    if (!queue) return;

    const index = queue.findIndex(item => item.command.id === commandId);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }

  /**
   * Find command in implant's queue
   */
  private findInQueue(implantId: string, commandId: string): CommandQueueItem | null {
    const queue = this.commandQueues.get(implantId);
    if (!queue) return null;

    return queue.find(item => item.command.id === commandId) || null;
  }

  /**
   * Handle command timeout
   */
  private async handleCommandTimeout(commandId: string): Promise<void> {
    const context = this.executionContexts.get(commandId);
    if (!context) return;

    try {
      const executionTime = Date.now() - context.startTime.getTime();

      const result: CommandResult = {
        stdout: '',
        stderr: 'Command execution timed out',
        exitCode: -1,
        executionTime,
      };

      const updateData: UpdateCommandData = {
        status: CommandStatus.TIMEOUT,
        result,
        executionTime,
      };

      await this.commandRepository.update(commandId, updateData);

      this.executionContexts.delete(commandId);

      this.logger.warn('Command execution timed out', {
        commandId,
        implantId: context.implantId,
        timeout: context.timeout,
        executionTime,
      });

      this.emit('commandTimeout', {
        command: context.command,
        timeout: context.timeout,
        executionTime,
      });
    } catch (error) {
      this.logger.error(
        'Command router operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Listen for implant disconnections to clean up queues
    this.implantManager.on('implantDisconnected', ({ implantId }) => {
      this.cleanupImplantQueue(implantId);
    });

    this.implantManager.on('implantInactive', ({ implantId }) => {
      this.cleanupImplantQueue(implantId);
    });
  }

  /**
   * Clean up command queue for disconnected implant
   */
  private cleanupImplantQueue(implantId: string): void {
    const queue = this.commandQueues.get(implantId);
    if (!queue) return;

    // Mark all pending commands as failed
    queue.forEach(async queueItem => {
      try {
        await this.commandRepository.updateCommandStatus(
          queueItem.command.id,
          CommandStatus.FAILED
        );
      } catch (error) {
        this.logger.error(
          'Failed to update command status during cleanup',
          error instanceof Error ? error : new Error('Unknown error'),
          {
            commandId: queueItem.command.id,
          }
        );
      }
    });

    // Clear the queue
    this.commandQueues.delete(implantId);

    this.logger.info('Cleaned up command queue for implant', { implantId });
  }

  /**
   * Stop the command router
   */
  stop(): void {
    // Clear all execution contexts
    this.executionContexts.clear();

    // Clear all command queues
    this.commandQueues.clear();

    // Remove all event listeners
    this.removeAllListeners();

    this.logger.info('CommandRouter stopped');
  }
}
