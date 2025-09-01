import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';
import { ImplantManager } from '../implant/implant-manager';
import { DatabaseService } from '../database/database.service';

export interface KillSwitchConfig {
  defaultTimeout: number; // Default timeout in milliseconds
  checkInterval: number; // How often to check for timeouts
  maxMissedHeartbeats: number; // Max missed heartbeats before activation
  gracePeriod: number; // Grace period before activation
}

export interface KillSwitchTimer {
  id: string;
  implantId: string;
  timeout: number;
  createdAt: Date;
  lastHeartbeat: Date;
  missedHeartbeats: number;
  isActive: boolean;
  reason: string;
}

export interface KillSwitchActivation {
  id: string;
  implantId: string;
  timerId: string;
  activatedAt: Date;
  reason: string;
  status: KillSwitchStatus;
}

export enum KillSwitchStatus {
  PENDING = 'pending',
  ACTIVATED = 'activated',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export class KillSwitchService extends EventEmitter {
  private logger: Logger;
  private timers: Map<string, KillSwitchTimer> = new Map();
  private activations: Map<string, KillSwitchActivation> = new Map();
  private checkIntervalId?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(
    private config: KillSwitchConfig,
    private implantManager: ImplantManager,
    private databaseService: DatabaseService
  ) {
    super();
    this.logger = createLogger('KillSwitch');
    this.setupEventHandlers();
  }

  /**
   * Start the kill switch monitoring service
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.checkIntervalId = setInterval(() => {
      this.checkTimers();
    }, this.config.checkInterval);

    this.logger.info('Kill switch service started', {
      checkInterval: this.config.checkInterval,
      defaultTimeout: this.config.defaultTimeout,
    });
  }

  /**
   * Stop the kill switch monitoring service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = undefined;
    }

    this.logger.info('Kill switch service stopped');
  }

  /**
   * Create a kill switch timer for an implant
   * Requirement 19.4: Configurable kill-switch timers for lost communication
   */
  createTimer(implantId: string, timeout?: number, reason?: string): string {
    const timerId = this.generateTimerId();
    const now = new Date();

    const timer: KillSwitchTimer = {
      id: timerId,
      implantId,
      timeout: timeout || this.config.defaultTimeout,
      createdAt: now,
      lastHeartbeat: now,
      missedHeartbeats: 0,
      isActive: true,
      reason: reason || 'Communication timeout',
    };

    this.timers.set(timerId, timer);
    this.logger.info(`Kill switch timer created for implant ${implantId}`, {
      timerId,
      timeout: timer.timeout,
      reason: timer.reason,
    });

    this.persistTimer(timer);
    return timerId;
  }

  /**
   * Update heartbeat for an implant's kill switch timer
   */
  updateHeartbeat(implantId: string): void {
    const timer = this.findTimerByImplant(implantId);
    if (timer && timer.isActive) {
      timer.lastHeartbeat = new Date();
      timer.missedHeartbeats = 0;

      this.logger.debug(`Heartbeat updated for implant ${implantId}`, {
        timerId: timer.id,
        lastHeartbeat: timer.lastHeartbeat,
      });

      this.persistTimer(timer);
    }
  }

  /**
   * Cancel a kill switch timer
   */
  cancelTimer(timerId: string, reason?: string): boolean {
    const timer = this.timers.get(timerId);
    if (!timer) {
      return false;
    }

    timer.isActive = false;
    this.logger.info(`Kill switch timer cancelled`, {
      timerId,
      implantId: timer.implantId,
      reason: reason || 'Manual cancellation',
    });

    this.persistTimer(timer);
    return true;
  }

  /**
   * Cancel all timers for a specific implant
   */
  cancelImplantTimers(implantId: string, reason?: string): number {
    let cancelled = 0;

    for (const timer of this.timers.values()) {
      if (timer.implantId === implantId && timer.isActive) {
        timer.isActive = false;
        this.persistTimer(timer);
        cancelled++;
      }
    }

    if (cancelled > 0) {
      this.logger.info(`Cancelled ${cancelled} kill switch timers for implant ${implantId}`, {
        reason: reason || 'Implant-specific cancellation',
      });
    }

    return cancelled;
  }

  /**
   * Get all active timers
   */
  getActiveTimers(): KillSwitchTimer[] {
    return Array.from(this.timers.values()).filter(t => t.isActive);
  }

  /**
   * Get timer by ID
   */
  getTimer(timerId: string): KillSwitchTimer | undefined {
    return this.timers.get(timerId);
  }

  /**
   * Get all timers for a specific implant
   */
  getImplantTimers(implantId: string): KillSwitchTimer[] {
    return Array.from(this.timers.values()).filter(t => t.implantId === implantId);
  }

  /**
   * Get activation history
   */
  getActivations(implantId?: string): KillSwitchActivation[] {
    const activations = Array.from(this.activations.values());

    if (implantId) {
      return activations.filter(a => a.implantId === implantId);
    }

    return activations.sort((a, b) => b.activatedAt.getTime() - a.activatedAt.getTime());
  }

  /**
   * Manually activate kill switch for an implant
   */
  async activateKillSwitch(implantId: string, reason: string): Promise<string> {
    const activationId = this.generateActivationId();

    const activation: KillSwitchActivation = {
      id: activationId,
      implantId,
      timerId: 'manual',
      activatedAt: new Date(),
      reason,
      status: KillSwitchStatus.PENDING,
    };

    this.activations.set(activationId, activation);

    try {
      await this.executeKillSwitch(activation);
      activation.status = KillSwitchStatus.COMPLETED;
      this.logger.info(`Manual kill switch activated for implant ${implantId}`, {
        activationId,
        reason,
      });
    } catch (error) {
      activation.status = KillSwitchStatus.FAILED;
      this.logger.error(`Manual kill switch failed for implant ${implantId}`, error);
      throw error;
    }

    this.persistActivation(activation);
    return activationId;
  }

  private setupEventHandlers(): void {
    // Listen for implant heartbeats
    this.implantManager.on('implant:heartbeat', data => {
      this.updateHeartbeat(data.implantId);
    });

    // Listen for implant connections
    this.implantManager.on('implant:connected', data => {
      // Cancel existing timers when implant reconnects
      this.cancelImplantTimers(data.implantId, 'Implant reconnected');
    });

    // Listen for implant disconnections
    this.implantManager.on('implant:disconnected', data => {
      // Create new timer when implant disconnects
      this.createTimer(data.implantId, undefined, 'Implant disconnected');
    });
  }

  private checkTimers(): void {
    const now = new Date();

    for (const timer of this.timers.values()) {
      if (!timer.isActive) {
        continue;
      }

      const timeSinceLastHeartbeat = now.getTime() - timer.lastHeartbeat.getTime();

      // Check if we've exceeded the timeout
      if (timeSinceLastHeartbeat > timer.timeout) {
        this.activateTimerKillSwitch(timer);
      }
      // Check for missed heartbeats
      else if (timeSinceLastHeartbeat > this.config.checkInterval * 2) {
        timer.missedHeartbeats++;

        if (timer.missedHeartbeats >= this.config.maxMissedHeartbeats) {
          this.logger.warn(
            `Implant ${timer.implantId} missed ${timer.missedHeartbeats} heartbeats`,
            {
              timerId: timer.id,
              timeSinceLastHeartbeat,
            }
          );
        }
      }
    }
  }

  private async activateTimerKillSwitch(timer: KillSwitchTimer): Promise<void> {
    const activationId = this.generateActivationId();

    const activation: KillSwitchActivation = {
      id: activationId,
      implantId: timer.implantId,
      timerId: timer.id,
      activatedAt: new Date(),
      reason: `Timer expired: ${timer.reason}`,
      status: KillSwitchStatus.ACTIVATED,
    };

    this.activations.set(activationId, activation);
    timer.isActive = false;

    this.logger.warn(`Kill switch activated for implant ${timer.implantId}`, {
      activationId,
      timerId: timer.id,
      reason: activation.reason,
    });

    try {
      await this.executeKillSwitch(activation);
      activation.status = KillSwitchStatus.COMPLETED;
    } catch (error) {
      activation.status = KillSwitchStatus.FAILED;
      this.logger.error(`Kill switch execution failed for implant ${timer.implantId}`, error);
    }

    this.persistTimer(timer);
    this.persistActivation(activation);

    this.emit('kill-switch:activated', {
      activationId,
      implantId: timer.implantId,
      timerId: timer.id,
      reason: activation.reason,
    });
  }

  private async executeKillSwitch(activation: KillSwitchActivation): Promise<void> {
    // Send self-destruct command to implant
    try {
      const command = {
        type: 'kill_switch_activated',
        payload: {
          activationId: activation.id,
          reason: activation.reason,
          timestamp: activation.activatedAt.toISOString(),
        },
      };

      await this.implantManager.sendCommand(activation.implantId, command);

      // Remove implant from active sessions after grace period
      setTimeout(async () => {
        await this.implantManager.removeImplant(activation.implantId);
      }, this.config.gracePeriod);
    } catch (error) {
      // If we can't send the command, just remove the implant
      this.logger.warn(
        `Could not send kill switch command to implant ${activation.implantId}, removing from active sessions`
      );
      await this.implantManager.removeImplant(activation.implantId);
    }
  }

  private findTimerByImplant(implantId: string): KillSwitchTimer | undefined {
    for (const timer of this.timers.values()) {
      if (timer.implantId === implantId && timer.isActive) {
        return timer;
      }
    }
    return undefined;
  }

  private async persistTimer(timer: KillSwitchTimer): Promise<void> {
    try {
      await this.databaseService.query(
        `INSERT INTO kill_switch_timers (id, implant_id, timeout, created_at, last_heartbeat, missed_heartbeats, is_active, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
         last_heartbeat = $5, missed_heartbeats = $6, is_active = $7`,
        [
          timer.id,
          timer.implantId,
          timer.timeout,
          timer.createdAt,
          timer.lastHeartbeat,
          timer.missedHeartbeats,
          timer.isActive,
          timer.reason,
        ]
      );
    } catch (error) {
      this.logger.error('Failed to persist kill switch timer', error);
    }
  }

  private async persistActivation(activation: KillSwitchActivation): Promise<void> {
    try {
      await this.databaseService.query(
        `INSERT INTO kill_switch_activations (id, implant_id, timer_id, activated_at, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET status = $6`,
        [
          activation.id,
          activation.implantId,
          activation.timerId,
          activation.activatedAt,
          activation.reason,
          activation.status,
        ]
      );
    } catch (error) {
      this.logger.error('Failed to persist kill switch activation', error);
    }
  }

  private generateTimerId(): string {
    return `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActivationId(): string {
    return `activation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
