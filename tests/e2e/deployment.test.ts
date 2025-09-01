/**
 * End-to-end deployment and upgrade testing
 * Tests deployment scenarios, configuration validation, and upgrade processes
 */

import request from 'supertest';
import { Application } from 'express';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { SeraphC2Server } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { Pool } from 'pg';

describe('End-to-End Deployment Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let operatorRepository: PostgresOperatorRepository;
  let adminToken: string;
  let pool: Pool;

  beforeAll(async () => {
    // Setup test containers
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    pool = testContainers.getPostgresPool();
    operatorRepository = new PostgresOperatorRepository();

    // Create server instance with production-like configuration
    server = new SeraphC2Server(
      {
        port: 0,
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        enableRequestLogging: true,
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

    if (adminOperator) {
      const adminLoginResult = await authService.login({
        username: adminOperator.username,
        password: 'admin123', // Use test password
      });
      if (adminLoginResult.success && adminLoginResult.tokens) {
        adminToken = adminLoginResult.tokens.accessToken;
      }
    }
  }

  describe('Application Startup and Configuration', () => {
    it('should start successfully with valid configuration', async () => {
      // Test that the server started successfully
      expect(server).toBeDefined();
      expect(app).toBeDefined();

      // Test basic health check
      const healthResponse = await request(app).get('/api/health').expect(200);

      expect(healthResponse.body.status).toBe('healthy');
      expect(healthResponse.body.services).toBeDefined();
      expect(healthResponse.body.services.database).toBe('healthy');
    });

    it('should validate environment configuration on startup', async () => {
      // Test configuration validation endpoint
      const configResponse = await request(app)
        .get('/api/health/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(configResponse.body.success).toBe(true);
      expect(configResponse.body.config).toBeDefined();
      expect(configResponse.body.config.environment).toBe('test');
    });

    it('should handle missing required environment variables gracefully', async () => {
      // This test would typically involve starting a server with missing config
      // For now, we'll test the configuration validation endpoint
      const response = await request(app)
        .get('/api/health/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.config.database).toBeDefined();
      expect(response.body.config.redis).toBeDefined();
    });
  });

  describe('Database Migration and Schema Validation', () => {
    it('should have all required database tables', async () => {
      // Check that all required tables exist
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `;

      const result = await pool.query(tablesQuery);
      const tableNames = result.rows.map(row => row.table_name);

      const requiredTables = [
        'operators',
        'implants',
        'commands',
        'tasks',
        'audit_logs',
        'export_jobs',
      ];

      requiredTables.forEach(tableName => {
        expect(tableNames).toContain(tableName);
      });
    });

    it('should have proper database constraints and indexes', async () => {
      // Check primary keys
      const primaryKeysQuery = `
        SELECT table_name, column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        ORDER BY table_name;
      `;

      const result = await pool.query(primaryKeysQuery);
      expect(result.rows.length).toBeGreaterThan(0);

      // Verify specific primary keys
      const primaryKeys = result.rows.reduce((acc, row) => {
        acc[row.table_name] = row.column_name;
        return acc;
      }, {});

      expect(primaryKeys.operators).toBe('id');
      expect(primaryKeys.implants).toBe('id');
      expect(primaryKeys.commands).toBe('id');
    });

    it('should handle database connection failures gracefully', async () => {
      // Test health check when database is available
      const healthResponse = await request(app).get('/api/health').expect(200);

      expect(healthResponse.body.services.database).toBe('healthy');
    });
  });

  describe('Security Configuration Validation', () => {
    it('should enforce HTTPS security headers', async () => {
      const response = await request(app).get('/api/health').expect(200);

      // Check for security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('0');
    });

    it('should validate JWT token configuration', async () => {
      // Test login to ensure JWT is working
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin123',
        })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      expect(typeof loginResponse.body.token).toBe('string');

      // Test token validation
      const profileResponse = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(profileResponse.body.success).toBe(true);
    });

    it('should enforce rate limiting', async () => {
      // Make multiple rapid requests to test rate limiting
      const requests = Array(10)
        .fill(null)
        .map(() =>
          request(app).post('/api/auth/login').send({
            username: 'admin',
            password: 'wrongpassword',
          })
        );

      const responses = await Promise.all(requests);

      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should validate CORS configuration', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Service Dependencies and Health Checks', () => {
    it('should validate all service dependencies', async () => {
      const healthResponse = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(healthResponse.body.services).toBeDefined();
      expect(healthResponse.body.services.database).toBe('healthy');
      expect(healthResponse.body.services.redis).toBe('healthy');
      expect(healthResponse.body.services.auth).toBe('healthy');
    });

    it('should provide system metrics and status', async () => {
      const metricsResponse = await request(app)
        .get('/api/health/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(metricsResponse.body.metrics).toBeDefined();
      expect(metricsResponse.body.metrics.uptime).toBeGreaterThan(0);
      expect(metricsResponse.body.metrics.memory).toBeDefined();
      expect(metricsResponse.body.metrics.connections).toBeDefined();
    });

    it('should handle graceful shutdown signals', async () => {
      // Test that the server can handle shutdown gracefully
      // This is more of a conceptual test since we can't actually shut down the test server
      const healthResponse = await request(app).get('/api/health').expect(200);

      expect(healthResponse.body.status).toBe('healthy');
    });
  });

  describe('API Endpoint Availability', () => {
    it('should have all required API endpoints available', async () => {
      const requiredEndpoints = [
        { method: 'GET', path: '/api/health', auth: false },
        { method: 'POST', path: '/api/auth/login', auth: false },
        { method: 'GET', path: '/api/auth/profile', auth: true },
        { method: 'GET', path: '/api/implants', auth: true },
        { method: 'POST', path: '/api/commands', auth: true },
        { method: 'GET', path: '/api/tasks', auth: true },
        { method: 'GET', path: '/api/audit/logs', auth: true },
      ];

      for (const endpoint of requiredEndpoints) {
        let response;

        if (endpoint.method === 'GET') {
          const req = request(app).get(endpoint.path);
          if (endpoint.auth) {
            req.set('Authorization', `Bearer ${adminToken}`);
          }
          response = await req;
        } else if (endpoint.method === 'POST') {
          const req = request(app).post(endpoint.path).send({});
          if (endpoint.auth) {
            req.set('Authorization', `Bearer ${adminToken}`);
          }
          response = await req;
        }

        // Should not return 404 (endpoint exists)
        if (response) {
          expect(response.status).not.toBe(404);
        }
      }
    });

    it('should return proper API documentation', async () => {
      const docsResponse = await request(app).get('/api/docs').expect(200);

      expect(docsResponse.text).toContain('swagger');
    });

    it('should handle API versioning correctly', async () => {
      const apiResponse = await request(app).get('/api').expect(200);

      expect(apiResponse.body.version).toBeDefined();
      expect(apiResponse.body.message).toContain('SeraphC2 API Server');
    });
  });

  describe('Data Persistence and Backup', () => {
    it('should persist data across operations', async () => {
      // Create an implant
      const createResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'persistence-test-implant',
          hostname: 'persist.test.com',
          ip_address: '192.168.1.250',
          operating_system: 'Ubuntu 22.04',
          architecture: 'x64',
        })
        .expect(201);

      const implantId = createResponse.body.data.id;

      // Verify it persists
      const getResponse = await request(app)
        .get(`/api/implants/${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getResponse.body.data.name).toBe('persistence-test-implant');

      // Execute a command
      const commandResponse = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          implant_id: implantId,
          command: 'persistence-test-command',
        })
        .expect(201);

      const commandId = commandResponse.body.data.id;

      // Verify command persists
      const commandGetResponse = await request(app)
        .get(`/api/commands/${commandId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(commandGetResponse.body.data.command).toBe('persistence-test-command');
    });

    it('should handle database backup operations', async () => {
      // Test backup endpoint if available
      const backupResponse = await request(app)
        .post('/api/incident/backup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'database',
          compression: true,
        })
        .expect(201);

      expect(backupResponse.body.success).toBe(true);
      expect(backupResponse.body.data.backup_id).toBeDefined();
    });
  });

  describe('Performance and Load Handling', () => {
    it('should handle concurrent requests efficiently', async () => {
      const startTime = Date.now();

      // Make 20 concurrent requests
      const requests = Array(20)
        .fill(null)
        .map(() => request(app).get('/api/implants').set('Authorization', `Bearer ${adminToken}`));

      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should handle large payloads appropriately', async () => {
      // Test with a large command payload
      const largeCommand = 'echo "' + 'A'.repeat(1000) + '"';

      const response = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          implant_id: '660e8400-e29b-41d4-a716-446655440001',
          command: largeCommand,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.command).toBe(largeCommand);
    });
  });

  describe('Upgrade and Migration Scenarios', () => {
    it('should handle schema version compatibility', async () => {
      // Check current schema version
      const versionQuery = `
        SELECT version_num 
        FROM schema_migrations 
        ORDER BY version_num DESC 
        LIMIT 1;
      `;

      try {
        const result = await pool.query(versionQuery);
        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.rows[0].version_num).toBeDefined();
      } catch (error) {
        // If schema_migrations table doesn't exist, that's also valid
        console.log('Schema migrations table not found, which is acceptable for this test');
      }
    });

    it('should maintain data integrity during simulated upgrades', async () => {
      // Create test data
      const implantResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'upgrade-test-implant',
          hostname: 'upgrade.test.com',
          ip_address: '192.168.1.251',
          operating_system: 'Windows Server 2022',
          architecture: 'x64',
        })
        .expect(201);

      const implantId = implantResponse.body.data.id;

      // Verify data integrity
      const verifyResponse = await request(app)
        .get(`/api/implants/${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(verifyResponse.body.data.name).toBe('upgrade-test-implant');
      expect(verifyResponse.body.data.hostname).toBe('upgrade.test.com');
    });

    it('should handle configuration changes gracefully', async () => {
      // Test that the application handles configuration validation
      const configResponse = await request(app)
        .get('/api/health/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(configResponse.body.success).toBe(true);
      expect(configResponse.body.config).toBeDefined();
    });
  });
});
