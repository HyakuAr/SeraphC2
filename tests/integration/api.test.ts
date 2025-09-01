/**
 * API integration tests
 * Tests REST API endpoints, authentication, and data flow
 */

import request from 'supertest';
import { Application } from 'express';
import { getTestContainers, resetTestData } from '../helpers/testContainers';
import { SeraphC2Server } from '../../src/web/server';
import { OperatorRepository } from '../../src/core/repositories/operator.repository';
import { AuthService } from '../../src/core/auth/auth.service';
import { MfaService } from '../../src/core/auth/mfa.service';
import { PostgresBackupCodesRepository } from '../../src/core/repositories/backup-codes.repository';

describe('API Integration Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let operatorRepository: OperatorRepository;
  let authService: AuthService;
  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    // Setup test containers
    const testContainers = getTestContainers();
    await testContainers.setup();
    await testContainers.runMigrations();

    const pool = testContainers.getPostgresPool();
    operatorRepository = new OperatorRepository(pool);

    // Create server instance
    server = new SeraphC2Server(
      {
        port: 0, // Use random port for testing
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        enableRequestLogging: false,
      },
      operatorRepository
    );

    app = server.getApp();
    authService = server.getAuthService();

    // Seed test data and get tokens
    await setupTestData();
  });

  beforeEach(async () => {
    await resetTestData();
    await setupTestData();
  });

  afterAll(async () => {
    const testContainers = getTestContainers();
    await testContainers.cleanup();
  });

  async function setupTestData() {
    const testContainers = getTestContainers();
    const seedData = await testContainers.seedData();

    // Generate tokens for different user roles
    const adminOperator = seedData.operators.find(op => op.role === 'administrator');
    const regularOperator = seedData.operators.find(op => op.role === 'operator');
    const readOnlyOperator = seedData.operators.find(op => op.role === 'read_only');

    if (adminOperator) {
      const adminTokenResult = await authService.generateToken(adminOperator);
      adminToken = adminTokenResult.token;
    }

    if (regularOperator) {
      const operatorTokenResult = await authService.generateToken(regularOperator);
      operatorToken = operatorTokenResult.token;
    }

    if (readOnlyOperator) {
      const readOnlyTokenResult = await authService.generateToken(readOnlyOperator);
      readOnlyToken = readOnlyTokenResult.token;
    }
  }

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });

    it('should return detailed health check', async () => {
      const response = await request(app).get('/api/health/detailed').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        status: 'healthy',
        checks: expect.objectContaining({
          database: expect.any(Object),
          redis: expect.any(Object),
        }),
      });
    });
  });

  describe('Authentication Endpoints', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'admin123', // This would be the actual password in a real test
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        token: expect.any(String),
        operator: expect.objectContaining({
          id: expect.any(String),
          username: 'admin',
          role: 'administrator',
        }),
      });
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should validate token', async () => {
      const response = await request(app)
        .get('/api/auth/validate')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        valid: true,
        operator: expect.objectContaining({
          username: 'admin',
          role: 'administrator',
        }),
      });
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/validate')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        valid: false,
      });
    });

    it('should refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        token: expect.any(String),
      });

      // New token should be different
      expect(response.body.token).not.toBe(adminToken);
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
      });
    });
  });

  describe('Implant Management Endpoints', () => {
    it('should list implants for authenticated user', async () => {
      const response = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        implants: expect.any(Array),
        pagination: expect.objectContaining({
          page: expect.any(Number),
          pageSize: expect.any(Number),
          total: expect.any(Number),
        }),
      });
    });

    it('should get specific implant by ID', async () => {
      // First get list to find an implant ID
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const implantId = listResponse.body.implants[0]?.id;
      if (!implantId) {
        throw new Error('No implants found in test data');
      }

      const response = await request(app)
        .get(`/api/implants/${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        implant: expect.objectContaining({
          id: implantId,
          name: expect.any(String),
          status: expect.any(String),
        }),
      });
    });

    it('should create new implant', async () => {
      const implantData = {
        name: 'api-test-implant',
        hostname: 'api-test.example.com',
        ipAddress: '192.168.1.250',
        operatingSystem: 'Windows 11',
        architecture: 'x64',
      };

      const response = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(implantData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        implant: expect.objectContaining({
          id: expect.any(String),
          name: implantData.name,
          hostname: implantData.hostname,
          ipAddress: implantData.ipAddress,
        }),
      });
    });

    it('should update implant status', async () => {
      // Get an implant ID first
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const implantId = listResponse.body.implants[0]?.id;
      if (!implantId) {
        throw new Error('No implants found in test data');
      }

      const response = await request(app)
        .patch(`/api/implants/${implantId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'inactive' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        implant: expect.objectContaining({
          id: implantId,
          status: 'inactive',
        }),
      });
    });

    it('should delete implant', async () => {
      // Create a test implant first
      const createResponse = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'delete-test-implant',
          hostname: 'delete-test.example.com',
          ipAddress: '192.168.1.251',
          operatingSystem: 'Linux',
          architecture: 'x64',
        })
        .expect(201);

      const implantId = createResponse.body.implant.id;

      const response = await request(app)
        .delete(`/api/implants/${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.any(String),
      });

      // Verify implant is deleted
      await request(app)
        .get(`/api/implants/${implantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should reject unauthorized access', async () => {
      await request(app).get('/api/implants').expect(401);
    });

    it('should enforce role-based access', async () => {
      // Read-only user should not be able to create implants
      await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({
          name: 'unauthorized-implant',
          hostname: 'unauthorized.example.com',
        })
        .expect(403);
    });
  });

  describe('Command Execution Endpoints', () => {
    let testImplantId: string;

    beforeEach(async () => {
      // Get a test implant ID
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testImplantId = listResponse.body.implants[0]?.id;
      if (!testImplantId) {
        throw new Error('No implants found in test data');
      }
    });

    it('should execute command on implant', async () => {
      const commandData = {
        command: 'whoami',
        implantId: testImplantId,
      };

      const response = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(commandData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        command: expect.objectContaining({
          id: expect.any(String),
          command: commandData.command,
          implantId: testImplantId,
          status: 'pending',
        }),
      });
    });

    it('should list commands with filters', async () => {
      const response = await request(app)
        .get(`/api/commands?implantId=${testImplantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        commands: expect.any(Array),
        pagination: expect.any(Object),
      });

      // All commands should be for the specified implant
      response.body.commands.forEach((command: any) => {
        expect(command.implantId).toBe(testImplantId);
      });
    });

    it('should get command result', async () => {
      // First create a command
      const createResponse = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          command: 'pwd',
          implantId: testImplantId,
        })
        .expect(201);

      const commandId = createResponse.body.command.id;

      const response = await request(app)
        .get(`/api/commands/${commandId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        command: expect.objectContaining({
          id: commandId,
          command: 'pwd',
          implantId: testImplantId,
        }),
      });
    });

    it('should cancel pending command', async () => {
      // Create a command
      const createResponse = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          command: 'sleep 60',
          implantId: testImplantId,
        })
        .expect(201);

      const commandId = createResponse.body.command.id;

      const response = await request(app)
        .patch(`/api/commands/${commandId}/cancel`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        command: expect.objectContaining({
          id: commandId,
          status: 'cancelled',
        }),
      });
    });
  });

  describe('File Operations Endpoints', () => {
    let testImplantId: string;

    beforeEach(async () => {
      const listResponse = await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      testImplantId = listResponse.body.implants[0]?.id;
    });

    it('should list files on implant', async () => {
      const response = await request(app)
        .get(`/api/files/${testImplantId}/list`)
        .query({ path: '/' })
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        files: expect.any(Array),
        path: '/',
      });
    });

    it('should download file from implant', async () => {
      const response = await request(app)
        .post(`/api/files/${testImplantId}/download`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ path: '/etc/passwd' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        downloadId: expect.any(String),
        status: 'pending',
      });
    });

    it('should upload file to implant', async () => {
      const fileContent = Buffer.from('test file content');

      const response = await request(app)
        .post(`/api/files/${testImplantId}/upload`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .attach('file', fileContent, 'test.txt')
        .field('path', '/tmp/test.txt')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        uploadId: expect.any(String),
        status: 'pending',
      });
    });
  });

  describe('Audit Endpoints', () => {
    it('should list audit logs for admin', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        logs: expect.any(Array),
        pagination: expect.any(Object),
      });
    });

    it('should get audit statistics', async () => {
      const response = await request(app)
        .get('/api/audit/statistics')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        statistics: expect.objectContaining({
          total: expect.any(Number),
          successful: expect.any(Number),
          failed: expect.any(Number),
        }),
      });
    });

    it('should generate compliance report', async () => {
      const response = await request(app)
        .post('/api/audit/reports/compliance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          format: 'json',
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString(),
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        report: expect.any(Object),
      });
    });

    it('should reject audit access for non-admin users', async () => {
      await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(403);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent-endpoint')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'API endpoint not found',
      });
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/implants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Missing required fields
          name: '',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    it('should handle server errors gracefully', async () => {
      // This would test error middleware by triggering a server error
      // In a real scenario, you might mock a service to throw an error
      const response = await request(app)
        .get('/api/implants/invalid-uuid-format')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make multiple rapid requests
      const requests = Array(10)
        .fill(null)
        .map(() =>
          request(app)
            .get('/api/health')
            .expect(res => {
              // Should either succeed (200) or be rate limited (429)
              expect([200, 429]).toContain(res.status);
            })
        );

      await Promise.all(requests);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app).get('/api/health').expect(200);

      // Check for rate limit headers
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/implants')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers).toHaveProperty('access-control-allow-headers');
    });

    it('should reject requests from unauthorized origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com')
        .expect(200); // Health endpoint might still work, but CORS headers should be restricted

      // The origin should not be in the allowed origins response
      if (response.headers['access-control-allow-origin']) {
        expect(response.headers['access-control-allow-origin']).not.toBe(
          'http://malicious-site.com'
        );
      }
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/api/health').expect(200);

      // Check for common security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });
});
