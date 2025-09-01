/**
 * Audit Middleware Tests
 * Tests for HTTP request/response audit logging middleware
 */

import { Response, NextFunction } from 'express';
import { AuditMiddleware, AuditedRequest } from '../audit.middleware';
import { AuditService } from '../../../core/audit/audit.service';

// Mock AuditService
jest.mock('../../../core/audit/audit.service');

describe('AuditMiddleware', () => {
  let auditMiddleware: AuditMiddleware;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockRequest: Partial<AuditedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockAuditService = {
      logEvent: jest.fn(),
      logAuthentication: jest.fn(),
      logCommandExecution: jest.fn(),
      logFileOperation: jest.fn(),
    } as any;

    (AuditService.getInstance as jest.Mock).mockReturnValue(mockAuditService);

    auditMiddleware = new AuditMiddleware();

    mockRequest = {
      method: 'GET',
      path: '/api/test',
      query: {},
      headers: {
        'user-agent': 'Mozilla/5.0',
        'x-forwarded-for': '192.168.1.1',
      },
      body: {},
      operatorId: 'operator-1',
      get: jest.fn().mockImplementation((header: string) => {
        if (header === 'User-Agent') return 'Mozilla/5.0';
        return undefined;
      }),
      connection: { remoteAddress: '192.168.1.100' } as any,
      socket: { remoteAddress: '192.168.1.100' } as any,
      ip: '192.168.1.1',
    } as unknown as AuditedRequest;

    mockResponse = {
      statusCode: 200,
      json: jest.fn(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('logRequest', () => {
    it('should log HTTP requests', () => {
      const middleware = auditMiddleware.logRequest();

      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.startTime).toBeDefined();
      expect(mockAuditService.logEvent).toHaveBeenCalledWith({
        operatorId: 'operator-1',
        action: 'http_request',
        resourceType: 'api',
        resourceId: 'GET /api/test',
        details: {
          method: 'GET',
          path: '/api/test',
          query: {},
          headers: expect.objectContaining({
            'user-agent': 'Mozilla/5.0',
            'x-forwarded-for': '192.168.1.1',
          }),
          body: {},
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: true,
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip excluded paths', () => {
      (mockRequest as any).path = '/health';

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip excluded methods', () => {
      (mockRequest as any).method = 'OPTIONS';

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should log HTTP responses when res.json is called', () => {
      mockRequest.startTime = Date.now() - 100;

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true, data: 'test' };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith({
        operatorId: 'operator-1',
        action: 'http_response',
        resourceType: 'api',
        resourceId: 'GET /api/test',
        details: {
          method: 'GET',
          path: '/api/test',
          statusCode: 200,
          responseTime: expect.any(Number),
          responseSize: JSON.stringify(responseBody).length,
          success: true,
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: true,
      });
    });

    it('should sanitize sensitive headers', () => {
      (mockRequest as any).headers = {
        authorization: 'Bearer token123',
        cookie: 'session=abc123',
        'x-api-key': 'secret-key',
        'content-type': 'application/json',
      };

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            headers: {
              'content-type': 'application/json',
              // Sensitive headers should be removed
            },
          }),
        })
      );
    });

    it('should sanitize sensitive body fields', () => {
      (mockRequest as any).body = {
        username: 'testuser',
        password: 'secret123',
        token: 'jwt-token',
        data: 'normal-data',
      };

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            body: {
              username: 'testuser',
              password: '[REDACTED]',
              token: '[REDACTED]',
              data: 'normal-data',
            },
          }),
        })
      );
    });
  });

  describe('logAuthentication', () => {
    it('should log successful login', () => {
      (mockRequest as any).path = '/auth/login';
      (mockRequest as any).body = { username: 'testuser', password: 'secret' };
      mockResponse.statusCode = 200;

      const middleware = auditMiddleware.logAuthentication();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true, token: 'jwt-token', sessionId: 'session-1' };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logAuthentication).toHaveBeenCalledWith(
        'operator-1',
        'login',
        {
          username: 'testuser',
          authMethod: 'password',
          sessionId: 'session-1',
          failureReason: undefined,
        },
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should log failed login', () => {
      (mockRequest as any).path = '/auth/login';
      (mockRequest as any).body = { username: 'testuser', password: 'wrong' };
      mockResponse.statusCode = 401;

      const middleware = auditMiddleware.logAuthentication();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: false, error: 'Invalid credentials' };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logAuthentication).toHaveBeenCalledWith(
        'operator-1',
        'login_failed',
        {
          username: 'testuser',
          authMethod: 'password',
          sessionId: undefined,
          failureReason: 'Invalid credentials',
        },
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should log MFA success', () => {
      (mockRequest as any).path = '/auth/mfa/verify';
      (mockRequest as any).body = { token: '123456' };
      mockResponse.statusCode = 200;

      const middleware = auditMiddleware.logAuthentication();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true, sessionId: 'session-1' };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logAuthentication).toHaveBeenCalledWith(
        'operator-1',
        'mfa_success',
        {
          username: undefined,
          authMethod: 'mfa',
          sessionId: 'session-1',
          failureReason: undefined,
        },
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should skip non-auth endpoints', () => {
      (mockRequest as any).path = '/api/implants';

      const middleware = auditMiddleware.logAuthentication();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      (mockResponse.json as jest.Mock)({ success: true });

      expect(mockAuditService.logAuthentication).not.toHaveBeenCalled();
    });
  });

  describe('logCommandExecution', () => {
    it('should log command execution', () => {
      (mockRequest as any).path = '/commands/execute';
      (mockRequest as any).method = 'POST';
      (mockRequest as any).body = {
        implantId: 'implant-1',
        command: 'whoami',
        type: 'shell',
      };
      mockResponse.statusCode = 200;

      const middleware = auditMiddleware.logCommandExecution();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true, commandId: 'cmd-1' };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logCommandExecution).toHaveBeenCalledWith(
        'operator-1',
        'implant-1',
        'cmd-1',
        {
          implantId: 'implant-1',
          command: 'whoami',
          commandType: 'shell',
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should log failed command execution', () => {
      (mockRequest as any).path = '/commands/execute';
      (mockRequest as any).method = 'POST';
      (mockRequest as any).body = {
        implantId: 'implant-1',
        command: 'invalid-command',
      };
      mockResponse.statusCode = 400;

      const middleware = auditMiddleware.logCommandExecution();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: false, error: 'Command failed' };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logCommandExecution).toHaveBeenCalledWith(
        'operator-1',
        'implant-1',
        undefined,
        {
          implantId: 'implant-1',
          command: 'invalid-command',
          commandType: 'shell',
        },
        false,
        'Command failed',
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should skip non-command endpoints', () => {
      (mockRequest as any).path = '/api/implants';
      (mockRequest as any).method = 'POST';

      const middleware = auditMiddleware.logCommandExecution();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      (mockResponse.json as jest.Mock)({ success: true });

      expect(mockAuditService.logCommandExecution).not.toHaveBeenCalled();
    });
  });

  describe('logFileOperations', () => {
    it('should log file upload', () => {
      (mockRequest as any).path = '/files/upload';
      (mockRequest as any).method = 'POST';
      (mockRequest as any).body = {
        implantId: 'implant-1',
        targetPath: 'C:\\temp\\file.txt',
        size: 1024,
      };
      mockResponse.statusCode = 200;

      const middleware = auditMiddleware.logFileOperations();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true, data: { checksum: 'abc123' } };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logFileOperation).toHaveBeenCalledWith(
        'operator-1',
        {
          implantId: 'implant-1',
          operation: 'upload',
          sourcePath: undefined,
          targetPath: 'C:\\temp\\file.txt',
          fileSize: 1024,
          checksum: 'abc123',
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should log file download', () => {
      (mockRequest as any).path = '/files/download';
      (mockRequest as any).method = 'GET';
      (mockRequest as any).query = { path: 'C:\\temp\\file.txt' };
      (mockRequest as any).params = { implantId: 'implant-1' };

      const middleware = auditMiddleware.logFileOperations();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logFileOperation).toHaveBeenCalledWith(
        'operator-1',
        {
          implantId: 'implant-1',
          operation: 'download',
          sourcePath: 'C:\\temp\\file.txt',
          targetPath: undefined,
          fileSize: undefined,
          checksum: undefined,
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });

    it('should log file deletion', () => {
      (mockRequest as any).path = '/files/delete';
      (mockRequest as any).method = 'DELETE';
      (mockRequest as any).params = { implantId: 'implant-1' };

      const middleware = auditMiddleware.logFileOperations();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      const responseBody = { success: true };
      (mockResponse.json as jest.Mock)(responseBody);

      expect(mockAuditService.logFileOperation).toHaveBeenCalledWith(
        'operator-1',
        {
          implantId: 'implant-1',
          operation: 'delete',
          sourcePath: undefined,
          targetPath: undefined,
          fileSize: undefined,
          checksum: undefined,
        },
        true,
        undefined,
        '192.168.1.1',
        'Mozilla/5.0'
      );
    });
  });

  describe('getClientIP', () => {
    it('should get IP from x-forwarded-for header', () => {
      (mockRequest as any).headers = { 'x-forwarded-for': '203.0.113.1' };

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.1',
        })
      );
    });

    it('should get IP from x-real-ip header', () => {
      (mockRequest as any).headers = { 'x-real-ip': '203.0.113.2' };

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.2',
        })
      );
    });

    it('should fallback to connection.remoteAddress', () => {
      (mockRequest as any).headers = {};
      (mockRequest as any).connection = { remoteAddress: '203.0.113.3' };

      const middleware = auditMiddleware.logRequest();
      middleware(mockRequest as AuditedRequest, mockResponse as Response, mockNext);

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.3',
        })
      );
    });
  });

  describe('configuration management', () => {
    it('should add and remove excluded paths', () => {
      auditMiddleware.addExcludedPath('/custom/path');

      const config = auditMiddleware.getConfiguration();
      expect(config.excludedPaths).toContain('/custom/path');

      auditMiddleware.removeExcludedPath('/custom/path');

      const updatedConfig = auditMiddleware.getConfiguration();
      expect(updatedConfig.excludedPaths).not.toContain('/custom/path');
    });

    it('should return current configuration', () => {
      const config = auditMiddleware.getConfiguration();

      expect(config).toEqual({
        excludedPaths: expect.arrayContaining(['/health', '/favicon.ico']),
        excludedMethods: expect.arrayContaining(['OPTIONS']),
      });
    });
  });
});
