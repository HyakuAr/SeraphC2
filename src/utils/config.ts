/**
 * SeraphC2 Environment Configuration Management
 * Centralized configuration with validation and type safety
 */

import dotenv from 'dotenv';
import { log } from './logger';

// Load environment variables
dotenv.config();

// Configuration interface for type safety
export interface Config {
  // Server Configuration
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;

  // Database Configuration
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };

  // Redis Configuration
  redis: {
    host: string;
    port: number;
    password: string | undefined;
  };

  // Security Configuration
  security: {
    jwtSecret: string;
    encryptionKey: string;
  };

  // Logging Configuration
  logging: {
    level: string;
    file: string;
  };

  // Protocol Configuration
  protocols: {
    httpPort: number;
    httpsPort: number;
    dnsPort: number;
    smbPipeName: string;
  };

  // SSL/TLS Configuration
  ssl: {
    certPath: string;
    keyPath: string;
  };
}

// Environment variable validation
function validateEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function validateEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (!value && defaultValue === undefined) {
    throw new Error(`Required environment variable ${name} is not set`);
  }

  const numValue = value ? parseInt(value, 10) : defaultValue!;
  if (isNaN(numValue)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return numValue;
}

// Load and validate configuration
function loadConfig(): Config {
  try {
    const config: Config = {
      nodeEnv: (process.env['NODE_ENV'] as Config['nodeEnv']) || 'development',
      port: validateEnvNumber('PORT', 3000),
      host: validateEnvVar('HOST', 'localhost'),

      database: {
        host: validateEnvVar('DB_HOST', 'localhost'),
        port: validateEnvNumber('DB_PORT', 5432),
        name: validateEnvVar('DB_NAME', 'seraphc2'),
        user: validateEnvVar('DB_USER', 'seraphc2'),
        password: validateEnvVar('DB_PASSWORD'),
      },

      redis: {
        host: validateEnvVar('REDIS_HOST', 'localhost'),
        port: validateEnvNumber('REDIS_PORT', 6379),
        password: process.env['REDIS_PASSWORD'] || undefined,
      },

      security: {
        jwtSecret: validateEnvVar('JWT_SECRET'),
        encryptionKey: validateEnvVar('ENCRYPTION_KEY'),
      },

      logging: {
        level: validateEnvVar('LOG_LEVEL', 'info'),
        file: validateEnvVar('LOG_FILE', 'logs/seraphc2.log'),
      },

      protocols: {
        httpPort: validateEnvNumber('HTTP_PORT', 8080),
        httpsPort: validateEnvNumber('HTTPS_PORT', 8443),
        dnsPort: validateEnvNumber('DNS_PORT', 53),
        smbPipeName: validateEnvVar('SMB_PIPE_NAME', 'seraphc2'),
      },

      ssl: {
        certPath: validateEnvVar('SSL_CERT_PATH', 'certificates/server.crt'),
        keyPath: validateEnvVar('SSL_KEY_PATH', 'certificates/server.key'),
      },
    };

    // Validate node environment
    if (!['development', 'production', 'test'].includes(config.nodeEnv)) {
      throw new Error('NODE_ENV must be one of: development, production, test');
    }

    // Validate security configuration in production
    if (config.nodeEnv === 'production') {
      if (config.security.jwtSecret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters in production');
      }
      if (config.security.encryptionKey.length < 32) {
        throw new Error('ENCRYPTION_KEY must be at least 32 characters in production');
      }
    }

    log.info('Configuration loaded successfully', {
      nodeEnv: config.nodeEnv,
      port: config.port,
      host: config.host,
    });

    return config;
  } catch (error) {
    log.error('Failed to load configuration', error as Error);
    throw error;
  }
}

// Export singleton configuration
export const config = loadConfig();

// Configuration utilities
export const configUtils = {
  isDevelopment: () => config.nodeEnv === 'development',
  isProduction: () => config.nodeEnv === 'production',
  isTest: () => config.nodeEnv === 'test',

  // Get database connection string
  getDatabaseUrl: () => {
    const { host, port, name, user, password } = config.database;
    return `postgresql://${user}:${password}@${host}:${port}/${name}`;
  },

  // Get Redis connection string
  getRedisUrl: () => {
    const { host, port, password } = config.redis;
    const auth = password ? `:${password}@` : '';
    return `redis://${auth}${host}:${port}`;
  },

  // Validate SSL certificate paths
  validateSSLPaths: () => {
    const fs = require('fs');
    const { certPath, keyPath } = config.ssl;

    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL certificate not found: ${certPath}`);
    }
    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL private key not found: ${keyPath}`);
    }

    return true;
  },
};

export default config;
