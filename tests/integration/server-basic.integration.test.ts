/**
 * Basic integration tests for SeraphC2 HTTP server (without database)
 */

import request from 'supertest';
import { Application } from 'express';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { OperatorRepository } from '../../src/core/repositories/interfaces';

// Mock operator repository for testing without database
class MockOperatorRepository implements OperatorRepository {
  async findById(): Promise<any> {
    return null;
  }
  async findByUsername(): Promise<any> {
    return null;
  }
  async findByEmail(): Promise<any> {
    return null;
  }
  async findBySessionToken(): Promise<any> {
    return null;
  }
  async create(): Promise<any> {
    return { id: 'test-id' };
  }
  async update(): Promise<any> {
    return null;
  }
  async delete(): Promise<boolean> {
    return true;
  }
  async findAll(): Promise<any[]> {
    return [];
  }
  async findActiveOperators(): Promise<any[]> {
    return [];
  }
  async updateLastLogin(): Promise<void> {}
  async updateSessionToken(): Promise<void> {}
  async deactivateOperator(): Promise<void> {}
  async activateOperator(): Promise<void> {}
}

describe('SeraphC2 Server Basic Integration Tests', () => {
  let app: Application;
  let server: SeraphC2Server;

  beforeAll(async () => {
    // Use mock repository to avoid database dependency
    const mockOperatorRepository = new MockOperatorRepository();

    // Configure test server
    const serverConfig: ServerConfig = {
      port: 0, // Use random port for testing
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      enableRequestLogging: false,
    };

    // Create server instance
    server = new SeraphC2Server(serverConfig, mockOperatorRepository);
    app = server.getApp();
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

  describe('Health Check Endpoints', () => {
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

  describe('Authentication Endpoints', () => {
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
      const response = await request(app).get('/api/health/live').expect(200);

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
      const response = await request(app).get('/api/health/live').expect(200);

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
        .options('/api/health/live')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('Should reject requests from unauthorized origins', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .set('Origin', 'http://malicious-site.com');

      // The request should still succeed but without CORS headers
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
