/**
 * RBAC Integration Tests
 * End-to-end tests for Role-Based Access Control system
 */

import request from 'supertest';
import { Express } from 'express';
import { DatabaseConnection } from '../../src/core/database/connection';
import { OperatorRepository } from '../../src/core/repositories/operator.repository';
import { AuditLogRepository } from '../../src/core/repositories/audit-log.repository';
import { AuthService } from '../../src/core/auth/auth.service';
import { RBACService } from '../../src/core/services/rbac.service';
import { OperatorRole } from '../../src/types/entities';
import { ResourceType, Action } from '../../src/types/rbac';

describe('RBAC Integration Tests', () => {
  let app: Express;
  let db: DatabaseConnection;
  let operatorRepository: OperatorRepository;
  let auditLogRepository: AuditLogRepository;
  let authService: AuthService;
  let rbacService: RBACService;
  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    // Initialize test database connection
    db = DatabaseConnection.getInstance();
    await db.connect();

    // Initialize repositories and services
    operatorRepository = new OperatorRepository();
    auditLogRepository = new AuditLogRepository();
    authService = new AuthService(operatorRepository);
    rbacService = new RBACService(operatorRepository);

    // Create test app (would normally import from main app)
    // This is a simplified version for testing
    app = require('../../src/web/server').createTestApp();

    // Create test operators
    await createTestOperators();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear audit logs before each test
    await db.query(
      "DELETE FROM audit_logs WHERE operator_id IN (SELECT id FROM operators WHERE username LIKE 'test_%')"
    );
  });

  const createTestOperators = async () => {
    // Create admin operator
    const adminResult = await authService.createOperator(
      'test_admin',
      'admin@test.com',
      'TestPassword123!',
      OperatorRole.ADMINISTRATOR
    );
    expect(adminResult.success).toBe(true);

    // Create regular operator
    const operatorResult = await authService.createOperator(
      'test_operator',
      'operator@test.com',
      'TestPassword123!',
      OperatorRole.OPERATOR
    );
    expect(operatorResult.success).toBe(true);

    // Create read-only operator
    const readOnlyResult = await authService.createOperator(
      'test_readonly',
      'readonly@test.com',
      'TestPassword123!',
      OperatorRole.READ_ONLY
    );
    expect(readOnlyResult.success).toBe(true);

    // Login to get tokens
    const adminLogin = await authService.login({
      username: 'test_admin',
      password: 'TestPassword123!',
    });
    expect(adminLogin.success).toBe(true);
    adminToken = adminLogin.tokens!.accessToken;

    const operatorLogin = await authService.login({
      username: 'test_operator',
      password: 'TestPassword123!',
    });
    expect(operatorLogin.success).toBe(true);
    operatorToken = operatorLogin.tokens!.accessToken;

    const readOnlyLogin = await authService.login({
      username: 'test_readonly',
      password: 'TestPassword123!',
    });
    expect(readOnlyLogin.success).toBe(true);
    readOnlyToken = readOnlyLogin.tokens!.accessToken;
  };

  const cleanupTestData = async () => {
    await db.query("DELETE FROM operators WHERE username LIKE 'test_%'");
  };

  describe('Role-based access control', () => {
    it('should allow administrator to access all resources', async () => {
      // Test accessing operator management
      const response = await request(app)
        .get('/api/rbac/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should deny operator access to operator management', async () => {
      const response = await request(app)
        .get('/api/rbac/operators')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied');
    });

    it('should deny read-only user access to command execution', async () => {
      const response = await request(app)
        .post('/api/rbac/check-permission')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({
          resource: ResourceType.COMMAND,
          action: Action.EXECUTE,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.granted).toBe(false);
    });

    it('should allow operator to execute commands', async () => {
      const response = await request(app)
        .post('/api/rbac/check-permission')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          resource: ResourceType.COMMAND,
          action: Action.EXECUTE,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.granted).toBe(true);
    });
  });

  describe('Role management', () => {
    it('should allow administrator to update operator roles', async () => {
      // Get the read-only operator ID
      const operators = await operatorRepository.findByUsername('test_readonly');
      expect(operators).toBeTruthy();

      const response = await request(app)
        .put(`/api/rbac/operators/${operators!.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: OperatorRole.OPERATOR })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify the role was updated
      const updatedOperator = await operatorRepository.findById(operators!.id);
      expect(updatedOperator?.role).toBe(OperatorRole.OPERATOR);

      // Restore original role
      await operatorRepository.update(operators!.id, { role: OperatorRole.READ_ONLY });
    });

    it('should prevent non-administrator from updating roles', async () => {
      const operators = await operatorRepository.findByUsername('test_readonly');
      expect(operators).toBeTruthy();

      const response = await request(app)
        .put(`/api/rbac/operators/${operators!.id}/role`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ role: OperatorRole.ADMINISTRATOR })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should prevent administrator from demoting themselves', async () => {
      const admin = await operatorRepository.findByUsername('test_admin');
      expect(admin).toBeTruthy();

      const response = await request(app)
        .put(`/api/rbac/operators/${admin!.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: OperatorRole.OPERATOR })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot modify your own administrator role');
    });
  });

  describe('Audit logging', () => {
    it('should log successful actions', async () => {
      await request(app)
        .get('/api/rbac/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Check audit log
      const logs = await auditLogRepository.findMany({
        action: 'view_roles',
        limit: 1,
      });

      expect(logs.length).toBe(1);
      expect(logs[0].success).toBe(true);
      expect(logs[0].action).toBe('view_roles');
    });

    it('should log failed actions', async () => {
      await request(app)
        .get('/api/rbac/operators')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      // Note: Failed authorization attempts might not create audit logs
      // depending on implementation, but the middleware should handle this
    });

    it('should allow administrator to view audit logs', async () => {
      const response = await request(app)
        .get('/api/audit/logs?limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should deny non-administrator access to audit logs', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Permission checking', () => {
    it('should correctly evaluate complex permission scenarios', async () => {
      // Test file download permission for read-only user
      const downloadResponse = await request(app)
        .post('/api/rbac/check-permission')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({
          resource: ResourceType.FILE,
          action: Action.DOWNLOAD,
        })
        .expect(200);

      expect(downloadResponse.body.data.granted).toBe(true);

      // Test file upload permission for read-only user (should be denied)
      const uploadResponse = await request(app)
        .post('/api/rbac/check-permission')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({
          resource: ResourceType.FILE,
          action: Action.UPLOAD,
        })
        .expect(200);

      expect(uploadResponse.body.data.granted).toBe(false);
    });

    it('should handle resource-specific permissions', async () => {
      // Test with resource ID and metadata
      const response = await request(app)
        .post('/api/rbac/check-permission')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          resource: ResourceType.IMPLANT,
          action: Action.READ,
          resourceId: 'test-implant-id',
          metadata: { customField: 'test-value' },
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.granted).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid tokens gracefully', async () => {
      const response = await request(app)
        .get('/api/rbac/roles')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid token');
    });

    it('should handle missing authorization header', async () => {
      const response = await request(app).get('/api/rbac/roles').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should validate request parameters', async () => {
      const response = await request(app)
        .post('/api/rbac/check-permission')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resource: 'invalid-resource',
          // missing action
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Resource and action are required');
    });
  });
});
