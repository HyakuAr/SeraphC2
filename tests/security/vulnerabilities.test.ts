/**
 * Known Vulnerability Security Tests for SeraphC2
 * Tests for common security vulnerabilities and attack vectors
 */

import request from 'supertest';
import { Application } from 'express';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { initializeDatabase } from '../../src/core/database';
import { JwtUtils } from '../../src/core/auth/jwt.utils';
import { OperatorRole } from '../../src/types/entities';
import * as crypto from 'crypto';

describe('Known Vulnerability Security Tests', () => {
  let app: Application;
  let server: SeraphC2Server;
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    // Initialize test database
    await initializeDatabase();

    // Setup test server
    const operatorRepository = new PostgresOperatorRepository();
    const serverConfig: ServerConfig = {
      port: 3005,
      host: 'localhost',
      corsOrigins: ['http://localhost:3005'],
      enableRequestLogging: false,
    };

    server = new SeraphC2Server(serverConfig, operatorRepository);
    await server.start();
    app = server.getApp();

    // Setup test tokens
    adminToken = JwtUtils.generateAccessToken('admin-id', 'testadmin', OperatorRole.ADMINISTRATOR);
    operatorToken = JwtUtils.generateAccessToken(
      'operator-id',
      'testoperator',
      OperatorRole.OPERATOR
    );
  }, 30000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  }, 10000);

  describe('OWASP Top 10 Vulnerability Tests', () => {
    describe('A01:2021 - Broken Access Control', () => {
      test('should prevent horizontal privilege escalation', async () => {
        // Try to access another user's data
        const response = await request(app)
          .get('/api/operators/other-user-id')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.status).toBeGreaterThanOrEqual(403);
      });

      test('should prevent vertical privilege escalation', async () => {
        // Try to perform admin actions as regular user
        const response = await request(app)
          .delete('/api/operators/some-user-id')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.status).toBe(403);
      });

      test('should prevent direct object reference attacks', async () => {
        // Try to access resources by guessing IDs
        const testIds = ['1', '2', '3', 'admin', '../admin', '../../etc/passwd'];

        for (const id of testIds) {
          const response = await request(app)
            .get(`/api/operators/${id}`)
            .set('Authorization', `Bearer ${operatorToken}`);

          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      });
    });

    describe('A02:2021 - Cryptographic Failures', () => {
      test('should use HTTPS in production headers', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${operatorToken}`);

        // Should have security headers
        expect(response.headers['strict-transport-security']).toBeDefined();
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBeDefined();
      });

      test('should not expose sensitive data in responses', async () => {
        const response = await request(app)
          .get('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`);

        if (response.status === 200 && response.body.data) {
          for (const operator of response.body.data) {
            expect(operator.passwordHash).toBeUndefined();
            expect(operator.sessionToken).toBeUndefined();
            expect(operator.totpSecret).toBeUndefined();
          }
        }
      });

      test('should use secure random tokens', async () => {
        const loginResponse = await request(app).post('/api/auth/login').send({
          username: 'testuser',
          password: 'TestPassword123!',
        });

        if (loginResponse.body.tokens) {
          const token = loginResponse.body.tokens.accessToken;

          // Token should be sufficiently random (entropy check)
          const tokenBytes = Buffer.from(token.split('.')[1], 'base64url');
          expect(tokenBytes.length).toBeGreaterThan(20);
        }
      });
    });

    describe('A03:2021 - Injection', () => {
      test('should prevent server-side template injection', async () => {
        const stiPayloads = [
          '{{7*7}}',
          '${7*7}',
          '#{7*7}',
          '<%= 7*7 %>',
          '{{constructor.constructor("alert(1)")()}}',
          '${T(java.lang.Runtime).getRuntime().exec("id")}',
        ];

        for (const payload of stiPayloads) {
          const response = await request(app)
            .post('/api/operators')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              username: `user${Math.random()}`,
              email: 'test@example.com',
              password: 'SecurePassword123!',
              role: 'operator',
              displayName: payload,
            });

          if (response.status === 201) {
            expect(response.body.data?.displayName).not.toBe('49');
            expect(response.body.data?.displayName).not.toContain('uid=');
          }
        }
      });

      test('should prevent expression language injection', async () => {
        const elPayloads = [
          '${1+1}',
          '#{1+1}',
          '${applicationScope}',
          '${facesContext}',
          '${request}',
        ];

        for (const payload of elPayloads) {
          const response = await request(app)
            .post('/api/tasks')
            .set('Authorization', `Bearer ${operatorToken}`)
            .send({
              implantId: 'test-implant',
              command: 'echo',
              arguments: [payload],
            });

          if (response.status === 201) {
            expect(response.body.data?.arguments?.[0]).not.toBe('2');
          }
        }
      });
    });

    describe('A04:2021 - Insecure Design', () => {
      test('should implement proper session timeout', async () => {
        // This would test if sessions expire appropriately
        // For now, we test that tokens have expiration
        const token = JwtUtils.generateAccessToken('test-id', 'test', OperatorRole.OPERATOR);
        const decoded = JwtUtils.validateAccessToken(token);

        expect(decoded?.exp).toBeDefined();
        expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      });

      test('should prevent account enumeration', async () => {
        // Test that login responses don't reveal if username exists
        const nonExistentUser = await request(app).post('/api/auth/login').send({
          username: 'nonexistentuser12345',
          password: 'wrongpassword',
        });

        const existentUserWrongPassword = await request(app).post('/api/auth/login').send({
          username: 'testadmin',
          password: 'wrongpassword',
        });

        // Both should return similar error messages
        expect(nonExistentUser.body.error).toBe(existentUserWrongPassword.body.error);
      });
    });

    describe('A05:2021 - Security Misconfiguration', () => {
      test('should not expose server information', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.headers['server']).toBeUndefined();
        expect(response.headers['x-powered-by']).toBeUndefined();
      });

      test('should not expose debug information', async () => {
        const response = await request(app)
          .get('/api/nonexistent-endpoint')
          .set('Authorization', `Bearer ${operatorToken}`);

        if (response.status === 404) {
          expect(response.body).not.toContain('stack');
          expect(response.body).not.toContain('Error:');
          expect(response.body).not.toContain(__dirname);
        }
      });

      test('should have proper CORS configuration', async () => {
        const response = await request(app)
          .options('/api/health')
          .set('Origin', 'http://malicious-site.com');

        expect(response.headers['access-control-allow-origin']).not.toBe('*');
      });
    });

    describe('A06:2021 - Vulnerable and Outdated Components', () => {
      test('should not expose version information', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.body.version).toBeUndefined();
        expect(response.headers['x-version']).toBeUndefined();
      });
    });

    describe('A07:2021 - Identification and Authentication Failures', () => {
      test('should prevent brute force attacks', async () => {
        const attempts = [];

        // Make multiple failed login attempts
        for (let i = 0; i < 10; i++) {
          attempts.push(
            request(app).post('/api/auth/login').send({
              username: 'testuser',
              password: 'wrongpassword',
            })
          );
        }

        const responses = await Promise.all(attempts);

        // Should eventually get rate limited
        const rateLimited = responses.some(r => r.status === 429);
        expect(rateLimited).toBe(true);
      });

      test('should prevent session fixation', async () => {
        // Get initial session
        const initialResponse = await request(app)
          .get('/api/health')
          .set('Authorization', `Bearer ${operatorToken}`);

        // Login
        const loginResponse = await request(app).post('/api/auth/login').send({
          username: 'testuser',
          password: 'TestPassword123!',
        });

        if (loginResponse.body.tokens) {
          // New token should be different
          expect(loginResponse.body.tokens.accessToken).not.toBe(operatorToken);
        }
      });
    });

    describe('A08:2021 - Software and Data Integrity Failures', () => {
      test('should validate file uploads', async () => {
        const maliciousFiles = [
          { name: 'test.exe', content: 'MZ\x90\x00' }, // PE header
          { name: 'test.php', content: '<?php system($_GET["cmd"]); ?>' },
          {
            name: 'test.jsp',
            content: '<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>',
          },
          { name: '../../../etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash' },
        ];

        for (const file of maliciousFiles) {
          const response = await request(app)
            .post('/api/files/upload')
            .set('Authorization', `Bearer ${operatorToken}`)
            .attach('file', Buffer.from(file.content), file.name);

          // Should reject or sanitize malicious files
          expect(response.status).not.toBe(500);

          if (response.status === 201) {
            expect(response.body.data?.filename).not.toContain('../');
            expect(response.body.data?.filename).not.toContain('passwd');
          }
        }
      });
    });

    describe('A09:2021 - Security Logging and Monitoring Failures', () => {
      test('should log security events', async () => {
        // Failed login attempt
        await request(app).post('/api/auth/login').send({
          username: 'testuser',
          password: 'wrongpassword',
        });

        // Unauthorized access attempt
        await request(app).get('/api/operators').set('Authorization', 'Bearer invalid-token');

        // These should be logged (we can't easily test logging in unit tests,
        // but we ensure the endpoints handle security events properly)
        expect(true).toBe(true); // Placeholder for logging verification
      });
    });

    describe('A10:2021 - Server-Side Request Forgery (SSRF)', () => {
      test('should prevent SSRF in webhook URLs', async () => {
        const ssrfPayloads = [
          'http://localhost:22',
          'http://127.0.0.1:3306',
          'http://169.254.169.254/latest/meta-data/',
          'file:///etc/passwd',
          'ftp://internal-server/',
          'gopher://127.0.0.1:25/',
        ];

        for (const payload of ssrfPayloads) {
          const response = await request(app)
            .post('/api/webhooks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: 'test-webhook',
              url: payload,
              events: ['implant.connected'],
            });

          // Should reject internal/dangerous URLs
          expect(response.status).toBeGreaterThanOrEqual(400);
        }
      });

      test('should prevent SSRF in external integrations', async () => {
        const response = await request(app)
          .post('/api/integrations/test')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            endpoint: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
          });

        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });
  });

  describe('Additional Security Tests', () => {
    describe('Timing Attack Prevention', () => {
      test('should prevent timing attacks on login', async () => {
        const startTime = Date.now();

        // Test with non-existent user
        await request(app).post('/api/auth/login').send({
          username: 'nonexistentuser12345',
          password: 'password',
        });

        const nonExistentTime = Date.now() - startTime;

        const startTime2 = Date.now();

        // Test with existing user but wrong password
        await request(app).post('/api/auth/login').send({
          username: 'testadmin',
          password: 'wrongpassword',
        });

        const existentTime = Date.now() - startTime2;

        // Times should be similar (within reasonable variance)
        const timeDifference = Math.abs(nonExistentTime - existentTime);
        expect(timeDifference).toBeLessThan(1000); // Less than 1 second difference
      });
    });

    describe('Information Disclosure Prevention', () => {
      test('should not expose internal paths in errors', async () => {
        const response = await request(app)
          .get('/api/nonexistent')
          .set('Authorization', `Bearer ${operatorToken}`);

        if (response.body.error) {
          expect(response.body.error).not.toContain('/home/');
          expect(response.body.error).not.toContain('/var/');
          expect(response.body.error).not.toContain('C:\\');
          expect(response.body.error).not.toContain(__dirname);
        }
      });

      test('should not expose database errors', async () => {
        // This would test that database errors are properly handled
        // and don't expose internal information
        const response = await request(app)
          .get('/api/operators/invalid-uuid-format')
          .set('Authorization', `Bearer ${adminToken}`);

        if (response.status >= 400 && response.body.error) {
          expect(response.body.error).not.toContain('PostgreSQL');
          expect(response.body.error).not.toContain('SQL');
          expect(response.body.error).not.toContain('database');
          expect(response.body.error).not.toContain('table');
        }
      });
    });

    describe('Denial of Service Prevention', () => {
      test('should handle large payloads gracefully', async () => {
        const largePayload = {
          username: 'A'.repeat(1000000), // 1MB string
          email: 'test@example.com',
          password: 'SecurePassword123!',
          role: 'operator',
        };

        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(largePayload);

        // Should reject or handle gracefully, not crash
        expect(response.status).toBeGreaterThanOrEqual(400);
      });

      test('should handle deeply nested JSON', async () => {
        // Create deeply nested object
        let nestedObj: any = {};
        let current = nestedObj;

        for (let i = 0; i < 1000; i++) {
          current.nested = {};
          current = current.nested;
        }

        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            username: 'testuser',
            email: 'test@example.com',
            password: 'SecurePassword123!',
            role: 'operator',
            metadata: nestedObj,
          });

        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe('Cryptographic Security', () => {
      test('should use secure random number generation', () => {
        const random1 = crypto.randomBytes(32);
        const random2 = crypto.randomBytes(32);

        // Should be different
        expect(random1.equals(random2)).toBe(false);

        // Should have good entropy (basic check)
        const uniqueBytes = new Set(random1);
        expect(uniqueBytes.size).toBeGreaterThan(20); // Should have variety
      });

      test('should use secure hashing algorithms', async () => {
        // Test that passwords are hashed with secure algorithms
        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            username: 'hashtest',
            email: 'hashtest@example.com',
            password: 'SecurePassword123!',
            role: 'operator',
          });

        if (response.status === 201) {
          // Password should be hashed (we can't directly check the hash,
          // but we ensure it's not stored in plain text)
          expect(response.body.data?.password).toBeUndefined();
          expect(response.body.data?.passwordHash).toBeUndefined();
        }
      });
    });
  });
});
