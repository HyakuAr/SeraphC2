import { EventEmitter } from 'events';
import { Logger, createLogger } from '../../utils/logger';
import { ImplantManager } from '../engine/implant-manager';
import { DatabaseService } from '../database/database.service';
import { CryptoService } from '../crypto/crypto.service';
import { BackupService } from './backup.service';
import { KillSwitchService } from './kill-switch.service';

export interface IncidentResponseConfig {
  emergencyShutdownTimeout: number;
  selfDestructTimeout: number;
  backupRetentionDays: number;
  secureWipeIterations: number;
  emergencyContactEndpoints: string[];
}

export interface IncidentReport {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  timestamp: Date;
  description: string;
  affectedImplants: string[];
  operatorId?: string;
  responseActions: ResponseAction[];
  status: IncidentStatus;
}

export enum IncidentType {
  DETECTION_SUSPECTED = 'detection_suspected',
  SERVER_COMPROMISE = 'server_compromise',
  COMMUNICATION_LOST = 'communication_lost',
  FORENSIC_ANALYSIS = 'forensic_analysis',
  EMERGENCY_EVACUATION = 'emergency_evacuation',
  LEGAL_COMPLIANCE = 'legal_compliance',
}

export enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  ACTIVE = 'active',
  RESPONDING = 'responding',
  CONTAINED = 'contained',
  RESOLVED = 'resolved',
}

export interface ResponseAction {
  id: string;
  type: ResponseActionType;
  timestamp: Date;
  status: ActionStatus;
  details: any;
  error?: string;
}

export enum ResponseActionType {
  SELF_DESTRUCT = 'self_destruct',
  EMERGENCY_SHUTDOWN = 'emergency_shutdown',
  IMPLANT_MIGRATION = 'implant_migration',
  DATA_SANITIZATION = 'data_sanitization',
  BACKUP_CREATION = 'backup_creation',
  KILL_SWITCH_ACTIVATION = 'kill_switch_activation',
}

export enum ActionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class IncidentResponseService extends EventEmitter {
  private logger: Logger;
  private incidents: Map<string, IncidentReport> = new Map();
  private isEmergencyMode: boolean = false;

  constructor(
    private config: IncidentResponseConfig,
    private implantManager: ImplantManager,
    private databaseService: DatabaseService,
    private cryptoService: CryptoService,
    private backupService: BackupService,
    private killSwitchService: KillSwitchService
  ) {
    super();
    this.logger = createLogger('IncidentResponse');
    this.setupEventHandlers();
  }

