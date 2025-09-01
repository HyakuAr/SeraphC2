/**
 * Protocol manager with failover mechanism for automatic switching
 * Implements requirements 1.3, 1.4, and 7.9 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import {
  IProtocolManager,
  BaseProtocolHandler,
  ProtocolMessage,
  ConnectionInfo,
  ProtocolStats,
  ProtocolFailoverConfig,
} from './interfaces';
import { Protocol } from '../types/entities';
import { Logger } from '../utils/logger';

export interface ProtocolHealth {
  protocol: Protocol;
  isHealthy: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastHealthCheck: Date;
  lastFailure?: Date;
  lastSuccess?: Date;
  responseTime?: number;
}

export interface ImplantProtocolState {
  implantId: string;
  currentProtocol: Protocol;
  availableProtocols: Protocol[];
  lastFailover?: Date;
  failoverCount: number;
  preferredProtocol?: Protocol | undefined;
}

export class ProtocolManager extends EventEmitter implements IProtocolManager {
  private handlers: Map<Protocol, BaseProtocolHandler>;
  private implantConnections: Map<string, ConnectionInfo>;
  private implantProtocolStates: Map<string, ImplantProtocolState>;
  private protocolHealth: Map<Protocol, ProtocolHealth>;
  private failoverConfig: ProtocolFailoverConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private logger: Logger;
  private isRunning: boolean = false;

  constructor(failoverConfig: ProtocolFailoverConfig) {
    super();
    this.handlers = new Map();
    this.implantConnections = new Map();
    this.implantProtocolStates = new Map();
    this.protocolHealth = new Map();
    this.failoverConfig = failoverConfig;
    this.logger = Logger.getInstance();
  }

  /**
   * Start protocol manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Protocol manager is already running');
    }

    try {
      this.logger.info('Starting protocol manager', {
        primaryProtocol: this.failoverConfig.primaryProtocol,
        fallbackProtocols: this.failoverConfig.fallbackProtocols,
        failoverEnabled: this.failoverConfig.enabled,
      });

      // Start all registered handlers
      for (const [protocol, handler] of this.handlers.entries()) {
        if (handler.isEnabled()) {
          await handler.start();
          this.initializeProtocolHealth(protocol);
        }
      }

      // Start health monitoring if failover is enabled
      if (this.failoverConfig.enabled) {
        this.startHealthMonitoring();
      }

      this.isRunning = true;

      this.logger.info('Protocol manager started successfully');
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start protocol manager', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Stop protocol manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping protocol manager');

      // Stop health monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = undefined as any;
      }

      // Stop all handlers
      for (const [protocol, handler] of this.handlers.entries()) {
        try {
          await handler.stop();
        } catch (error) {
          this.logger.error('Failed to stop protocol handler', {
            protocol,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.implantConnections.clear();
      this.implantProtocolStates.clear();
      this.protocolHealth.clear();
      this.isRunning = false;

      this.logger.info('Protocol manager stopped');
      this.emit('stopped');
    } catch (error) {
      this.logger.error('Failed to stop protocol manager', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Register protocol handler
   */
  registerHandler(protocol: Protocol, handler: BaseProtocolHandler): void {
    this.handlers.set(protocol, handler);
    this.initializeProtocolHealth(protocol);

    // Setup handler event listeners
    this.setupHandlerEventListeners(protocol, handler);

    this.logger.info('Protocol handler registered', {
      protocol,
      enabled: handler.isEnabled(),
    });

    this.emit('handlerRegistered', {
      protocol,
      handler,
    });
  }

  /**
   * Unregister protocol handler
   */
  unregisterHandler(protocol: Protocol): void {
    const handler = this.handlers.get(protocol);
    if (handler) {
      // Remove event listeners
      handler.removeAllListeners();

      // Stop handler if running
      if (this.isRunning && handler.isEnabled()) {
        handler.stop().catch(error => {
          this.logger.error('Failed to stop handler during unregistration', {
            protocol,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      this.handlers.delete(protocol);
      this.protocolHealth.delete(protocol);

      this.logger.info('Protocol handler unregistered', { protocol });

      this.emit('handlerUnregistered', {
        protocol,
      });
    }
  }

  /**
   * Send message to implant with automatic protocol selection and failover
   */
  async sendMessage(
    implantId: string,
    message: ProtocolMessage,
    preferredProtocol?: Protocol
  ): Promise<boolean> {
    try {
      // Get or create implant protocol state
      let protocolState = this.implantProtocolStates.get(implantId);
      if (!protocolState) {
        protocolState = this.createImplantProtocolState(implantId, preferredProtocol);
        this.implantProtocolStates.set(implantId, protocolState);
      }

      // Determine which protocol to use
      const protocol = this.selectProtocolForImplant(implantId, preferredProtocol);
      const handler = this.handlers.get(protocol);

      if (!handler || !handler.isEnabled()) {
        this.logger.warn('No available handler for protocol', {
          protocol,
          implantId,
          messageId: message.id,
        });
        return false;
      }

      // Attempt to send message
      const startTime = Date.now();
      const success = await handler.sendMessage(implantId, message);
      const responseTime = Date.now() - startTime;

      // Update protocol health
      this.updateProtocolHealth(protocol, success, responseTime);

      if (success) {
        // Update implant protocol state
        protocolState.currentProtocol = protocol;

        this.logger.debug('Message sent successfully', {
          implantId,
          messageId: message.id,
          protocol,
          responseTime,
        });

        this.emit('messageSent', {
          implantId,
          message,
          protocol,
          responseTime,
        });

        return true;
      } else {
        // Handle send failure
        await this.handleSendFailure(implantId, message, protocol);
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to send message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        messageId: message.id,
        preferredProtocol,
      });

      this.emit('sendError', {
        implantId,
        message,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  /**
   * Get available protocols
   */
  getAvailableProtocols(): Protocol[] {
    return Array.from(this.handlers.keys()).filter(protocol => {
      const handler = this.handlers.get(protocol);
      return handler && handler.isEnabled();
    });
  }

  /**
   * Get protocol statistics
   */
  getProtocolStats(): ProtocolStats[] {
    return Array.from(this.handlers.entries()).map(([_protocol, handler]) => {
      return handler.getStats();
    });
  }

  /**
   * Check if implant is connected via any protocol
   */
  isImplantConnected(implantId: string): boolean {
    for (const handler of this.handlers.values()) {
      if (handler.isImplantConnected(implantId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get implant connection info
   */
  getImplantConnection(implantId: string): ConnectionInfo | null {
    return this.implantConnections.get(implantId) || null;
  }

  /**
   * Get protocol health status
   */
  getProtocolHealth(): ProtocolHealth[] {
    return Array.from(this.protocolHealth.values());
  }

  /**
   * Get implant protocol states
   */
  getImplantProtocolStates(): ImplantProtocolState[] {
    return Array.from(this.implantProtocolStates.values());
  }

  /**
   * Force protocol failover for specific implant
   */
  async forceFailover(implantId: string, targetProtocol?: Protocol): Promise<boolean> {
    try {
      const protocolState = this.implantProtocolStates.get(implantId);
      if (!protocolState) {
        this.logger.warn('No protocol state found for implant', { implantId });
        return false;
      }

      const newProtocol =
        targetProtocol || this.selectFallbackProtocol(protocolState.currentProtocol);
      if (!newProtocol) {
        this.logger.warn('No fallback protocol available', {
          implantId,
          currentProtocol: protocolState.currentProtocol,
        });
        return false;
      }

      // Update protocol state
      protocolState.currentProtocol = newProtocol;
      protocolState.lastFailover = new Date();
      protocolState.failoverCount++;

      this.logger.info('Forced protocol failover', {
        implantId,
        newProtocol,
        failoverCount: protocolState.failoverCount,
      });

      this.emit('protocolFailover', {
        implantId,
        oldProtocol: protocolState.currentProtocol,
        newProtocol,
        reason: 'forced',
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to force protocol failover', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
        targetProtocol,
      });
      return false;
    }
  }

  /**
   * Initialize protocol health tracking
   */
  private initializeProtocolHealth(protocol: Protocol): void {
    this.protocolHealth.set(protocol, {
      protocol,
      isHealthy: true,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastHealthCheck: new Date(),
    });
  }

  /**
   * Setup event listeners for protocol handler
   */
  private setupHandlerEventListeners(protocol: Protocol, handler: BaseProtocolHandler): void {
    handler.on('implantConnected', data => {
      this.handleImplantConnected(protocol, data);
    });

    handler.on('implantDisconnected', data => {
      this.handleImplantDisconnected(protocol, data);
    });

    handler.on('messageReceived', data => {
      this.handleMessageReceived(protocol, data);
    });

    handler.on('heartbeatReceived', data => {
      this.handleHeartbeatReceived(protocol, data);
    });

    handler.on('error', error => {
      this.handleProtocolError(protocol, error);
    });
  }

  /**
   * Handle implant connection via protocol
   */
  private handleImplantConnected(protocol: Protocol, data: any): void {
    const { implantId, connectionInfo } = data;

    // Update connection info
    this.implantConnections.set(implantId, connectionInfo);

    // Update or create protocol state
    let protocolState = this.implantProtocolStates.get(implantId);
    if (!protocolState) {
      protocolState = this.createImplantProtocolState(implantId);
      this.implantProtocolStates.set(implantId, protocolState);
    }

    protocolState.currentProtocol = protocol;
    if (!protocolState.availableProtocols.includes(protocol)) {
      protocolState.availableProtocols.push(protocol);
    }

    this.logger.info('Implant connected via protocol', {
      implantId,
      protocol,
      remoteAddress: connectionInfo.remoteAddress,
    });

    this.emit('implantConnected', {
      implantId,
      protocol,
      connectionInfo,
    });
  }

  /**
   * Handle implant disconnection from protocol
   */
  private handleImplantDisconnected(protocol: Protocol, data: any): void {
    const { implantId, reason } = data;

    // Remove from available protocols
    const protocolState = this.implantProtocolStates.get(implantId);
    if (protocolState) {
      protocolState.availableProtocols = protocolState.availableProtocols.filter(
        p => p !== protocol
      );

      // If this was the current protocol, try to failover
      if (
        protocolState.currentProtocol === protocol &&
        protocolState.availableProtocols.length > 0
      ) {
        const fallbackProtocol = protocolState.availableProtocols[0]!; // Length > 0 checked above
        protocolState.currentProtocol = fallbackProtocol;
        protocolState.lastFailover = new Date();
        protocolState.failoverCount++;

        this.logger.info('Automatic failover due to disconnection', {
          implantId,
          oldProtocol: protocol,
          newProtocol: fallbackProtocol,
          reason,
        });

        this.emit('protocolFailover', {
          implantId,
          oldProtocol: protocol,
          newProtocol: fallbackProtocol,
          reason: 'disconnection',
        });
      }
    }

    // Remove connection info if no other protocols are connected
    if (!this.isImplantConnected(implantId)) {
      this.implantConnections.delete(implantId);
    }

    this.logger.info('Implant disconnected from protocol', {
      implantId,
      protocol,
      reason,
    });

    this.emit('implantDisconnected', {
      implantId,
      protocol,
      reason,
    });
  }

  /**
   * Handle message received from protocol
   */
  private handleMessageReceived(protocol: Protocol, data: any): void {
    const { message, connectionInfo } = data;

    // Update connection info
    this.implantConnections.set(message.implantId, connectionInfo);

    this.emit('messageReceived', {
      message,
      protocol,
      connectionInfo,
    });
  }

  /**
   * Handle heartbeat received from protocol
   */
  private handleHeartbeatReceived(protocol: Protocol, data: any): void {
    const { implantId, connectionInfo } = data;

    // Update connection info
    if (connectionInfo) {
      this.implantConnections.set(implantId, connectionInfo);
    }

    this.emit('heartbeatReceived', {
      implantId,
      protocol,
      data: data.data,
      connectionInfo,
    });
  }

  /**
   * Handle protocol error
   */
  private handleProtocolError(protocol: Protocol, error: any): void {
    this.updateProtocolHealth(protocol, false);

    this.logger.error('Protocol error', {
      protocol,
      error: error.message || error,
    });

    this.emit('protocolError', {
      protocol,
      error,
    });
  }

  /**
   * Create implant protocol state
   */
  private createImplantProtocolState(
    implantId: string,
    preferredProtocol?: Protocol
  ): ImplantProtocolState {
    const availableProtocols = this.getAvailableProtocols();
    const currentProtocol =
      preferredProtocol || this.failoverConfig.primaryProtocol || availableProtocols[0];

    return {
      implantId,
      currentProtocol,
      availableProtocols: availableProtocols,
      failoverCount: 0,
      preferredProtocol: preferredProtocol || undefined,
    };
  }

  /**
   * Select protocol for implant
   */
  private selectProtocolForImplant(implantId: string, preferredProtocol?: Protocol): Protocol {
    const protocolState = this.implantProtocolStates.get(implantId);

    if (preferredProtocol && this.isProtocolHealthy(preferredProtocol)) {
      return preferredProtocol;
    }

    if (protocolState) {
      // Use current protocol if healthy
      if (this.isProtocolHealthy(protocolState.currentProtocol)) {
        return protocolState.currentProtocol;
      }

      // Try preferred protocol if healthy
      if (
        protocolState.preferredProtocol &&
        this.isProtocolHealthy(protocolState.preferredProtocol)
      ) {
        return protocolState.preferredProtocol;
      }

      // Find first healthy available protocol
      for (const protocol of protocolState.availableProtocols) {
        if (this.isProtocolHealthy(protocol)) {
          return protocol;
        }
      }
    }

    // Fallback to primary protocol or first available
    return this.failoverConfig.primaryProtocol || this.getAvailableProtocols()[0];
  }

  /**
   * Select fallback protocol
   */
  private selectFallbackProtocol(currentProtocol: Protocol): Protocol | null {
    const fallbackProtocols = this.failoverConfig.fallbackProtocols.filter(
      p => p !== currentProtocol
    );

    for (const protocol of fallbackProtocols) {
      if (this.isProtocolHealthy(protocol)) {
        return protocol;
      }
    }

    return null;
  }

  /**
   * Check if protocol is healthy
   */
  private isProtocolHealthy(protocol: Protocol): boolean {
    const health = this.protocolHealth.get(protocol);
    if (!health) {
      return false;
    }

    const handler = this.handlers.get(protocol);
    return health.isHealthy && handler?.isEnabled() === true;
  }

  /**
   * Update protocol health
   */
  private updateProtocolHealth(protocol: Protocol, success: boolean, responseTime?: number): void {
    const health = this.protocolHealth.get(protocol);
    if (!health) {
      return;
    }

    health.lastHealthCheck = new Date();
    if (responseTime !== undefined) {
      health.responseTime = responseTime;
    }

    if (success) {
      health.consecutiveSuccesses++;
      health.consecutiveFailures = 0;
      health.lastSuccess = new Date();

      // Mark as healthy if it reaches recovery threshold
      if (health.consecutiveSuccesses >= this.failoverConfig.recoveryThreshold) {
        health.isHealthy = true;
      }
    } else {
      health.consecutiveFailures++;
      health.consecutiveSuccesses = 0;
      health.lastFailure = new Date();

      // Mark as unhealthy if it reaches failure threshold
      if (health.consecutiveFailures >= this.failoverConfig.failureThreshold) {
        health.isHealthy = false;
      }
    }
  }

  /**
   * Handle send failure with potential failover
   */
  private async handleSendFailure(
    implantId: string,
    message: ProtocolMessage,
    failedProtocol: Protocol
  ): Promise<void> {
    if (!this.failoverConfig.enabled) {
      return;
    }

    const protocolState = this.implantProtocolStates.get(implantId);
    if (!protocolState) {
      return;
    }

    // Try failover to another protocol
    const fallbackProtocol = this.selectFallbackProtocol(failedProtocol);
    if (!fallbackProtocol) {
      this.logger.warn('No fallback protocol available for failover', {
        implantId,
        failedProtocol,
      });
      return;
    }

    this.logger.info('Attempting protocol failover', {
      implantId,
      failedProtocol,
      fallbackProtocol,
    });

    // Update protocol state
    protocolState.currentProtocol = fallbackProtocol!; // We already checked for null above
    protocolState.lastFailover = new Date();
    protocolState.failoverCount++;

    // Try sending with fallback protocol
    const fallbackHandler = this.handlers.get(fallbackProtocol);
    if (fallbackHandler) {
      const success = await fallbackHandler.sendMessage(implantId, message);

      if (success) {
        this.logger.info('Protocol failover successful', {
          implantId,
          failedProtocol,
          fallbackProtocol,
        });

        this.emit('protocolFailover', {
          implantId,
          oldProtocol: failedProtocol,
          newProtocol: fallbackProtocol,
          reason: 'send_failure',
          success: true,
        });
      } else {
        this.logger.warn('Protocol failover failed', {
          implantId,
          failedProtocol,
          fallbackProtocol,
        });

        this.emit('protocolFailover', {
          implantId,
          oldProtocol: failedProtocol,
          newProtocol: fallbackProtocol,
          reason: 'send_failure',
          success: false,
        });
      }
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.failoverConfig.healthCheckInterval);

    this.logger.info('Protocol health monitoring started', {
      interval: this.failoverConfig.healthCheckInterval,
    });
  }

  /**
   * Perform health checks on all protocols
   */
  private async performHealthChecks(): Promise<void> {
    for (const [protocol, handler] of this.handlers.entries()) {
      if (!handler.isEnabled()) {
        continue;
      }

      try {
        // Simple health check - could be enhanced with actual ping/test messages
        const stats = handler.getStats();
        const isHealthy = stats.connectionsActive > 0 || !!stats.lastActivity;

        this.updateProtocolHealth(protocol, isHealthy);
      } catch (error) {
        this.logger.error('Health check failed for protocol', {
          protocol,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        this.updateProtocolHealth(protocol, false);
      }
    }
  }
}
