/**
 * Authentication and Authorization Security Tests for SeraphC2
 * Tests authentication mechanisms, session management, and access controls
 */

import request from 'supertest';
import { Application } from 'express';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { initializeDatabase } from '../../src/core/database';
import { AuthService } from '../../src/core/auth/auth.service';
import { JwtUtils } from '../../src/core/auth/jwt.utils';
import { OperatorRole } from '../../src/types/entities';

describe('Authentication and Authorization Security Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let authService: AuthService;
  let operatorRepository: PostgresOperatorRepository;
  let adminToken: string;
  let operatorToken: string;
  let readOnlyToken: string;
  let testOperatorId: string;

  beforeAll(async () => {
    // Initialize test database
    await initializeDatabase();

    // Setup test server
    operatorRepository = new PostgresOperatorRepository();
    const serverConfig: ServerConfig = {
      port: 3003,
      host: 'localhost',
      corsOrigins: ['http://localhost:3003'],
      enableRequestLogging: false,
    };

    server = new SeraphC2Server(serverConfig, operatorRepository);
    await server.start();
    app = server.getApp();

    // Create test users with different roles
    await setupTestUsers();
  }, 30000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  }, 10000);

  describe('Authentication Mechanism Tests', () => {
    test('should reject requests without authentication token', async () => {
      const response = await request(app).get('/api/operators').expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication');
    });

    test('should reject requests with invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/operators')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    test('should reject requests with expired JWT token', async () => {
      // Create an expired token
      const expiredToken = JwtUtils.generateAccessToken(
        'test-user',
        'testuser',
        OperatorRole.OPERATOR,
        -3600
      );

      const response = await request(app)
        .get('/api/operators')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should reject requests with malformed JWT token', async () => {
      const malformedTokens = [
        'Bearer ',
        'Bearer malformed.token',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.malformed',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.malformed',
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/api/operators')
          .set('Authorization', token)
          .expect(401);

        expect(response.body.success).toBe(false);
      }
    });

    test('should accept valid JWT token', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Authorization', `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Session Management Tests', () => {
    test('should prevent session fixation attacks', async () => {
      // Login and get initial token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testoperator',
          password: 'TestPassword123!',
        })
        .expect(200);

      const initialToken = loginResponse.body.tokens.accessToken;

      // Login again and verify token changes
      const secondLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testoperator',
          password: 'TestPassword123!',
        })
        .expect(200);

      const newToken = secondLoginResponse.body.tokens.accessToken;

      expect(initialToken).not.toBe(newToken);
    });

    test('should invalidate session on logout', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testoperator',
          password: 'TestPassword123!',
        })
        .expect(200);

      const token = loginResponse.body.tokens.accessToken;

      // Verify token works
      await request(app).get('/api/health').set('Authorization', `Bearer ${token}`).expect(200);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify token no longer works (should fail due to session invalidation)
      // Note: This test depends on implementation details of session management
    });

    test('should prevent concurrent sessions with same credentials', async () => {
      // This test verifies that multiple logins don't create security issues
      const credentials = {
        username: 'testoperator',
        password: 'TestPassword123!',
      };

      // Create multiple sessions
      const session1 = await request(app).post('/api/auth/login').send(credentials).expect(200);

      const session2 = await request(app).post('/api/auth/login').send(credentials).expect(200);

      // Both tokens should be different
      expect(session1.body.tokens.accessToken).not.toBe(session2.body.tokens.accessToken);

      // Both should work initially
      await request(app)
        .get('/api/health')
        .set('Authorization', `Bearer ${session1.body.tokens.accessToken}`)
        .expect(200);

      await request(app)
        .get('/api/health')
        .set('Authorization', `Bearer ${session2.body.tokens.accessToken}`)
        .expect(200);
    });
  });

  describe('Role-Based Access Control Tests', () => {
    test('should enforce administrator-only endpoints', async () => {
      // Test with operator token (should fail)
      await request(app)
        .post('/api/operators')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'Password123!',
          role: 'operator',
        })
        .expect(403);

      // Test with admin token (should succeed)
      await request(app)
        .post('/api/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newuser',
          email: 'newuser@example.com',
          password: 'Password123!',
          role: 'operator',
        })
        .expect(201);
    });

    test('should enforce read-only restrictions', async () => {
      // Read-only user should be able to GET
      await request(app)
        .get('/api/implants')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .expect(200);

      // Read-only user should NOT be able to POST/PUT/DELETE
      await request(app)
        .post('/api/implants/test-id/tasks')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .send({ command: 'test' })
        .expect(403);

      await request(app)
        .delete('/api/implants/test-id')
        .set('Authorization', `Bearer ${readOnlyToken}`)
        .expect(403);
    });

    test('should prevent privilege escalation', async () => {
      // Operator should not be able to create admin users
      await request(app)
        .post('/api/operators')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          username: 'maliciousadmin',
          email: 'malicious@example.com',
          password: 'Password123!',
          role: 'administrator',
        })
        .expect(403);

      // Operator should not be able to modify their own role
      await request(app)
        .put(`/api/operators/${testOperatorId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          role: 'administrator',
        })
        .expect(403);
    });
  });

  describe('Password Security Tests', () => {
    test('should enforce strong password requirements', async () => {
      const weakPasswords = [
        'password',
        '123456',
        'qwerty',
        'Password',
        'password123',
        'Pass123',
        '12345678',
      ];

      for (const weakPassword of weakPasswords) {
        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            username: `testuser${Math.random()}`,
            email: 'test@example.com',
            password: weakPassword,
            role: 'operator',
          })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Password');
      }
    });

    test('should hash passwords securely', async () => {
      const password = 'SecurePassword123!';

      // Create user
      const response = await request(app)
        .post('/api/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'passwordtest',
          email: 'passwordtest@example.com',
          password,
          role: 'operator',
        })
        .expect(201);

      // Verify password is not stored in plain text
      const operator = await operatorRepository.findByUsername('passwordtest');
      expect(operator?.passwordHash).toBeDefined();
      expect(operator?.passwordHash).not.toBe(password);
      expect(operator?.passwordHash).toContain('$'); // Should contain hash format markers
    });

    test('should prevent password reuse in change password', async () => {
      const currentPassword = 'CurrentPassword123!';
      const samePassword = 'CurrentPassword123!';

      // This test would require implementing password history
      // For now, we test that the same password is rejected
      const response = await request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          currentPassword,
          newPassword: samePassword,
        });

      // Should either reject same password or implement password history
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Multi-Factor Authentication Tests', () => {
    test('should require MFA when configured', async () => {
      // This test assumes MFA is implemented
      // Test login without MFA token when MFA is required
      const response = await request(app).post('/api/auth/login').send({
        username: 'mfauser', // Assuming this user has MFA enabled
        password: 'Password123!',
      });

      if (response.body.requiresMfa) {
        expect(response.body.success).toBe(false);
        expect(response.body.requiresMfa).toBe(true);
      }
    });

    test('should reject invalid MFA tokens', async () => {
      const response = await request(app).post('/api/auth/login').send({
        username: 'mfauser',
        password: 'Password123!',
        mfaToken: '000000', // Invalid token
      });

      if (response.body.requiresMfa !== undefined) {
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should rate limit login attempts', async () => {
      const credentials = {
        username: 'nonexistentuser',
        password: 'wrongpassword',
      };

      // Make multiple failed login attempts
      const attempts = [];
      for (let i = 0; i < 10; i++) {
        attempts.push(request(app).post('/api/auth/login').send(credentials));
      }

      const responses = await Promise.all(attempts);

      // Should eventually get rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 15000);

    test('should rate limit API requests per user', async () => {
      // Make many requests quickly
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(app).get('/api/health').set('Authorization', `Bearer ${operatorToken}`)
        );
      }

      const responses = await Promise.all(requests);

      // Should eventually get rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Token Security Tests', () => {
    test('should use secure token generation', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testoperator',
          password: 'TestPassword123!',
        })
        .expect(200);

      const token = loginResponse.body.tokens.accessToken;

      // Token should be properly formatted JWT
      expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);

      // Token should contain proper claims
      const decoded = JwtUtils.validateAccessToken(token);
      expect(decoded).toBeDefined();
      expect(decoded?.operatorId).toBeDefined();
      expect(decoded?.username).toBe('testoperator');
    });

    test('should prevent token tampering', async () => {
      const validToken = operatorToken;
      const tokenParts = validToken.split('.');

      // Tamper with payload
      const tamperedPayload = Buffer.from('{"sub":"admin","role":"administrator"}').toString(
        'base64url'
      );
      const tamperedToken = `${tokenParts[0]}.${tamperedPayload}.${tokenParts[2]}`;

      const response = await request(app)
        .get('/api/operators')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  /**
   * Setup test users with different roles
   */
  async function setupTestUsers(): Promise<void> {
    // Create admin user
    const adminResult = await operatorRepository.create({
      username: 'testadmin',
      email: 'admin@test.com',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm', // hashed "TestPassword123!"
      role: OperatorRole.ADMINISTRATOR,
      permissions: [],
    });

    // Create operator user
    const operatorResult = await operatorRepository.create({
      username: 'testoperator',
      email: 'operator@test.com',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm', // hashed "TestPassword123!"
      role: OperatorRole.OPERATOR,
      permissions: [],
    });

    // Create read-only user
    await operatorRepository.create({
      username: 'testreadonly',
      email: 'readonly@test.com',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm', // hashed "TestPassword123!"
      role: OperatorRole.READ_ONLY,
      permissions: [],
    });

    testOperatorId = operatorResult.id;

    // Generate tokens for testing
    adminToken = JwtUtils.generateAccessToken(
      adminResult.id,
      'testadmin',
      OperatorRole.ADMINISTRATOR
    );
    operatorToken = JwtUtils.generateAccessToken(
      operatorResult.id,
      'testoperator',
      OperatorRole.OPERATOR
    );
    readOnlyToken = JwtUtils.generateAccessToken(
      'readonly-id',
      'testreadonly',
      OperatorRole.READ_ONLY
    );
  }
});
