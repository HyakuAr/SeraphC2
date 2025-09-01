/**
 * End-to-end workflow tests
 * Tests complete user workflows and system integration
 */

import request from 'supertest';
import { Application } from 'express';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { SeraphC2Server } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';

describe('End-to-End Workflow Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let operatorRepository: PostgresOperatorRepository;
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    // Setup test containers
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    operatorRepository = new PostgresOperatorRepository();

    // Create server instance
    server = new SeraphC2Server(
      {
        port: 0,
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        enableRequestLogging: false,
      },
      operatorRepository
    );

    app = server.getApp();

    // Setup test data and authentication
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await resetTestData();
    await setupTestEnvironment();
  });

  afterAll(async () => {
    const testContainers = getTestContainers();
    await testContainers.cleanup();
  });

  async function setupTestEnvironment() {
    const testContainers = getTestContainers();
    const seedData = await testContainers.seedData();

    // Get authentication tokens by logging in
    const authService = server.getAuthService();
    const adminOperator = seedData.operators.find(op => op.role === 'administrator');
    const regularOperator = seedData.operators.find(op => op.role === 'operator');

    if (adminOperator) {
      const adminLoginResult = await authService.login({
        username: adminOperator.username,
        password: 'admin123', // Use test password
      });
      if (adminLoginResult.success && adminLoginResult.tokens) {
        adminToken = adminLoginResult.tokens.accessToken;
      }
    }

    if (regularOperator) {
      const operatorLoginResult = await authService.login({
        username: regularOperator.username,
        password: 'operator123', // Use test password
      });
      if (operatorLoginResult.success && operatorLoginResult.tokens) {
        operatorToken = operatorLoginResult.tokens.accessToken;
      }
    }
  }

  describe('Complete User Authentication Workflow', () => {
    it('should handle complete login workflow', async () => {
      // Test login endpoint
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin123',
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.operator).toBeDefined();
      expect(loginResponse.body.operator.username).toBe('admin');

      // Test authenticated endpoint access
      const profileResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.operator.username).toBe('admin');
    });

    it('should handle invalid login attempts', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should handle token refresh workflow', async () => {
      // Login first
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin123',
        })
        .expect(200);

      // Test token refresh
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(refreshResponse.body.success).toBe(true);
      expect(refreshResponse.body.token).toBeDefined();
      expect(refreshResponse.body.token).not.toBe(loginResponse.body.token);
    });
  });

  describe('Implant Management Workflow', () => {
    it('should handle complete implant lifecycle', async () => {
      // List implants
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(Array.isArray(listResponse.body.data)).toBe(true);

      // Get specific implant
      if (listResponse.body.data.length > 0) {
        const implantId = listResponse.body.data[0].id;
        const getResponse = await request(app)
          .get(`/api/implants/${implantId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(getResponse.body.success).toBe(true);
        expect(getResponse.body.data.id).toBe(implantId);
      }

      // Create new implant
      const createResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test-e2e-implant',
          hostname: 'e2e-test.local',
          ip_address: '192.168.1.200',
          operating_system: 'Windows 11',
          architecture: 'x64',
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.name).toBe('test-e2e-implant');

      const newImplantId = createResponse.body.data.id;

      // Update implant
      const updateResponse = await request(app)
        .put(`/api/implants/${newImplantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'active',
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.status).toBe('active');

      // Delete implant
      await request(app)
        .delete(`/api/implants/${newImplantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should enforce role-based access for implant operations', async () => {
      // Regular operator should be able to view implants
      await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      // But should not be able to delete implants (assuming RBAC is configured)
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      if (listResponse.body.data.length > 0) {
        const implantId = listResponse.body.data[0].id;
        await request(app)
          .delete(`/api/implants/${implantId}`)
          .set('Authorization', `Bearer ${operatorToken}`)
          .expect(403);
      }
    });
  });

  describe('Command Execution Workflow', () => {
    it('should handle complete command execution lifecycle', async () => {
      // Get available implants
      const implantsResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(implantsResponse.body.data.length).toBeGreaterThan(0);
      const implantId = implantsResponse.body.data[0].id;

      // Execute command
      const executeResponse = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          implant_id: implantId,
          command: 'whoami',
        })
        .expect(201);

      expect(executeResponse.body.success).toBe(true);
      expect(executeResponse.body.data.command).toBe('whoami');
      expect(executeResponse.body.data.status).toBe('pending');

      const commandId = executeResponse.body.data.id;

      // Check command status
      const statusResponse = await request(app)
        .get(`/api/commands/${commandId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.id).toBe(commandId);

      // List commands for implant
      const listResponse = await request(app)
        .get(`/api/commands?implant_id=${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(Array.isArray(listResponse.body.data)).toBe(true);
      expect(listResponse.body.data.some((cmd: any) => cmd.id === commandId)).toBe(true);
    });

    it('should handle command execution with invalid implant', async () => {
      const response = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          implant_id: '00000000-0000-0000-0000-000000000000',
          command: 'whoami',
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Implant not found');
    });
  });

  describe('File Operations Workflow', () => {
    it('should handle file upload and download workflow', async () => {
      // Get available implants
      const implantsResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(implantsResponse.body.data.length).toBeGreaterThan(0);
      const implantId = implantsResponse.body.data[0].id;

      // Upload file
      const uploadResponse = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('implant_id', implantId)
        .field('destination_path', '/tmp/test-file.txt')
        .attach('file', Buffer.from('test file content'), 'test-file.txt')
        .expect(201);

      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data.filename).toBe('test-file.txt');

      const fileId = uploadResponse.body.data.id;

      // List files
      const listResponse = await request(app)
        .get(`/api/files?implant_id=${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(Array.isArray(listResponse.body.data)).toBe(true);

      // Download file
      const downloadResponse = await request(app)
        .get(`/api/files/${fileId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(downloadResponse.text).toBe('test file content');
    });
  });

  describe('Task Scheduling Workflow', () => {
    it('should handle task creation and execution workflow', async () => {
      // Get available implants
      const implantsResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(implantsResponse.body.data.length).toBeGreaterThan(0);
      const implantId = implantsResponse.body.data[0].id;

      // Create scheduled task
      const createResponse = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test Task',
          description: 'End-to-end test task',
          command: 'echo "Hello from scheduled task"',
          implant_id: implantId,
          priority: 5,
          scheduled_at: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.name).toBe('E2E Test Task');
      expect(createResponse.body.data.status).toBe('pending');

      const taskId = createResponse.body.data.id;

      // Get task details
      const getResponse = await request(app)
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.id).toBe(taskId);

      // List tasks
      const listResponse = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(Array.isArray(listResponse.body.data)).toBe(true);
      expect(listResponse.body.data.some((task: any) => task.id === taskId)).toBe(true);

      // Cancel task
      const cancelResponse = await request(app)
        .put(`/api/tasks/${taskId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);
      expect(cancelResponse.body.data.status).toBe('cancelled');
    });
  });

  describe('Audit and Monitoring Workflow', () => {
    it('should handle audit log retrieval workflow', async () => {
      // Perform some auditable actions first
      await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          implant_id: '660e8400-e29b-41d4-a716-446655440001',
          command: 'audit-test-command',
        })
        .expect(201);

      // Retrieve audit logs
      const auditResponse = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(auditResponse.body.success).toBe(true);
      expect(Array.isArray(auditResponse.body.data)).toBe(true);
      expect(auditResponse.body.data.length).toBeGreaterThan(0);

      // Check for specific audit entries
      const commandAudit = auditResponse.body.data.find(
        (log: any) =>
          log.action === 'command_executed' && log.details?.command === 'audit-test-command'
      );
      expect(commandAudit).toBeDefined();
    });

    it('should handle health check workflow', async () => {
      const healthResponse = await request(app).get('/api/health').expect(200);

      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.timestamp).toBeDefined();
      expect(healthResponse.body.services).toBeDefined();
      expect(healthResponse.body.services.database).toBe('healthy');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle unauthorized access attempts', async () => {
      // Test without token
      await request(app).get('/api/implants').expect(401);

      // Test with invalid token
      await request(app)
        .get('/api/implants')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should handle malformed requests', async () => {
      // Test with malformed JSON
      const response = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle resource not found scenarios', async () => {
      // Test non-existent implant
      await request(app)
        .get('/api/implants/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      // Test non-existent command
      await request(app)
        .get('/api/commands/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