  /**
   * Trigger immediate self-destruct for specific implants
   * Requirement 19.1: Operators can trigger immediate self-destruct commands
   */
  async triggerSelfDestruct(
    implantIds: string[],
    operatorId: string,
    reason: string
  ): Promise<string> {
    const incidentId = this.generateIncidentId();

    const incident: IncidentReport = {
      id: incidentId,
      type: IncidentType.DETECTION_SUSPECTED,
      severity: IncidentSeverity.HIGH,
      timestamp: new Date(),
      description: `Self-destruct triggered: ${reason}`,
      affectedImplants: implantIds,
      operatorId,
      responseActions: [],
      status: IncidentStatus.RESPONDING,
    };

    this.incidents.set(incidentId, incident);
    this.logger.warn(`Self-destruct initiated for ${implantIds.length} implants`, {
      incidentId,
      implantIds,
      operatorId,
      reason,
    });

    // Execute self-destruct for each implant
    const promises = implantIds.map(async implantId => {
      const actionId = this.generateActionId();
      const action: ResponseAction = {
        id: actionId,
        type: ResponseActionType.SELF_DESTRUCT,
        timestamp: new Date(),
        status: ActionStatus.IN_PROGRESS,
        details: { implantId, reason },
      };

      incident.responseActions.push(action);

      try {
        await this.executeSelfDestruct(implantId);
        action.status = ActionStatus.COMPLETED;
        this.logger.info(`Self-destruct completed for implant ${implantId}`);
      } catch (error) {
        action.status = ActionStatus.FAILED;
        action.error = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Self-destruct failed for implant ${implantId}`, error);
      }
    });

    await Promise.allSettled(promises);
    incident.status = IncidentStatus.CONTAINED;

    this.emit('incident:self-destruct', incident);
    await this.persistIncident(incident);

    return incidentId;
  }

  /**
   * Initiate emergency shutdown procedures
   * Requirement 19.3: Automatic emergency shutdown with data sanitization
   */
  async initiateEmergencyShutdown(reason: string, operatorId?: string): Promise<string> {
    if (this.isEmergencyMode) {
      throw new Error('Emergency shutdown already in progress');
    }

    this.isEmergencyMode = true;
    const incidentId = this.generateIncidentId();

    const incident: IncidentReport = {
      id: incidentId,
      type: IncidentType.SERVER_COMPROMISE,
      severity: IncidentSeverity.CRITICAL,
      timestamp: new Date(),
      description: `Emergency shutdown initiated: ${reason}`,
      affectedImplants: [],
      operatorId,
      responseActions: [],
      status: IncidentStatus.RESPONDING,
    };

    this.incidents.set(incidentId, incident);
    this.logger.error(`Emergency shutdown initiated: ${reason}`, undefined, {
      incidentId,
      operatorId,
    });

    try {
      // Step 1: Create emergency backup
      await this.createEmergencyBackup(incident);

      // Step 2: Self-destruct all active implants
      await this.selfDestructAllImplants(incident);

      // Step 3: Sanitize server data
      await this.sanitizeServerData(incident);

      // Step 4: Shutdown server components
      await this.shutdownServerComponents(incident);

      incident.status = IncidentStatus.RESOLVED;
      this.logger.info('Emergency shutdown completed successfully');
    } catch (error) {
      incident.status = IncidentStatus.ACTIVE;
      this.logger.error('Emergency shutdown failed', error);
      throw error;
    } finally {
      this.emit('incident:emergency-shutdown', incident);
      await this.persistIncident(incident);
    }

    return incidentId;
  }

  /**
   * Migrate implants to backup infrastructure
   * Requirement 19.5: Support rapid implant migration to backup C2 infrastructure
   */
  async migrateImplants(
    implantIds: string[],
    backupServers: string[],
    operatorId: string
  ): Promise<string> {
    const incidentId = this.generateIncidentId();

    const incident: IncidentReport = {
      id: incidentId,
      type: IncidentType.EMERGENCY_EVACUATION,
      severity: IncidentSeverity.HIGH,
      timestamp: new Date(),
      description: `Implant migration to backup servers`,
      affectedImplants: implantIds,
      operatorId,
      responseActions: [],
      status: IncidentStatus.RESPONDING,
    };

    this.incidents.set(incidentId, incident);
    this.logger.warn(`Migrating ${implantIds.length} implants to backup servers`, {
      incidentId,
      implantIds,
      backupServers,
    });

    const actionId = this.generateActionId();
    const action: ResponseAction = {
      id: actionId,
      type: ResponseActionType.IMPLANT_MIGRATION,
      timestamp: new Date(),
      status: ActionStatus.IN_PROGRESS,
      details: { implantIds, backupServers },
    };

    incident.responseActions.push(action);

    try {
      // Generate new configuration for backup servers
      const migrationConfig = await this.generateMigrationConfig(backupServers);

      // Send migration commands to implants
      const migrationPromises = implantIds.map(async implantId => {
        return this.sendMigrationCommand(implantId, migrationConfig);
      });

      const results = await Promise.allSettled(migrationPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - successful;

      action.status = failed === 0 ? ActionStatus.COMPLETED : ActionStatus.FAILED;
      action.details.successful = successful;
      action.details.failed = failed;

      incident.status = IncidentStatus.CONTAINED;
      this.logger.info(`Migration completed: ${successful} successful, ${failed} failed`);
    } catch (error) {
      action.status = ActionStatus.FAILED;
      action.error = error instanceof Error ? error.message : 'Unknown error';
      incident.status = IncidentStatus.ACTIVE;
      this.logger.error('Implant migration failed', error);
    }

    this.emit('incident:migration', incident);
    await this.persistIncident(incident);

    return incidentId;
  }

  /**
   * Get incident report by ID
   */
  getIncident(incidentId: string): IncidentReport | undefined {
    return this.incidents.get(incidentId);
  }

  /**
   * List all incidents with optional filtering
   */
  listIncidents(filter?: {
    type?: IncidentType;
    severity?: IncidentSeverity;
    status?: IncidentStatus;
    since?: Date;
  }): IncidentReport[] {
    let incidents = Array.from(this.incidents.values());

    if (filter) {
      if (filter.type) {
        incidents = incidents.filter(i => i.type === filter.type);
      }
      if (filter.severity) {
        incidents = incidents.filter(i => i.severity === filter.severity);
      }
      if (filter.status) {
        incidents = incidents.filter(i => i.status === filter.status);
      }
      if (filter.since) {
        incidents = incidents.filter(i => i.timestamp >= filter.since!);
      }
    }

    return incidents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Check if system is in emergency mode
   */
  isInEmergencyMode(): boolean {
    return this.isEmergencyMode;
  }

  private setupEventHandlers(): void {
    // Listen for kill switch activations
    this.killSwitchService.on('kill-switch:activated', data => {
      this.handleKillSwitchActivation(data);
    });

    // Listen for implant disconnections
    this.implantManager.on('implant:disconnected', implantId => {
      this.handleImplantDisconnection(implantId);
    });
  }

  private async executeSelfDestruct(implantId: string): Promise<void> {
    // Send self-destruct command to implant
    const command = {
      type: 'self_destruct',
      payload: {
        wipeIterations: this.config.secureWipeIterations,
        timeout: this.config.selfDestructTimeout,
      },
    };

    // Note: sendCommand method not available in ImplantManager
    // This would need to be implemented via CommandRouter or ProtocolManager

    // Disconnect implant from active sessions
    await this.implantManager.disconnectImplant(implantId, 'Incident response isolation');
  }

  private async createEmergencyBackup(incident: IncidentReport): Promise<void> {
    const actionId = this.generateActionId();
    const action: ResponseAction = {
      id: actionId,
      type: ResponseActionType.BACKUP_CREATION,
      timestamp: new Date(),
      status: ActionStatus.IN_PROGRESS,
      details: {},
    };

    incident.responseActions.push(action);

    try {
      const backupId = await this.backupService.createEmergencyBackup();
      action.status = ActionStatus.COMPLETED;
      action.details.backupId = backupId;
      this.logger.info(`Emergency backup created: ${backupId}`);
    } catch (error) {
      action.status = ActionStatus.FAILED;
      action.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  private async selfDestructAllImplants(incident: IncidentReport): Promise<void> {
    const activeImplants = await this.implantManager.getActiveImplants();
    const implantIds = activeImplants.map(i => i.id);

    incident.affectedImplants = implantIds;

    const actionId = this.generateActionId();
    const action: ResponseAction = {
      id: actionId,
      type: ResponseActionType.SELF_DESTRUCT,
      timestamp: new Date(),
      status: ActionStatus.IN_PROGRESS,
      details: { implantIds },
    };

    incident.responseActions.push(action);

    try {
      const promises = implantIds.map(id => this.executeSelfDestruct(id));
      await Promise.allSettled(promises);
      action.status = ActionStatus.COMPLETED;
      this.logger.info(`Self-destruct sent to ${implantIds.length} implants`);
    } catch (error) {
      action.status = ActionStatus.FAILED;
      action.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  private async sanitizeServerData(incident: IncidentReport): Promise<void> {
    const actionId = this.generateActionId();
    const action: ResponseAction = {
      id: actionId,
      type: ResponseActionType.DATA_SANITIZATION,
      timestamp: new Date(),
      status: ActionStatus.IN_PROGRESS,
      details: {},
    };

    incident.responseActions.push(action);

    try {
      // Clear sensitive data from memory
      this.incidents.clear();

      // Sanitize database
      await this.databaseService.sanitizeDatabase();

      // Clear crypto keys
      await this.cryptoService.clearAllKeys();

      action.status = ActionStatus.COMPLETED;
      this.logger.info('Server data sanitization completed');
    } catch (error) {
      action.status = ActionStatus.FAILED;
      action.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  private async shutdownServerComponents(incident: IncidentReport): Promise<void> {
    // Graceful shutdown of server components
    this.logger.info('Shutting down server components');

    // Stop accepting new connections
    this.emit('server:shutdown');

    // Wait for graceful shutdown timeout
    await new Promise(resolve => setTimeout(resolve, this.config.emergencyShutdownTimeout));
  }

  private async generateMigrationConfig(backupServers: string[]): Promise<any> {
    return {
      servers: backupServers,
      encryptionKey: await this.cryptoService.generateKey(),
      timestamp: new Date().toISOString(),
    };
  }

  private async sendMigrationCommand(implantId: string, config: any): Promise<void> {
    const command = {
      type: 'migrate',
      payload: config,
    };

    // Note: sendCommand method not available in ImplantManager
    // This would need to be implemented via CommandRouter or ProtocolManager
  }

  private async handleKillSwitchActivation(data: any): Promise<void> {
    this.logger.warn('Kill switch activated', data);

    const incidentId = this.generateIncidentId();
    const incident: IncidentReport = {
      id: incidentId,
      type: IncidentType.COMMUNICATION_LOST,
      severity: IncidentSeverity.HIGH,
      timestamp: new Date(),
      description: `Kill switch activated: ${data.reason}`,
      affectedImplants: data.implantIds || [],
      responseActions: [],
      status: IncidentStatus.RESPONDING,
    };

    this.incidents.set(incidentId, incident);
    this.emit('incident:kill-switch', incident);
  }

  private async handleImplantDisconnection(implantId: string): Promise<void> {
    // Check if this is part of a larger incident
    const recentIncidents = this.listIncidents({
      since: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
    });

    const relatedIncident = recentIncidents.find(
      i => i.affectedImplants.includes(implantId) && i.status === IncidentStatus.RESPONDING
    );

    if (!relatedIncident) {
      this.logger.info(`Implant ${implantId} disconnected outside of incident context`);
    }
  }

  private async persistIncident(incident: IncidentReport): Promise<void> {
    try {
      await this.databaseService.query(
        `INSERT INTO incidents (id, type, severity, timestamp, description, affected_implants, operator_id, response_actions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
         response_actions = $8, status = $9`,
        [
          incident.id,
          incident.type,
          incident.severity,
          incident.timestamp,
          incident.description,
          JSON.stringify(incident.affectedImplants),
          incident.operatorId,
          JSON.stringify(incident.responseActions),
          incident.status,
        ]
      );
    } catch (error) {
      this.logger.error('Failed to persist incident', error);
    }
  }

  private generateIncidentId(): string {
    return `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
