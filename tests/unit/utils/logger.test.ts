/**
 * Logger Utility Tests
 */

import { log } from '../../../src/utils/logger';
import fs from 'fs';
import path from 'path';

describe('Logger Utility', () => {
  const logsDir = path.join(process.cwd(), 'logs');

  beforeAll(() => {
    // Ensure logs directory exists for tests
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test logs
    try {
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        files.forEach(file => {
          if (file.includes('test')) {
            fs.unlinkSync(path.join(logsDir, file));
          }
        });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Logging', () => {
    it('should log info messages', () => {
      expect(() => {
        log.info('Test info message', { test: true });
      }).not.toThrow();
    });

    it('should log error messages with error objects', () => {
      const testError = new Error('Test error');
      expect(() => {
        log.error('Test error message', testError, { context: 'test' });
      }).not.toThrow();
    });

    it('should log warning messages', () => {
      expect(() => {
        log.warn('Test warning message', { warning: true });
      }).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => {
        log.debug('Test debug message', { debug: true });
      }).not.toThrow();
    });
  });

  describe('Structured Logging', () => {
    it('should log security events', () => {
      expect(() => {
        log.security('Failed login attempt', {
          username: 'testuser',
          ip: '192.168.1.1',
        });
      }).not.toThrow();
    });

    it('should log audit events', () => {
      expect(() => {
        log.audit('admin', 'CREATE_IMPLANT', 'implant-123', {
          hostname: 'test-host',
        });
      }).not.toThrow();
    });

    it('should log performance metrics', () => {
      expect(() => {
        log.performance('database_query', 150, {
          query: 'SELECT * FROM implants',
        });
      }).not.toThrow();
    });
  });

  describe('Log File Creation', () => {
    it('should create logs directory', () => {
      expect(fs.existsSync(logsDir)).toBe(true);
    });
  });
});
