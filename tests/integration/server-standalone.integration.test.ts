/**
 * Standalone server integration tests (no database required)
 * Tests basic server functionality without database dependencies
 */

import request from 'supertest';
import { Application } from 'express';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { OperatorRepository } from '../../src/core/repositories/interfaces';

describe('SeraphC2 Server Standalone Integration Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let mockOperatorRepository: jest.Mocked<OperatorRepository>;

  beforeAll(async () => {
    // Create mock repository that doesn't require database
    mockOperatorRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByUsername: jest.fn(),
      findByEmail: jest.fn(),
      findBySessionToken: jest.fn(),
      findActiveOperators: jest.fn(),
      updateLastLogin: jest.fn(),
      updateSessionToken: jest.fn(),
      deactivateOperator: jest.fn(),
      activateOperator: jest.fn(),
    };

    // Configure test server
    const serverConfig: ServerConfig = {
      port: 0, // Use random port for testing
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      enableRequestLogging: false,
    };

    // Create server instance with mock repository
    server = new SeraphC2Server(serverConfig, mockOperatorRepository);
    app = server.getApp();
  });

  describe('Server Initialization', () => {
    test('should create server instance successfully', () => {
      expect(server).toBeDefined();
      expect(app).toBeDefined();
    });

    test('should provide access to auth service', () => {
      const authService = server.getAuthService();
      expect(authService).toBeDefined();
    });

    test('should provide access to auth middleware', () => {
      const authMiddleware = server.getAuthMiddleware();
      expect(authMiddleware).toBeDefined();
    });
  });

  describe('Basic API Endpoints', () => {
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

    test('GET /api should return API information', async () => {
      const response = await request(app).get('/api').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'SeraphC2 API Server',
        version: '1.0.0',
        timestamp: expect.any(String),
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

    test('GET /api/health should handle database unavailability gracefully', async () => {
      const response = await request(app).get('/api/health');

      // Should return either 200 (if database check passes) or 503 (if database unavailable)
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('uptime');
    });
  });

  describe('Authentication Endpoints Structure', () => {
    test('POST /api/auth/login should validate input format', async () => {
      const response = await request(app).post('/api/auth/login').send({}).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Username and password are required',
      });
    });

    test('POST /api/auth/validate should validate input format', async () => {
      const response = await request(app).post('/api/auth/validate').send({}).expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Token is required',
      });
    });

    test('GET /api/auth/me should require authentication', async () => {
      const response = await request(app).get('/api/auth/me').expect(401);

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

  describe('Security Features', () => {
    test('should include security headers in responses', async () => {
      const response = await request(app).get('/api/health/live').expect(200);

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'x-xss-protection': '1; mode=block',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'x-seraphc2-server': '1.0.0',
      });

      // Should not expose server technology
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    test('should include cache control headers for API endpoints', async () => {
      const response = await request(app).get('/api/health/live').expect(200);

      expect(response.headers).toMatchObject({
        'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        pragma: 'no-cache',
        expires: '0',
      });
    });

    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/health/live')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Request Validation', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      // Express should handle malformed JSON and return 400
      expect(response.status).toBe(400);
    });

    test('should handle oversized requests', async () => {
      // Create a large payload (larger than 10MB limit)
      const largePayload = 'x'.repeat(11 * 1024 * 1024); // 11MB

      const response = await request(app).post('/api/auth/login').send({ data: largePayload });

      // Should either reject with 413 (payload too large) or 400 (bad request)
      expect([400, 413]).toContain(response.status);
    });
  });
});
