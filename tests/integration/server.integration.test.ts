/**
 * Integration tests for SeraphC2 HTTP server and API endpoints
 */

import request from 'supertest';
import { Application } from 'express';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { initializeDatabase, closeDatabaseConnection } from '../../src/core/database';
import { OperatorRole } from '../../src/types/entities';

describe('SeraphC2 Server Integration Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let operatorRepository: PostgresOperatorRepository;
  let testOperatorId: string;

  beforeAll(async () => {
    // Initialize test database
    await initializeDatabase();

    // Initialize repositories
    operatorRepository = new PostgresOperatorRepository();

    // Configure test server
    const serverConfig: ServerConfig = {
      port: 0, // Use random port for testing
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      enableRequestLogging: false,
    };

    // Create server instance
    server = new SeraphC2Server(serverConfig, operatorRepository);
    app = server.getApp();

    // Create test operator
    const testOperator = await operatorRepository.create({
      username: 'testoperator',
      email: 'test@seraphc2.com',
      passwordHash: '$pbkdf2-sha256$100000$test-salt$test-hash', // Mock hash
      role: OperatorRole.ADMINISTRATOR,
      permissions: [],
    });
    testOperatorId = testOperator.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testOperatorId) {
      await operatorRepository.delete(testOperatorId);
    }

    // Close database connection
    await closeDatabaseConnection();
  });

  describe('Health Check Endpoints', () => {
    test('GET /api/health should return healthy status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.any(String),
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: '1.0.0',
          service: 'SeraphC2',
          checks: {
            server: 'healthy',
            database: expect.any(String),
            memory: expect.any(String),
          },
        },
      });
    });

    test('GET /api/health/detailed should return detailed status', async () => {
      const response = await request(app).get('/api/health/detailed').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.any(String),
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: '1.0.0',
          service: 'SeraphC2',
          system: {
            platform: expect.any(String),
            arch: expect.any(String),
            nodeVersion: expect.any(String),
            pid: expect.any(Number),
          },
          memory: {
            rss: expect.any(Number),
            heapTotal: expect.any(Number),
            heapUsed: expect.any(Number),
            external: expect.any(Number),
            arrayBuffers: expect.any(Number),
          },
        },
      });
    });

    test('GET /api/health/ready should return readiness status', async () => {
      const response = await request(app).get('/api/health/ready').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          ready: true,
          timestamp: expect.any(String),
          checks: {
            database: expect.any(Boolean),
            server: true,
          },
        },
      });
    });

    test('GET /api/health/live should return liveness status', async () => {
      const response = await request(app).get('/api/health/live').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          alive: true,
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        },
      });
    });
  });

  describe('API Root Endpoints', () => {
    test('GET /api should return API information', async () => {
      const response = await request(app).get('/api').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'SeraphC2 API Server',
        version: '1.0.0',
        timestamp: expect.any(String),
      });
    });

    test('GET / should return server information', async () => {
      const response = await request(app).get('/').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'SeraphC2 Server',
        version: '1.0.0',
        api: '/api',
        health: '/api/health',
      });
    });
  });

  describe('Authentication Endpoints', () => {
    test('POST /api/auth/login should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'invalid',
          password: 'invalid',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    test('POST /api/auth/login should require username and password', async () => {
      const response = await request(app).post('/api/auth/login').send({}).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Username and password are required',
      });
    });

    test('POST /api/auth/validate should require token', async () => {
      const response = await request(app).post('/api/auth/validate').send({}).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Token is required',
      });
    });

    test('POST /api/auth/validate should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/validate')
        .send({
          token: 'invalid-token',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    test('GET /api/auth/me should require authentication', async () => {
      const response = await request(app).get('/api/auth/me').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authentication token required',
      });
    });

    test('POST /api/auth/logout should require authentication', async () => {
      const response = await request(app).post('/api/auth/logout').expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authentication token required',
      });
    });

    test('POST /api/auth/refresh should require refresh token', async () => {
      const response = await request(app).post('/api/auth/refresh').send({}).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Refresh token required',
      });
    });

    test('POST /api/auth/create-operator should require admin authentication', async () => {
      const response = await request(app)
        .post('/api/auth/create-operator')
        .send({
          username: 'newoperator',
          email: 'new@seraphc2.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authentication token required',
      });
    });

    test('POST /api/auth/change-password should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .send({
          currentPassword: 'old',
          newPassword: 'new',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authentication token required',
      });
    });
  });

  describe('Error Handling', () => {
    test('GET /api/nonexistent should return 404', async () => {
      const response = await request(app).get('/api/nonexistent').expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'API endpoint not found',
        path: '/api/nonexistent',
      });
    });

    test('GET /nonexistent should return 404', async () => {
      const response = await request(app).get('/nonexistent').expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Route not found',
        path: '/nonexistent',
      });
    });
  });

  describe('Security Headers', () => {
    test('Should include security headers in responses', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'x-xss-protection': '1; mode=block',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-seraphc2-server': '1.0.0',
      });

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    test('Should include cache control headers for API endpoints', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.headers).toMatchObject({
        'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        pragma: 'no-cache',
        expires: '0',
      });
    });
  });

  describe('CORS Configuration', () => {
    test('Should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('Should reject requests from unauthorized origins', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://malicious-site.com');

      // The request should still succeed but without CORS headers
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
