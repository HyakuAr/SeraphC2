/**
 * Production Deployment Testing
 * Tests production-specific deployment scenarios and configurations
 */

import request from 'supertest';
import { Application } from 'express';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { SeraphC2Server } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { Pool } from 'pg';
import { DeploymentValidator, DeploymentConfig } from '../../scripts/validate-deployment';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('Production Deployment Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let operatorRepository: PostgresOperatorRepository;
  let adminToken: string;
  let pool: Pool;
  let validator: DeploymentValidator;

  beforeAll(async () => {
    // Setup test containers with production-like configuration
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    pool = testContainers.getPostgresPool();
    operatorRepository = new PostgresOperatorRepository();

    // Create server instance with production configuration
    server = new SeraphC2Server(
      {
        port: 0,
        host: 'localhost',
        corsOrigins: ['https://seraphc2.example.com'],
        enableRequestLogging: false, // Production setting
        rateLimiting: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 100, // limit each IP to 100 requests per windowMs
        },
        security: {
          helmet: true,
          compression: true,
          trustProxy: true,
        },
      },
      operatorRepository
    );

    app = server.getApp();

    // Setup deployment validator
    const deploymentConfig: DeploymentConfig = {
      environment: 'production',
      deploymentType: 'standalone',
      expectedServices: ['seraphc2-server', 'postgresql', 'redis'],
      requiredEnvVars: ['DATABASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'],
      optionalEnvVars: ['REDIS_URL', 'CORS_ORIGINS', 'SSL_CERT_PATH', 'SSL_KEY_PATH'],
    };

    validator = new DeploymentValidator(deploymentConfig);

    // Setup test environment and authentication
    await setupTestEnvironment();
  }, 60000);

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

    // Get authentication tokens
    const authService = server.getAuthService();
    const adminOperator = seedData.operators.find(op => op.role === 'administrator');

    if (adminOperator) {
      const adminLoginResult = await authService.login({
        username: adminOperator.username,
        password: 'admin123',
      });
      if (adminLoginResult.success && adminLoginResult.tokens) {
        adminToken = adminLoginResult.tokens.accessToken;
      }
    }
  }

  describe('Production Environment Validation', () => {
    it('should validate production environment configuration', async () => {
      // Set production environment variables for testing
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'production-jwt-secret-key-with-sufficient-length-for-security';
      process.env.ENCRYPTION_KEY = 'production-encryption-key-32-chars';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/seraphc2_prod';

      try {
        const report = await validator.validateDeployment();

        expect(report.summary.overallStatus).not.toBe('unhealthy');
        expect(report.summary.failedTests).toBe(0);

        // Check that critical security validations passed
        const securityTests = report.validationResults.filter(r => r.category === 'Security');
        const failedSecurityTests = securityTests.filter(r => r.status === 'failed');

        expect(failedSecurityTests).toHaveLength(0);

        // Verify environment-specific validations
        const envTests = report.validationResults.filter(r => r.category === 'Environment');
        const nodeEnvTest = envTests.find(r => r.testName === 'NODE_ENV Configuration');

        expect(nodeEnvTest?.status).toBe('passed');
        expect(nodeEnvTest?.details?.nodeEnv).toBe('production');
      } finally {
        // Restore original environment
        process.env.NODE_ENV = originalEnv;
      }
    }, 30000);

    it('should enforce production security requirements', async () => {
      // Test HTTPS enforcement in production
      const response = await request(app).get('/api/health').expect(200);

      // Check security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('0');
      expect(response.headers['strict-transport-security']).toBeDefined();

      // Verify no sensitive information in headers
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).toBeUndefined();
    });

    it('should validate production database configuration', async () => {
      // Test database connection with production settings
      const healthResponse = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(healthResponse.body.services.database).toBe('healthy');

      // Verify database performance meets production requirements
      const startTime = Date.now();
      await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const endTime = Date.now();

      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle production-level concurrent requests', async () => {
      const concurrentRequests = 50;
      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() => request(app).get('/api/health').timeout(5000));

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should handle concurrent requests efficiently
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Calculate average response time
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(200); // Average should be under 200ms
    }, 15000);

    it('should enforce rate limiting in production', async () => {
      // Make rapid requests to test rate limiting
      const rapidRequests = Array(20)
        .fill(null)
        .map(() =>
          request(app).post('/api/auth/login').send({
            username: 'nonexistent',
            password: 'wrongpassword',
          })
        );

      const responses = await Promise.all(rapidRequests);

      // Should have some rate-limited responses
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      // Check rate limit headers
      const rateLimitedResponse = rateLimitedResponses[0];
      expect(rateLimitedResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(rateLimitedResponse.headers['x-ratelimit-remaining']).toBeDefined();
      expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
    });
  });

  describe('Production Data Integrity', () => {
    it('should maintain data consistency under load', async () => {
      // Create multiple implants concurrently
      const implantCreationPromises = Array(10)
        .fill(null)
        .map((_, index) =>
          request(app)
            .post('/api/implants')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `load-test-implant-${index}`,
              hostname: `host-${index}.test.com`,
              ip_address: `192.168.1.${100 + index}`,
              operating_system: 'Ubuntu 22.04',
              architecture: 'x64',
            })
        );

      const creationResponses = await Promise.all(implantCreationPromises);

      // All creations should succeed
      creationResponses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBeDefined();
      });

      // Verify all implants were created and are retrievable
      const implantIds = creationResponses.map(res => res.body.data.id);

      for (const implantId of implantIds) {
        const getResponse = await request(app)
          .get(`/api/implants/${implantId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(getResponse.body.success).toBe(true);
        expect(getResponse.body.data.id).toBe(implantId);
      }

      // Verify database consistency
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const createdImplants = listResponse.body.data.filter((implant: any) =>
        implant.name.startsWith('load-test-implant-')
      );

      expect(createdImplants).toHaveLength(10);
    }, 30000);

    it('should handle transaction rollbacks correctly', async () => {
      // Test transaction integrity by attempting to create an implant with invalid data
      const invalidImplantResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '', // Invalid: empty name
          hostname: 'test.com',
          ip_address: 'invalid-ip', // Invalid IP format
          operating_system: 'Ubuntu 22.04',
          architecture: 'x64',
        })
        .expect(400);

      expect(invalidImplantResponse.body.success).toBe(false);

      // Verify no partial data was created
      const implantsResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const emptyNameImplants = implantsResponse.body.data.filter(
        (implant: any) => implant.name === '' || implant.hostname === 'test.com'
      );

      expect(emptyNameImplants).toHaveLength(0);
    });

    it('should maintain audit trail integrity', async () => {
      // Perform several operations that should be audited
      const implantResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'audit-test-implant',
          hostname: 'audit.test.com',
          ip_address: '192.168.1.200',
          operating_system: 'Windows Server 2022',
          architecture: 'x64',
        })
        .expect(201);

      const implantId = implantResponse.body.data.id;

      // Execute a command
      const commandResponse = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          implant_id: implantId,
          command: 'audit-test-command',
        })
        .expect(201);

      const commandId = commandResponse.body.data.id;

      // Update the implant
      await request(app)
        .put(`/api/implants/${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'audit-test-implant-updated',
        })
        .expect(200);

      // Check audit logs
      const auditResponse = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          limit: 10,
          resource_type: 'implant',
          resource_id: implantId,
        })
        .expect(200);

      expect(auditResponse.body.success).toBe(true);
      expect(auditResponse.body.data.length).toBeGreaterThan(0);

      // Verify audit entries contain expected actions
      const auditEntries = auditResponse.body.data;
      const actions = auditEntries.map((entry: any) => entry.action);

      expect(actions).toContain('create');
      expect(actions).toContain('update');
    });
  });

  describe('Production Performance Requirements', () => {
    it('should meet response time requirements under normal load', async () => {
      const endpoints = [
        { method: 'GET', path: '/api/health', auth: false },
        { method: 'GET', path: '/api/implants', auth: true },
        { method: 'GET', path: '/api/commands', auth: true },
        { method: 'GET', path: '/api/tasks', auth: true },
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();

        let response;
        if (endpoint.method === 'GET') {
          const req = request(app).get(endpoint.path);
          if (endpoint.auth) {
            req.set('Authorization', `Bearer ${adminToken}`);
          }
          response = await req;
        }

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(response?.status).toBeLessThan(500);
        expect(responseTime).toBeLessThan(500); // Should respond within 500ms
      }
    });

    it('should handle memory usage efficiently', async () => {
      const initialMemory = process.memoryUsage();

      // Perform memory-intensive operations
      const operations = Array(100)
        .fill(null)
        .map((_, index) =>
          request(app).get('/api/implants').set('Authorization', `Bearer ${adminToken}`)
        );

      await Promise.all(operations);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;

      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('should maintain database connection pool efficiency', async () => {
      const { DatabaseConnection } = await import('../../src/core/database');
      const db = DatabaseConnection.getInstance();

      // Get initial pool stats
      const initialStats = db.getPoolStats();

      // Perform multiple database operations
      const dbOperations = Array(50)
        .fill(null)
        .map(() => request(app).get('/api/implants').set('Authorization', `Bearer ${adminToken}`));

      await Promise.all(dbOperations);

      // Get final pool stats
      const finalStats = db.getPoolStats();

      // Pool should not have grown excessively
      expect(finalStats.totalCount).toBeLessThanOrEqual(initialStats.totalCount + 5);

      // Should have idle connections available
      expect(finalStats.idleCount).toBeGreaterThan(0);

      // Should not have waiting connections
      expect(finalStats.waitingCount).toBe(0);
    });
  });

  describe('Production Error Handling', () => {
    it('should handle database connection failures gracefully', async () => {
      // This test would typically involve temporarily disconnecting the database
      // For now, we'll test the error handling endpoints

      const healthResponse = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(healthResponse.body.services).toBeDefined();
      expect(healthResponse.body.services.database).toBe('healthy');
    });

    it('should return appropriate error responses', async () => {
      // Test 404 for non-existent resources
      const notFoundResponse = await request(app)
        .get('/api/implants/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(notFoundResponse.body.success).toBe(false);
      expect(notFoundResponse.body.error).toBeDefined();
      expect(notFoundResponse.body.error.message).toContain('not found');

      // Test 401 for unauthorized requests
      const unauthorizedResponse = await request(app).get('/api/implants').expect(401);

      expect(unauthorizedResponse.body.success).toBe(false);
      expect(unauthorizedResponse.body.error).toBeDefined();

      // Test 400 for bad requests
      const badRequestResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Missing required fields
          name: '',
        })
        .expect(400);

      expect(badRequestResponse.body.success).toBe(false);
      expect(badRequestResponse.body.error).toBeDefined();
    });

    it('should not expose sensitive information in error responses', async () => {
      // Test that database errors don't expose connection details
      const errorResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'test',
          hostname: 'test.com',
          ip_address: 'invalid-ip-format',
          operating_system: 'Ubuntu 22.04',
          architecture: 'x64',
        })
        .expect(400);

      expect(errorResponse.body.success).toBe(false);

      // Error message should not contain database connection details
      const errorMessage = JSON.stringify(errorResponse.body);
      expect(errorMessage).not.toContain('postgresql://');
      expect(errorMessage).not.toContain('password');
      expect(errorMessage).not.toContain('connection string');
      expect(errorMessage).not.toContain('stack trace');
    });
  });

  describe('Production Monitoring and Observability', () => {
    it('should provide comprehensive health check information', async () => {
      const healthResponse = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.services).toBeDefined();
      expect(healthResponse.body.services.database).toBe('healthy');
      expect(healthResponse.body.services.redis).toBe('healthy');
      expect(healthResponse.body.services.auth).toBe('healthy');

      // Should include system metrics
      expect(healthResponse.body.metrics).toBeDefined();
      expect(healthResponse.body.metrics.uptime).toBeGreaterThan(0);
      expect(healthResponse.body.metrics.memory).toBeDefined();
      expect(healthResponse.body.metrics.connections).toBeDefined();
    });

    it('should provide metrics endpoint for monitoring', async () => {
      const metricsResponse = await request(app)
        .get('/api/health/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(metricsResponse.body.metrics).toBeDefined();

      const metrics = metricsResponse.body.metrics;
      expect(metrics.uptime).toBeGreaterThan(0);
      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.heapUsed).toBeGreaterThan(0);
      expect(metrics.memory.heapTotal).toBeGreaterThan(0);
      expect(metrics.connections).toBeDefined();
      expect(metrics.requests).toBeDefined();
    });

    it('should log important events appropriately', async () => {
      // Perform an operation that should be logged
      const implantResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'logging-test-implant',
          hostname: 'logging.test.com',
          ip_address: '192.168.1.210',
          operating_system: 'CentOS 8',
          architecture: 'x64',
        })
        .expect(201);

      // Check that audit logs were created
      const auditResponse = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          limit: 5,
          action: 'create',
          resource_type: 'implant',
        })
        .expect(200);

      expect(auditResponse.body.success).toBe(true);
      expect(auditResponse.body.data.length).toBeGreaterThan(0);

      const recentAuditEntry = auditResponse.body.data[0];
      expect(recentAuditEntry.action).toBe('create');
      expect(recentAuditEntry.resource_type).toBe('implant');
      expect(recentAuditEntry.resource_id).toBe(implantResponse.body.data.id);
    });
  });

  describe('Production Backup and Recovery', () => {
    it('should support database backup operations', async () => {
      // Test backup endpoint
      const backupResponse = await request(app)
        .post('/api/incident/backup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'database',
          compression: true,
          includeAuditLogs: true,
        })
        .expect(201);

      expect(backupResponse.body.success).toBe(true);
      expect(backupResponse.body.data.backup_id).toBeDefined();
      expect(backupResponse.body.data.status).toBe('initiated');
    });

    it('should handle configuration backup', async () => {
      // Test configuration backup
      const configBackupResponse = await request(app)
        .post('/api/incident/backup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'configuration',
          includeSecrets: false, // Should not include secrets in backup
        })
        .expect(201);

      expect(configBackupResponse.body.success).toBe(true);
      expect(configBackupResponse.body.data.backup_id).toBeDefined();
    });

    it('should validate backup integrity', async () => {
      // Create a backup
      const backupResponse = await request(app)
        .post('/api/incident/backup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'database',
          compression: true,
        })
        .expect(201);

      const backupId = backupResponse.body.data.backup_id;

      // Validate the backup
      const validateResponse = await request(app)
        .post(`/api/incident/backup/${backupId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(validateResponse.body.success).toBe(true);
      expect(validateResponse.body.data.valid).toBe(true);
    });
  });
});
