/**
 * Audit Integration Tests
 * Tests for audit logging API endpoints and functionality
 */

import request from 'supertest';
import { Express } from 'express';
import { DatabaseConnection } from '../../src/core/database/connection';
import { AuditService } from '../../src/core/audit/audit.service';
import { createTestApp } from '../helpers/test-app';
import { createTestOperator, getAuthToken } from '../helpers/auth-helper';

describe('Audit Integration Tests', () => {
  let app: Express;
  let db: DatabaseConnection;
  let auditService: AuditService;
  let authToken: string;
  let operatorId: string;

  beforeAll(async () => {
    // Initialize test app and database
    app = await createTestApp();
    db = DatabaseConnection.getInstance();
    auditService = AuditService.getInstance();

    // Create test operator and get auth token
    const operator = await createTestOperator('audit-test-operator', 'administrator');
    operatorId = operator.id;
    authToken = await getAuthToken(operator.username, 'password123');
  });

  afterAll(async () => {
    // Clean up test data
    await db.query('DELETE FROM audit_logs WHERE operator_id = $1', [operatorId]);
    await db.query('DELETE FROM operators WHERE id = $1', [operatorId]);
    // Database cleanup handled by test framework
  });

  beforeEach(async () => {
    // Clean up audit logs before each test
    await db.query('DELETE FROM audit_logs');
  });

  describe('GET /api/audit/logs', () => {
    beforeEach(async () => {
      // Create test audit logs
      await auditService.logEvent({
        operatorId,
        action: 'test_action_1',
        resourceType: 'test_resource',
        resourceId: 'resource-1',
        details: { test: 'data1' },
        success: true,
      });

      await auditService.logEvent({
        operatorId,
        action: 'test_action_2',
        resourceType: 'test_resource',
        resourceId: 'resource-2',
        details: { test: 'data2' },
        success: false,
        errorMessage: 'Test error',
      });
    });

    it('should retrieve audit logs with default pagination', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      expect(response.body.pagination).toEqual({
        limit: 100,
        offset: 0,
        totalCount: expect.any(Number),
        hasMore: false,
      });
    });

    it('should filter logs by operator ID', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .query({ operatorId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((log: any) => log.operatorId === operatorId)).toBe(true);
    });

    it('should filter logs by action', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .query({ action: 'test_action_1' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((log: any) => log.action === 'test_action_1')).toBe(true);
    });

    it('should filter logs by success status', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .query({ success: 'false' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((log: any) => log.success === false)).toBe(true);
    });

    it('should filter logs by date range', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get('/api/audit/logs')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .query({
          operatorId: 'invalid-uuid',
          limit: 'invalid-number',
          success: 'invalid-boolean',
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeInstanceOf(Array);
    });

    it('should require authentication', async () => {
      await request(app).get('/api/audit/logs').expect(401);
    });

    it('should enforce pagination limits', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .query({ limit: 2000 }) // Exceeds max limit
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/audit/statistics', () => {
    beforeEach(async () => {
      // Create test audit logs for statistics
      for (let i = 0; i < 10; i++) {
        await auditService.logEvent({
          operatorId,
          action: i % 2 === 0 ? 'login' : 'execute_command',
          resourceType: 'test',
          success: i % 3 !== 0, // Some failures
        });
      }
    });

    it('should return audit statistics', async () => {
      const response = await request(app)
        .get('/api/audit/statistics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        totalLogs: expect.any(Number),
        successfulActions: expect.any(Number),
        failedActions: expect.any(Number),
        uniqueOperators: expect.any(Number),
        topActions: expect.any(Array),
        activityByHour: expect.any(Array),
        errorRate: expect.any(Number),
      });

      expect(response.body.data.activityByHour).toHaveLength(24);
    });

    it('should filter statistics by date range', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .get('/api/audit/statistics')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalLogs).toBeGreaterThanOrEqual(0);
    });

    it('should validate date parameters', async () => {
      const response = await request(app)
        .get('/api/audit/statistics')
        .query({ startDate: 'invalid-date' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/audit/reports/compliance', () => {
    beforeEach(async () => {
      // Create test data for compliance report
      await auditService.logAuthentication(
        operatorId,
        'login',
        {
          username: 'testuser',
          authMethod: 'password',
          sessionId: 'session-1',
        },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      await auditService.logCommandExecution(
        operatorId,
        'implant-1',
        'command-1',
        {
          implantId: 'implant-1',
          command: 'whoami',
          commandType: 'shell',
          executionTime: 100,
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should generate JSON compliance report', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .post('/api/audit/reports/compliance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          startDate,
          endDate,
          format: 'json',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        reportMetadata: {
          generatedAt: expect.any(String),
          periodStart: startDate,
          periodEnd: endDate,
          totalRecords: expect.any(Number),
          format: 'json',
        },
        summary: {
          totalActions: expect.any(Number),
          successfulActions: expect.any(Number),
          failedActions: expect.any(Number),
          errorRate: expect.any(Number),
          uniqueOperators: expect.any(Number),
          topActions: expect.any(Array),
        },
        auditTrail: expect.any(Array),
      });
    });

    it('should generate CSV compliance report', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app)
        .post('/api/audit/reports/compliance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          startDate,
          endDate,
          format: 'csv',
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('Timestamp,Operator,Action');
    });

    it('should validate report parameters', async () => {
      const response = await request(app)
        .post('/api/audit/reports/compliance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          startDate: 'invalid-date',
          endDate: new Date().toISOString(),
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require valid date range', async () => {
      const response = await request(app)
        .post('/api/audit/reports/compliance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          format: 'invalid-format',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/audit/retention/apply', () => {
    it('should apply retention policy', async () => {
      // Create old audit log
      await db.query(
        `INSERT INTO audit_logs (operator_id, action, resource_type, created_at) 
         VALUES ($1, $2, $3, $4)`,
        [operatorId, 'old_action', 'test', new Date(Date.now() - 400 * 24 * 60 * 60 * 1000)]
      );

      const response = await request(app)
        .post('/api/audit/retention/apply')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Applied retention policy');
      expect(response.body.deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should require admin permissions', async () => {
      // Create read-only operator
      const readOnlyOperator = await createTestOperator('readonly-operator', 'read_only');
      const readOnlyToken = await getAuthToken(readOnlyOperator.username, 'password123');

      await request(app)
        .post('/api/audit/retention/apply')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .expect(403);

      // Cleanup
      await db.query('DELETE FROM operators WHERE id = $1', [readOnlyOperator.id]);
    });
  });

  describe('PUT /api/audit/configuration', () => {
    it('should update audit configuration', async () => {
      const response = await request(app)
        .put('/api/audit/configuration')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          enabled: true,
          retentionDays: 180,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        enabled: true,
        retentionDays: 180,
      });
    });

    it('should validate configuration parameters', async () => {
      const response = await request(app)
        .put('/api/audit/configuration')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          enabled: 'invalid-boolean',
          retentionDays: 0,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require admin permissions', async () => {
      const readOnlyOperator = await createTestOperator('readonly-operator-2', 'read_only');
      const readOnlyToken = await getAuthToken(readOnlyOperator.username, 'password123');

      await request(app)
        .put('/api/audit/configuration')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ enabled: false })
        .expect(403);

      // Cleanup
      await db.query('DELETE FROM operators WHERE id = $1', [readOnlyOperator.id]);
    });
  });

  describe('GET /api/audit/configuration', () => {
    it('should return current audit configuration', async () => {
      const response = await request(app)
        .get('/api/audit/configuration')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        enabled: expect.any(Boolean),
        retentionDays: expect.any(Number),
      });
    });
  });

  describe('DELETE /api/audit/cleanup', () => {
    it('should cleanup old audit logs', async () => {
      const response = await request(app)
        .delete('/api/audit/cleanup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ olderThanDays: 30 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Deleted');
      expect(response.body.deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should validate cleanup parameters', async () => {
      const response = await request(app)
        .delete('/api/audit/cleanup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ olderThanDays: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Audit middleware integration', () => {
    it('should automatically log API requests', async () => {
      // Make a request that should be audited
      await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Check if the request was logged
      const logs = await db.query(
        'SELECT * FROM audit_logs WHERE action = $1 AND operator_id = $2',
        ['http_request', operatorId]
      );

      expect(logs.rows.length).toBeGreaterThan(0);
      expect(logs.rows[0].resource_type).toBe('api');
      expect(logs.rows[0].details).toEqual(
        expect.objectContaining({
          method: 'GET',
          path: '/api/implants',
        })
      );
    });

    it('should log authentication attempts', async () => {
      // Make a login request
      await request(app)
        .post('/api/auth/login')
        .send({
          username: 'audit-test-operator',
          password: 'password123',
        })
        .expect(200);

      // Check if authentication was logged
      const logs = await db.query('SELECT * FROM audit_logs WHERE action LIKE $1', ['auth_%']);

      expect(logs.rows.length).toBeGreaterThan(0);
    });
  });
});
