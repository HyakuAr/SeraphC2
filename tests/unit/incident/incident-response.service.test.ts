import {
  IncidentResponseService,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '../../../src/core/incident/incident-response.service';
import { ImplantManager } from '../../../src/core/engine/implant-manager';
import { DatabaseService } from '../../../src/core/database/database.service';
import { CryptoService } from '../../../src/core/crypto/crypto.service';
import { BackupService } from '../../../src/core/incident/backup.service';
import { KillSwitchService } from '../../../src/core/incident/kill-switch.service';

// Mock dependencies
jest.mock('../../../src/core/implant/implant-manager');
jest.mock('../../../src/core/database/database.service');
jest.mock('../../../src/core/crypto/crypto.service');
jest.mock('../../../src/core/incident/backup.service');
jest.mock('../../../src/core/incident/kill-switch.service');

describe('IncidentResponseService', () => {
  let incidentService: IncidentResponseService;
  let mockImplantManager: jest.Mocked<ImplantManager>;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockCryptoService: jest.Mocked<CryptoService>;
  let mockBackupService: jest.Mocked<BackupService>;
  let mockKillSwitchService: jest.Mocked<KillSwitchService>;

  const mockConfig = {
    emergencyShutdownTimeout: 30000,
    selfDestructTimeout: 10000,
    backupRetentionDays: 30,
    secureWipeIterations: 3,
    emergencyContactEndpoints: ['https://emergency.example.com'],
  };

  beforeEach(() => {
    // Create mocked instances
    mockImplantManager = new ImplantManager(
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<ImplantManager>;
    mockDatabaseService = new DatabaseService({} as any) as jest.Mocked<DatabaseService>;
    mockCryptoService = new CryptoService() as jest.Mocked<CryptoService>;
    mockBackupService = new BackupService(
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<BackupService>;
    mockKillSwitchService = new KillSwitchService(
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<KillSwitchService>;

    // Setup default mock implementations
    mockImplantManager.sendCommand = jest.fn().mockResolvedValue(undefined);
    mockImplantManager.removeImplant = jest.fn().mockResolvedValue(undefined);
    mockImplantManager.getActiveImplants = jest.fn().mockResolvedValue([
      { id: 'implant1', hostname: 'test1' },
      { id: 'implant2', hostname: 'test2' },
    ]);

    mockDatabaseService.query = jest.fn().mockResolvedValue({ rows: [] });
    mockDatabaseService.sanitizeDatabase = jest.fn().mockResolvedValue(undefined);

    mockCryptoService.generateKey = jest.fn().mockResolvedValue('test-key');
    mockCryptoService.clearAllKeys = jest.fn().mockResolvedValue(undefined);

    mockBackupService.createEmergencyBackup = jest.fn().mockResolvedValue('backup-123');

    mockKillSwitchService.on = jest.fn();

    // Create service instance
    incidentService = new IncidentResponseService(
      mockConfig,
      mockImplantManager,
      mockDatabaseService,
      mockCryptoService,
      mockBackupService,
      mockKillSwitchService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('triggerSelfDestruct', () => {
    it('should trigger self-destruct for specified implants', async () => {
      const implantIds = ['implant1', 'implant2'];
      const operatorId = 'operator123';
      const reason = 'Detection suspected';

      const incidentId = await incidentService.triggerSelfDestruct(implantIds, operatorId, reason);

      expect(incidentId).toBeDefined();
      expect(incidentId).toMatch(/^incident_/);

      // Verify self-destruct commands were sent
      expect(mockImplantManager.sendCommand).toHaveBeenCalledTimes(2);
      expect(mockImplantManager.sendCommand).toHaveBeenCalledWith('implant1', {
        type: 'self_destruct',
        payload: {
          wipeIterations: mockConfig.secureWipeIterations,
          timeout: mockConfig.selfDestructTimeout,
        },
      });

      // Verify implants were removed
      expect(mockImplantManager.removeImplant).toHaveBeenCalledTimes(2);
      expect(mockImplantManager.removeImplant).toHaveBeenCalledWith('implant1');
      expect(mockImplantManager.removeImplant).toHaveBeenCalledWith('implant2');

      // Verify incident was persisted
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO incidents'),
        expect.arrayContaining([incidentId, IncidentType.DETECTION_SUSPECTED])
      );
    });

    it('should handle self-destruct failures gracefully', async () => {
      const implantIds = ['implant1'];
      const operatorId = 'operator123';
      const reason = 'Test failure';

      // Mock command failure
      mockImplantManager.sendCommand.mockRejectedValueOnce(new Error('Command failed'));

      const incidentId = await incidentService.triggerSelfDestruct(implantIds, operatorId, reason);

      expect(incidentId).toBeDefined();

      // Verify incident was still created and persisted
      expect(mockDatabaseService.query).toHaveBeenCalled();

      // Get the incident to check its status
      const incident = incidentService.getIncident(incidentId);
      expect(incident).toBeDefined();
      expect(incident!.status).toBe(IncidentStatus.CONTAINED);
      expect(incident!.responseActions).toHaveLength(1);
      expect(incident!.responseActions[0].status).toBe('failed');
    });

    it('should emit incident event after self-destruct', async () => {
      const implantIds = ['implant1'];
      const operatorId = 'operator123';
      const reason = 'Test event';

      const eventSpy = jest.fn();
      incidentService.on('incident:self-destruct', eventSpy);

      await incidentService.triggerSelfDestruct(implantIds, operatorId, reason);

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: IncidentType.DETECTION_SUSPECTED,
          affectedImplants: implantIds,
          operatorId,
        })
      );
    });
  });

  describe('initiateEmergencyShutdown', () => {
    it('should perform complete emergency shutdown sequence', async () => {
      const reason = 'Server compromise detected';
      const operatorId = 'admin123';

      const incidentId = await incidentService.initiateEmergencyShutdown(reason, operatorId);

      expect(incidentId).toBeDefined();

      // Verify emergency backup was created
      expect(mockBackupService.createEmergencyBackup).toHaveBeenCalled();

      // Verify all active implants were self-destructed
      expect(mockImplantManager.getActiveImplants).toHaveBeenCalled();
      expect(mockImplantManager.sendCommand).toHaveBeenCalledTimes(2); // For 2 mock implants

      // Verify server data was sanitized
      expect(mockDatabaseService.sanitizeDatabase).toHaveBeenCalled();
      expect(mockCryptoService.clearAllKeys).toHaveBeenCalled();

      // Verify incident was persisted
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO incidents'),
        expect.arrayContaining([incidentId, IncidentType.SERVER_COMPROMISE])
      );

      // Check incident details
      const incident = incidentService.getIncident(incidentId);
      expect(incident).toBeDefined();
      expect(incident!.type).toBe(IncidentType.SERVER_COMPROMISE);
      expect(incident!.severity).toBe(IncidentSeverity.CRITICAL);
      expect(incident!.status).toBe(IncidentStatus.RESOLVED);
    });

    it('should prevent multiple emergency shutdowns', async () => {
      const reason = 'Test multiple shutdowns';

      // First shutdown should succeed
      await incidentService.initiateEmergencyShutdown(reason);

      // Second shutdown should fail
      await expect(incidentService.initiateEmergencyShutdown(reason)).rejects.toThrow(
        'Emergency shutdown already in progress'
      );
    });

    it('should handle emergency shutdown failures', async () => {
      const reason = 'Test failure handling';

      // Mock backup failure
      mockBackupService.createEmergencyBackup.mockRejectedValueOnce(new Error('Backup failed'));

      await expect(incidentService.initiateEmergencyShutdown(reason)).rejects.toThrow(
        'Backup failed'
      );

      // Verify incident was still created with failed status
      const incidents = incidentService.listIncidents({ type: IncidentType.SERVER_COMPROMISE });
      expect(incidents).toHaveLength(1);
      expect(incidents[0].status).toBe(IncidentStatus.ACTIVE);
    });
  });

  describe('migrateImplants', () => {
    it('should migrate implants to backup servers', async () => {
      const implantIds = ['implant1', 'implant2'];
      const backupServers = ['https://backup1.example.com', 'https://backup2.example.com'];
      const operatorId = 'operator123';

      const incidentId = await incidentService.migrateImplants(
        implantIds,
        backupServers,
        operatorId
      );

      expect(incidentId).toBeDefined();

      // Verify migration commands were sent
      expect(mockImplantManager.sendCommand).toHaveBeenCalledTimes(2);
      expect(mockImplantManager.sendCommand).toHaveBeenCalledWith('implant1', {
        type: 'migrate',
        payload: expect.objectContaining({
          servers: backupServers,
        }),
      });

      // Check incident details
      const incident = incidentService.getIncident(incidentId);
      expect(incident).toBeDefined();
      expect(incident!.type).toBe(IncidentType.EMERGENCY_EVACUATION);
      expect(incident!.affectedImplants).toEqual(implantIds);
      expect(incident!.status).toBe(IncidentStatus.CONTAINED);
    });

    it('should handle partial migration failures', async () => {
      const implantIds = ['implant1', 'implant2'];
      const backupServers = ['https://backup.example.com'];
      const operatorId = 'operator123';

      // Mock one command failure
      mockImplantManager.sendCommand
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Migration failed'));

      const incidentId = await incidentService.migrateImplants(
        implantIds,
        backupServers,
        operatorId
      );

      const incident = incidentService.getIncident(incidentId);
      expect(incident).toBeDefined();
      expect(incident!.responseActions[0].details.successful).toBe(1);
      expect(incident!.responseActions[0].details.failed).toBe(1);
    });
  });

  describe('incident management', () => {
    it('should list incidents with filtering', async () => {
      // Create test incidents
      await incidentService.triggerSelfDestruct(['implant1'], 'op1', 'Test 1');
      await incidentService.migrateImplants(['implant2'], ['https://backup.com'], 'op2');

      // List all incidents
      const allIncidents = incidentService.listIncidents();
      expect(allIncidents).toHaveLength(2);

      // Filter by type
      const selfDestructIncidents = incidentService.listIncidents({
        type: IncidentType.DETECTION_SUSPECTED,
      });
      expect(selfDestructIncidents).toHaveLength(1);
      expect(selfDestructIncidents[0].type).toBe(IncidentType.DETECTION_SUSPECTED);

      // Filter by severity
      const highSeverityIncidents = incidentService.listIncidents({
        severity: IncidentSeverity.HIGH,
      });
      expect(highSeverityIncidents).toHaveLength(2);
    });

    it('should get incident by ID', async () => {
      const incidentId = await incidentService.triggerSelfDestruct(['implant1'], 'op1', 'Test');

      const incident = incidentService.getIncident(incidentId);
      expect(incident).toBeDefined();
      expect(incident!.id).toBe(incidentId);
      expect(incident!.type).toBe(IncidentType.DETECTION_SUSPECTED);
    });

    it('should return undefined for non-existent incident', () => {
      const incident = incidentService.getIncident('non-existent');
      expect(incident).toBeUndefined();
    });

    it('should check emergency mode status', async () => {
      expect(incidentService.isInEmergencyMode()).toBe(false);

      await incidentService.initiateEmergencyShutdown('Test emergency mode');

      expect(incidentService.isInEmergencyMode()).toBe(true);
    });
  });

  describe('event handling', () => {
    it('should handle kill switch activations', async () => {
      const killSwitchData = {
        activationId: 'activation123',
        implantId: 'implant1',
        timerId: 'timer123',
        reason: 'Communication timeout',
      };

      // Simulate kill switch activation
      const eventHandler = mockKillSwitchService.on.mock.calls.find(
        call => call[0] === 'kill-switch:activated'
      )?.[1];

      expect(eventHandler).toBeDefined();

      if (eventHandler) {
        eventHandler(killSwitchData);

        // Verify incident was created
        const incidents = incidentService.listIncidents({
          type: IncidentType.COMMUNICATION_LOST,
        });
        expect(incidents).toHaveLength(1);
        expect(incidents[0].description).toContain('Kill switch activated');
      }
    });

    it('should handle implant disconnections', async () => {
      const implantId = 'implant1';

      // Simulate implant disconnection
      const eventHandler = mockImplantManager.on.mock.calls.find(
        call => call[0] === 'implant:disconnected'
      )?.[1];

      expect(eventHandler).toBeDefined();

      if (eventHandler) {
        eventHandler(implantId);
        // This should not create an incident unless it's part of a larger incident
        // The test verifies the handler exists and can be called
      }
    });
  });

  describe('error handling', () => {
    it('should handle database persistence failures gracefully', async () => {
      mockDatabaseService.query.mockRejectedValueOnce(new Error('Database error'));

      // Should not throw even if persistence fails
      const incidentId = await incidentService.triggerSelfDestruct(['implant1'], 'op1', 'Test');
      expect(incidentId).toBeDefined();
    });

    it('should handle crypto service failures during emergency shutdown', async () => {
      mockCryptoService.clearAllKeys.mockRejectedValueOnce(new Error('Crypto error'));

      await expect(
        incidentService.initiateEmergencyShutdown('Test crypto failure')
      ).rejects.toThrow('Crypto error');
    });
  });
});
