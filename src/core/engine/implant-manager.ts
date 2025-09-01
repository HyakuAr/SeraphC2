/**
 * ImplantManager - Core class for tracking implant state and managing connections
 * Implements requirements 1.2 and 8.1 from the SeraphC2 specification
 */

import { EventEmitter } from 'events';
import { ImplantRepository } from '../repositories/interfaces';
import { PostgresImplantRepository } from '../repositories/implant.repository';
import {
  Implant,
  ImplantStatus,
  CreateImplantData,
  UpdateImplantData,
  Protocol,
} from '../../types/entities';
import { Logger } from '../../utils/logger';

export interface ImplantSession {
  implantId: string;
  lastHeartbeat: Date;
  connectionInfo: {
    protocol: Protocol;
    remoteAddress: string;
    userAgent?: string | undefined;
  };
  isActive: boolean;
}

export interface HeartbeatData {
  implantId: string;
  systemInfo?: any;
  protocol: Protocol;
  remoteAddress: string;
  userAgent?: string;
}

export interface ImplantRegistrationData extends CreateImplantData {
  remoteAddress: string;
  userAgent?: string;
}

export class ImplantManager extends EventEmitter {
  private implantRepository: ImplantRepository;
  private activeSessions: Map<string, ImplantSession>;
  private heartbeatInterval: number;
  private inactivityThreshold: number;
  private logger: Logger;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    implantRepository?: ImplantRepository,
    heartbeatInterval: number = 30000, // 30 seconds
    inactivityThreshold: number = 300000 // 5 minutes
  ) {
    super();
    this.implantRepository = implantRepository || new PostgresImplantRepository();
    this.activeSessions = new Map();
    this.heartbeatInterval = heartbeatInterval;
    this.inactivityThreshold = inactivityThreshold;
    this.logger = Logger.getInstance();

    this.startHeartbeatMonitoring();
  }

  /**
   * Register a new implant with the C2 server
   */
  async registerImplant(data: ImplantRegistrationData): Promise<Implant> {
    try {
      this.logger.info('Registering new implant', {
        hostname: data.hostname,
        username: data.username,
        protocol: data.communicationProtocol,
        remoteAddress: data.remoteAddress,
      });

      // Check if implant already exists by hostname and username
      const existingImplants = await this.implantRepository.findByHostname(data.hostname);
      const existingImplant = existingImplants.find(implant => implant.username === data.username);

      let implant: Implant;

      if (existingImplant) {
        // Update existing implant
        this.logger.info('Updating existing implant registration', {
          implantId: existingImplant.id,
        });

        const updateData: UpdateImplantData = {
          lastSeen: new Date(),
          status: ImplantStatus.ACTIVE,
          communicationProtocol: data.communicationProtocol,
          systemInfo: data.systemInfo,
          configuration: data.configuration,
        };

        implant = (await this.implantRepository.update(existingImplant.id, updateData))!;
      } else {
        // Create new implant
        const createData: CreateImplantData = {
          hostname: data.hostname,
          username: data.username,
          operatingSystem: data.operatingSystem,
          architecture: data.architecture,
          privileges: data.privileges,
          communicationProtocol: data.communicationProtocol,
          encryptionKey: data.encryptionKey,
          configuration: data.configuration,
          systemInfo: data.systemInfo,
        };

        implant = await this.implantRepository.create(createData);
      }

      // Create active session
      const session: ImplantSession = {
        implantId: implant.id,
        lastHeartbeat: new Date(),
        connectionInfo: {
          protocol: data.communicationProtocol,
          remoteAddress: data.remoteAddress,
          userAgent: data.userAgent,
        },
        isActive: true,
      };

      this.activeSessions.set(implant.id, session);

      // Emit registration event
      this.emit('implantRegistered', {
        implant,
        session,
      });

      this.logger.info('Implant registered successfully', {
        implantId: implant.id,
        hostname: implant.hostname,
      });

      return implant;
    } catch (error) {
      this.logger.error('Failed to register implant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hostname: data.hostname,
      });
      throw error;
    }
  }

  /**
   * Process heartbeat from an implant
   */
  async processHeartbeat(data: HeartbeatData): Promise<void> {
    try {
      const { implantId, systemInfo, protocol, remoteAddress, userAgent } = data;

      // Update implant last seen
      await this.implantRepository.updateLastSeen(implantId);

      // Update or create session
      const existingSession = this.activeSessions.get(implantId);

      if (existingSession) {
        existingSession.lastHeartbeat = new Date();
        existingSession.connectionInfo = {
          protocol,
          remoteAddress,
          userAgent,
        };
        existingSession.isActive = true;
      } else {
        // Create new session for existing implant
        const session: ImplantSession = {
          implantId,
          lastHeartbeat: new Date(),
          connectionInfo: {
            protocol,
            remoteAddress,
            userAgent,
          },
          isActive: true,
        };
        this.activeSessions.set(implantId, session);
      }

      // Update system info if provided
      if (systemInfo) {
        await this.implantRepository.update(implantId, { systemInfo });
      }

      // Ensure implant status is active
      await this.implantRepository.updateStatus(implantId, ImplantStatus.ACTIVE);

      this.emit('heartbeatReceived', {
        implantId,
        timestamp: new Date(),
        protocol,
        remoteAddress,
      });

      this.logger.debug('Heartbeat processed', {
        implantId,
        protocol,
        remoteAddress,
      });
    } catch (error) {
      this.logger.error('Failed to process heartbeat', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId: data.implantId,
      });
      throw error;
    }
  }

  /**
   * Get active implant session
   */
  getImplantSession(implantId: string): ImplantSession | null {
    return this.activeSessions.get(implantId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ImplantSession[] {
    return Array.from(this.activeSessions.values()).filter(session => session.isActive);
  }

  /**
   * Check if implant is currently active
   */
  isImplantActive(implantId: string): boolean {
    const session = this.activeSessions.get(implantId);
    if (!session || !session.isActive) {
      return false;
    }

    const timeSinceLastHeartbeat = Date.now() - session.lastHeartbeat.getTime();
    return timeSinceLastHeartbeat < this.inactivityThreshold;
  }

  /**
   * Disconnect an implant session
   */
  async disconnectImplant(implantId: string, reason: string = 'Manual disconnect'): Promise<void> {
    try {
      const session = this.activeSessions.get(implantId);

      if (session) {
        session.isActive = false;
        this.activeSessions.delete(implantId);
      }

      await this.implantRepository.updateStatus(implantId, ImplantStatus.DISCONNECTED);

      this.emit('implantDisconnected', {
        implantId,
        reason,
        timestamp: new Date(),
      });

      this.logger.info('Implant disconnected', {
        implantId,
        reason,
      });
    } catch (error) {
      this.logger.error('Failed to disconnect implant', {
        error: error instanceof Error ? error.message : 'Unknown error',
        implantId,
      });
      throw error;
    }
  }

  /**
   * Get implant by ID
   */
  async getImplant(implantId: string): Promise<Implant | null> {
    return this.implantRepository.findById(implantId);
  }

  /**
   * Get all implants
   */
  async getAllImplants(): Promise<Implant[]> {
    return this.implantRepository.findAll();
  }

  /**
   * Get active implants
   */
  async getActiveImplants(): Promise<Implant[]> {
    return this.implantRepository.findActiveImplants();
  }

  /**
   * Get implant statistics
   */
  async getImplantStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    disconnected: number;
  }> {
    const allImplants = await this.getAllImplants();

    return {
      total: allImplants.length,
      active: allImplants.filter(i => i.status === ImplantStatus.ACTIVE).length,
      inactive: allImplants.filter(i => i.status === ImplantStatus.INACTIVE).length,
      disconnected: allImplants.filter(i => i.status === ImplantStatus.DISCONNECTED).length,
    };
  }

  /**
   * Start monitoring heartbeats and updating implant status
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.checkInactiveImplants();
    }, this.heartbeatInterval);

    this.logger.info('Heartbeat monitoring started', {
      interval: this.heartbeatInterval,
      inactivityThreshold: this.inactivityThreshold,
    });
  }

  /**
   * Check for inactive implants and update their status
   */
  private async checkInactiveImplants(): Promise<void> {
    try {
      const now = Date.now();
      const inactiveImplants: string[] = [];

      // Check active sessions for inactivity
      for (const [implantId, session] of this.activeSessions.entries()) {
        const timeSinceLastHeartbeat = now - session.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > this.inactivityThreshold) {
          session.isActive = false;
          inactiveImplants.push(implantId);
        }
      }

      // Update database status for inactive implants
      for (const implantId of inactiveImplants) {
        await this.implantRepository.updateStatus(implantId, ImplantStatus.INACTIVE);
        this.activeSessions.delete(implantId);

        this.emit('implantInactive', {
          implantId,
          timestamp: new Date(),
        });

        this.logger.warn('Implant marked as inactive', { implantId });
      }

      // Also check database for implants that haven't been seen recently
      const thresholdMinutes = Math.ceil(this.inactivityThreshold / 60000);
      const dbInactiveImplants =
        await this.implantRepository.findInactiveImplants(thresholdMinutes);

      for (const implant of dbInactiveImplants) {
        if (implant.status === ImplantStatus.ACTIVE) {
          await this.implantRepository.updateStatus(implant.id, ImplantStatus.INACTIVE);
          this.activeSessions.delete(implant.id);

          this.emit('implantInactive', {
            implantId: implant.id,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      this.logger.error('Error checking inactive implants', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined as any;
    }

    this.activeSessions.clear();
    this.removeAllListeners();

    this.logger.info('ImplantManager stopped');
  }
}
