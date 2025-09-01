import request from 'supertest';
import { Express } from 'express';
import { createTestApp } from '../helpers/test-app';
import { DatabaseService } from '../../src/core/database/database.service';
import {
  IncidentResponseService,
  IncidentType,
  IncidentSeverity,
} from '../../src/core/incident/incident-response.service';
import { KillSwitchService } from '../../src/core/incident/kill-switch.service';
import { BackupService, BackupType } from '../../src/core/incident/backup.service';
import { AuthService } from '../../src/core/auth/auth.service';

describe('Incident Response Integration Tests', () => {
  let app: Express;
  let databaseService: DatabaseService;
  let incidentService: IncidentResponseService;
  let killSwitchService: KillSwitchService;
  let backupService: BackupService;
  let authService: AuthService;
  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Get service instances
    databaseService = app.get('databaseService');
    incidentService = app.get('incidentService');
    killSwitchService = app.get('killSwitchService');
    backupService = app.get('backupService');
    authService = app.get('authService');

    // Create test users and get tokens
    const adminUser = await authService.createOperator(
      'admin',
      'admin@test.com',
      'password123',
      'administrator' as any
    );

    const operatorUser = await authService.createOperator(
      'operator',
      'operator@test.com',
      'password123',
      'operator' as any
    );

    const readOnlyUser = await authService.createOperator(
      'readonly',
      'readonly@test.com',
      'password123',
      'read-only' as any
    );

    // Generate tokens using JWT utils directly for testing
    const { JwtUtils } = await import('../../src/core/auth/jwt.utils');

    if (adminUser.success && adminUser.operatorId) {
      const tokens = JwtUtils.generateTokenPair(
        adminUser.operatorId,
        'admin',
        'administrator' as any
      );
      adminToken = tokens.accessToken;
    }

    if (operatorUser.success && operatorUser.operatorId) {
      const tokens = JwtUtils.generateTokenPair(
        operatorUser.operatorId,
        'operator',
        'operator' as any
      );
      operatorToken = tokens.accessToken;
    }

    if (readOnlyUser.success && readOnlyUser.operatorId) {
      const tokens = JwtUtils.generateTokenPair(
        readOnlyUser.operatorId,
        'readonly',
        'read-only' as any
      );
      readOnlyToken = tokens.accessToken;
    }

    // Start kill switch service
    killSwitchService.start();
  });

  afterAll(async () => {
    killSwitchService.stop();
    await databaseService.close();
  });

  beforeEach(async () => {
    // Clean up incidents and related data before each test
    await databaseService.query('DELETE FROM incidents');
    await databaseService.query('DELETE FROM kill_switch_timers');
    await databaseService.query('DELETE FROM kill_switch_activations');
    await databaseService.query('DELETE FROM backup_metadata');
  });

  describe('Self-Destruct Operations', () => {
    it('should trigger self-destruct for implants', async () => {
      const response = await request(app)
        .post('/api/incident/self-destruct')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantIds: ['implant1', 'implant2'],
          reason: 'Detection suspected in test environment',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.incidentId).toBeDefined();
      expect(response.body.message).toContain('Self-destruct initiated for 2 implants');

      // Verify incident was created in database
      const incidents = await databaseService.query('SELECT * FROM incidents WHERE id = $1', [
        response.body.incidentId,
      ]);

      expect(incidents.rows).toHaveLength(1);
      expect(incidents.rows[0].type).toBe(IncidentType.DETECTION_SUSPECTED);
      expect(incidents.rows[0].severity).toBe(IncidentSeverity.HIGH);
    });

    it('should require operator role for self-destruct', async () => {
      const response = await request(app)
        .post('/api/incident/self-destruct')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({
          implantIds: ['implant1'],
          reason: 'Test unauthorized access',
        });

      expect(response.status).toBe(403);
    });

    it('should validate self-destruct request parameters', async () => {
      const response = await request(app)
        .post('/api/incident/self-destruct')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantIds: 'not-an-array',
          reason: '',
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Emergency Shutdown Operations', () => {
    it('should initiate emergency shutdown with valid confirmation', async () => {
      // Set emergency shutdown code for test
      process.env['EMERGENCY_SHUTDOWN_CODE'] = 'TEST_EMERGENCY_123';

      const response = await request(app)
        .post('/api/incident/emergency-shutdown')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Server compromise detected in test',
          confirmationCode: 'TEST_EMERGENCY_123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.incidentId).toBeDefined();

      // Verify incident was created
      const incidents = await databaseService.query('SELECT * FROM incidents WHERE id = $1', [
        response.body.incidentId,
      ]);

      expect(incidents.rows).toHaveLength(1);
      expect(incidents.rows[0].type).toBe(IncidentType.SERVER_COMPROMISE);
      expect(incidents.rows[0].severity).toBe(IncidentSeverity.CRITICAL);
    });

    it('should reject emergency shutdown with invalid confirmation code', async () => {
      const response = await request(app)
        .post('/api/incident/emergency-shutdown')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Test invalid code',
          confirmationCode: 'INVALID_CODE',
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid confirmation code');
    });

    it('should require administrator role for emergency shutdown', async () => {
      const response = await request(app)
        .post('/api/incident/emergency-shutdown')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          reason: 'Test unauthorized',
          confirmationCode: 'TEST_CODE',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Implant Migration Operations', () => {
    it('should migrate implants to backup servers', async () => {
      const response = await request(app)
        .post('/api/incident/migrate-implants')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantIds: ['implant1', 'implant2'],
          backupServers: ['https://backup1.example.com', 'https://backup2.example.com'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.incidentId).toBeDefined();

      // Verify incident was created
      const incidents = await databaseService.query('SELECT * FROM incidents WHERE id = $1', [
        response.body.incidentId,
      ]);

      expect(incidents.rows).toHaveLength(1);
      expect(incidents.rows[0].type).toBe(IncidentType.EMERGENCY_EVACUATION);
    });

    it('should validate backup server URLs', async () => {
      const response = await request(app)
        .post('/api/incident/migrate-implants')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantIds: ['implant1'],
          backupServers: ['not-a-url', 'also-not-a-url'],
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('Incident Management', () => {
    let testIncidentId: string;

    beforeEach(async () => {
      // Create a test incident
      testIncidentId = await incidentService.triggerSelfDestruct(
        ['test-implant'],
        'test-operator',
        'Test incident for management tests'
      );
    });

    it('should get incident details', async () => {
      const response = await request(app)
        .get(`/api/incident/${testIncidentId}`)
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.incident).toBeDefined();
      expect(response.body.incident.id).toBe(testIncidentId);
      expect(response.body.incident.type).toBe(IncidentType.DETECTION_SUSPECTED);
    });

    it('should return 404 for non-existent incident', async () => {
      const response = await request(app)
        .get('/api/incident/non-existent-id')
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Incident not found');
    });

    it('should list incidents with filtering', async () => {
      // Create additional incidents of different types
      await incidentService.migrateImplants(
        ['implant2'],
        ['https://backup.example.com'],
        'test-operator'
      );

      const response = await request(app)
        .get('/api/incident')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .query({ type: IncidentType.DETECTION_SUSPECTED });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.incidents).toBeDefined();
      expect(response.body.incidents).toHaveLength(1);
      expect(response.body.incidents[0].type).toBe(IncidentType.DETECTION_SUSPECTED);
    });

    it('should list all incidents without filtering', async () => {
      const response = await request(app)
        .get('/api/incident')
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.incidents).toHaveLength(1);
    });
  });

  describe('Kill Switch Management', () => {
    it('should create kill switch timer', async () => {
      const response = await request(app)
        .post('/api/incident/kill-switch/timer')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantId: 'test-implant',
          timeout: 300000, // 5 minutes
          reason: 'Test timer creation',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.timerId).toBeDefined();

      // Verify timer was created in database
      const timers = await databaseService.query('SELECT * FROM kill_switch_timers WHERE id = $1', [
        response.body.timerId,
      ]);

      expect(timers.rows).toHaveLength(1);
      expect(timers.rows[0].implant_id).toBe('test-implant');
      expect(timers.rows[0].timeout).toBe('300000');
    });

    it('should cancel kill switch timer', async () => {
      // Create timer first
      const timerId = killSwitchService.createTimer('test-implant', 300000, 'Test timer');

      const response = await request(app)
        .delete(`/api/incident/kill-switch/timer/${timerId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ reason: 'Test cancellation' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify timer was cancelled
      const timer = killSwitchService.getTimer(timerId);
      expect(timer?.isActive).toBe(false);
    });

    it('should return 404 when cancelling non-existent timer', async () => {
      const response = await request(app)
        .delete('/api/incident/kill-switch/timer/non-existent')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Timer not found');
    });

    it('should list active kill switch timers', async () => {
      // Create test timers
      killSwitchService.createTimer('implant1', 300000, 'Timer 1');
      killSwitchService.createTimer('implant2', 600000, 'Timer 2');

      const response = await request(app)
        .get('/api/incident/kill-switch/timers')
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.timers).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });
  });

  describe('Backup Management', () => {
    it('should create emergency backup', async () => {
      const response = await request(app)
        .post('/api/incident/backup/emergency')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          description: 'Test emergency backup',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.backupId).toBeDefined();

      // Verify backup metadata was created
      const backups = await databaseService.query('SELECT * FROM backup_metadata WHERE id = $1', [
        response.body.backupId,
      ]);

      expect(backups.rows).toHaveLength(1);
      expect(backups.rows[0].type).toBe(BackupType.EMERGENCY);
    });

    it('should list backups with optional filtering', async () => {
      // Create test backup
      await backupService.createEmergencyBackup('Test backup');

      const response = await request(app)
        .get('/api/incident/backup')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .query({ type: BackupType.EMERGENCY });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.backups).toHaveLength(1);
      expect(response.body.backups[0].type).toBe(BackupType.EMERGENCY);
    });

    it('should restore from backup (administrator only)', async () => {
      // Create test backup
      const backupId = await backupService.createEmergencyBackup('Test backup for restore');

      const response = await request(app)
        .post(`/api/incident/backup/${backupId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          overwriteExisting: true,
          validateIntegrity: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.result).toBeDefined();
    });

    it('should require administrator role for backup restoration', async () => {
      const backupId = await backupService.createEmergencyBackup('Test backup');

      const response = await request(app)
        .post(`/api/incident/backup/${backupId}/restore`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          overwriteExisting: true,
          validateIntegrity: false,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('System Status', () => {
    it('should get incident response system status', async () => {
      // Create some test data
      await incidentService.triggerSelfDestruct(['implant1'], 'operator', 'Test status');
      killSwitchService.createTimer('implant2', 300000, 'Test timer');
      await backupService.createEmergencyBackup('Test backup');

      const response = await request(app)
        .get('/api/incident/status')
        .set('Authorization', `Bearer ${readOnlyToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBeDefined();
      expect(response.body.status.emergencyMode).toBe(false);
      expect(response.body.status.activeIncidents).toBe(0); // Incident should be contained
      expect(response.body.status.activeTimers).toBe(1);
      expect(response.body.status.recentBackups).toHaveLength(1);
      expect(response.body.status.systemHealth).toBeDefined();
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      const response = await request(app).get('/api/incident/status');

      expect(response.status).toBe(401);
    });

    it('should enforce role-based access control', async () => {
      // Read-only user should not be able to create timers
      const response = await request(app)
        .post('/api/incident/kill-switch/timer')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({
          implantId: 'test-implant',
          timeout: 300000,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Audit Logging', () => {
    it('should log incident response actions', async () => {
      await request(app)
        .post('/api/incident/self-destruct')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantIds: ['implant1'],
          reason: 'Test audit logging',
        });

      // Verify audit log was created
      const auditLogs = await databaseService.query('SELECT * FROM audit_logs WHERE action = $1', [
        'incident:self-destruct',
      ]);

      expect(auditLogs.rows).toHaveLength(1);
      expect(auditLogs.rows[0].details).toContain('implant1');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Mock a service error by providing invalid data that would cause internal error
      const response = await request(app)
        .post('/api/incident/migrate-implants')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantIds: [], // Empty array might cause issues
          backupServers: ['https://backup.example.com'],
        });

      // Should handle gracefully, not crash
      expect(response.status).toBeLessThan(500);
    });

    it('should validate request parameters', async () => {
      const response = await request(app)
        .post('/api/incident/kill-switch/timer')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          implantId: '', // Invalid empty string
          timeout: -1000, // Invalid negative timeout
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });
});
