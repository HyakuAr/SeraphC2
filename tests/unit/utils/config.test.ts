/**
 * Configuration Utility Tests
 */

describe('Configuration Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Environment Detection', () => {
    it('should detect development environment', () => {
      process.env['NODE_ENV'] = 'development';
      const { configUtils } = require('../../../src/utils/config');
      expect(configUtils.isDevelopment()).toBe(true);
      expect(configUtils.isProduction()).toBe(false);
      expect(configUtils.isTest()).toBe(false);
    });

    it('should detect production environment', () => {
      process.env['NODE_ENV'] = 'production';
      const { configUtils } = require('../../../src/utils/config');
      expect(configUtils.isProduction()).toBe(true);
      expect(configUtils.isDevelopment()).toBe(false);
      expect(configUtils.isTest()).toBe(false);
    });

    it('should detect test environment', () => {
      process.env['NODE_ENV'] = 'test';
      const { configUtils } = require('../../../src/utils/config');
      expect(configUtils.isTest()).toBe(true);
      expect(configUtils.isDevelopment()).toBe(false);
      expect(configUtils.isProduction()).toBe(false);
    });
  });

  describe('Connection String Generation', () => {
    beforeEach(() => {
      process.env['DB_HOST'] = 'localhost';
      process.env['DB_PORT'] = '5432';
      process.env['DB_NAME'] = 'testdb';
      process.env['DB_USER'] = 'testuser';
      process.env['DB_PASSWORD'] = 'testpass';
      process.env['JWT_SECRET'] = 'test_jwt_secret_key_for_testing';
      process.env['ENCRYPTION_KEY'] = 'test_encryption_key_for_testing';
    });

    it('should generate database URL', () => {
      const { configUtils } = require('../../../src/utils/config');
      const dbUrl = configUtils.getDatabaseUrl();
      expect(dbUrl).toBe('postgresql://testuser:testpass@localhost:5432/testdb');
    });

    it('should generate Redis URL without password', () => {
      process.env['REDIS_HOST'] = 'localhost';
      process.env['REDIS_PORT'] = '6379';
      delete process.env['REDIS_PASSWORD'];
      const { configUtils } = require('../../../src/utils/config');
      const redisUrl = configUtils.getRedisUrl();
      expect(redisUrl).toBe('redis://localhost:6379');
    });

    it('should generate Redis URL with password', () => {
      process.env['REDIS_HOST'] = 'localhost';
      process.env['REDIS_PORT'] = '6379';
      process.env['REDIS_PASSWORD'] = 'redispass';
      const { configUtils } = require('../../../src/utils/config');
      const redisUrl = configUtils.getRedisUrl();
      expect(redisUrl).toBe('redis://:redispass@localhost:6379');
    });
  });
});
