/**
 * Unit tests for SeraphC2 HTTP server
 */

import { SeraphC2Server, ServerConfig } from '../../../src/web/server';
import { PostgresOperatorRepository } from '../../../src/core/repositories/operator.repository';

// Mock the repositories and dependencies
jest.mock('../../../src/core/repositories/operator.repository');
jest.mock('../../../src/core/auth/auth.service');
jest.mock('../../../src/core/auth/auth.middleware', () => ({
  AuthMiddleware: jest.fn().mockImplementation(() => ({
    authenticate: jest.fn(() => jest.fn()),
    requireAdmin: jest.fn(() => jest.fn()),
    requireOperator: jest.fn(() => jest.fn()),
    requireReadOnly: jest.fn(() => jest.fn()),
    optionalAuth: jest.fn(() => jest.fn()),
    requirePermissions: jest.fn(() => jest.fn()),
    validateRefreshToken: jest.fn(() => jest.fn()),
    rateLimitAuth: jest.fn(() => jest.fn()),
  })),
}));

describe('SeraphC2Server', () => {
  let mockOperatorRepository: jest.Mocked<PostgresOperatorRepository>;
  let serverConfig: ServerConfig;

  beforeEach(() => {
    mockOperatorRepository =
      new PostgresOperatorRepository() as jest.Mocked<PostgresOperatorRepository>;

    serverConfig = {
      port: 3000,
      host: 'localhost',
      corsOrigins: ['http://localhost:3000'],
      enableRequestLogging: false,
    };
  });

  describe('Constructor', () => {
    test('should create server instance with valid configuration', () => {
      const server = new SeraphC2Server(serverConfig, mockOperatorRepository);

      expect(server).toBeInstanceOf(SeraphC2Server);
      expect(server.getApp()).toBeDefined();
      expect(server.getAuthService()).toBeDefined();
      expect(server.getAuthMiddleware()).toBeDefined();
    });

    test('should initialize Express app with middleware', () => {
      const server = new SeraphC2Server(serverConfig, mockOperatorRepository);
      const app = server.getApp();

      // Check that the app is configured
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });
  });

  describe('Configuration', () => {
    test('should accept custom server configuration', () => {
      const customConfig: ServerConfig = {
        port: 8080,
        host: '0.0.0.0',
        corsOrigins: ['https://seraphc2.com'],
        enableRequestLogging: true,
      };

      const server = new SeraphC2Server(customConfig, mockOperatorRepository);

      expect(server).toBeInstanceOf(SeraphC2Server);
    });

    test('should handle empty CORS origins', () => {
      const configWithEmptyCors: ServerConfig = {
        port: 3000,
        host: 'localhost',
        corsOrigins: [],
        enableRequestLogging: false,
      };

      const server = new SeraphC2Server(configWithEmptyCors, mockOperatorRepository);

      expect(server).toBeInstanceOf(SeraphC2Server);
    });
  });

  describe('Service Access', () => {
    test('should provide access to auth service', () => {
      const server = new SeraphC2Server(serverConfig, mockOperatorRepository);
      const authService = server.getAuthService();

      expect(authService).toBeDefined();
    });

    test('should provide access to auth middleware', () => {
      const server = new SeraphC2Server(serverConfig, mockOperatorRepository);
      const authMiddleware = server.getAuthMiddleware();

      expect(authMiddleware).toBeDefined();
    });

    test('should provide access to Express app', () => {
      const server = new SeraphC2Server(serverConfig, mockOperatorRepository);
      const app = server.getApp();

      expect(app).toBeDefined();
      expect(typeof app.use).toBe('function');
      expect(typeof app.get).toBe('function');
      expect(typeof app.post).toBe('function');
    });
  });
});
