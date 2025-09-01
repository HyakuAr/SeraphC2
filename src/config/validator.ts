/**
 * SeraphC2 Configuration Validation System
 * Comprehensive environment variable validation with clear error messages
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnvironmentConfig {
  // Environment
  nodeEnv: 'development' | 'production' | 'staging' | 'test';

  // Server Configuration
  port: number;
  host: string;

  // HTTP Configuration
  httpPort: number;
  httpsPort: number;
  corsOrigins: string[];
  enableRequestLogging: boolean;

  // Database Configuration
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    poolMin: number;
    poolMax: number;
    poolIdleTimeout: number;
    poolConnectionTimeout: number;
    enableHealthCheck: boolean;
    healthCheckInterval: number;
  };

  // Redis Configuration
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    maxRetries: number;
    connectTimeout: number;
  };

  // Session Configuration
  session: {
    ttlSeconds: number;
    maxIdleSeconds: number;
    enableSlidingExpiration: boolean;
    maxConcurrent: number;
    enableDistributed: boolean;
  };

  // Cluster Configuration
  cluster: {
    nodeId: string;
    role: 'primary' | 'secondary' | 'worker';
    enable: boolean;
    heartbeatInterval: number;
    heartbeatTimeout: number;
    enableAutoScaling: boolean;
    minNodes: number;
    maxNodes: number;
  };

  // Load Balancer Configuration
  loadBalancer: {
    algorithm: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted';
    healthCheckInterval: number;
    healthCheckTimeout: number;
    enableStickySessions: boolean;
    enableCircuitBreaker: boolean;
    circuitBreakerThreshold: number;
    maxRetries: number;
  };

  // Monitoring Configuration
  monitoring: {
    enable: boolean;
    metricsInterval: number;
    retentionDays: number;
    enableAlerting: boolean;
    alertCheckInterval: number;
    maxAlertsPerHour: number;
  };

  // Security Configuration
  security: {
    jwtSecret: string;
    encryptionKey: string;
  };

  // Logging Configuration
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
    file: string;
  };

  // Protocol Configuration
  protocols: {
    dnsPort: number;
    smbPipeName: string;
  };

  // SSL/TLS Configuration
  ssl: {
    certPath: string;
    keyPath: string;
  };
}

/**
 * Validates and parses environment variables into typed configuration
 */
export class ConfigValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Validates a required string environment variable
   */
  private validateRequiredString(name: string, defaultValue?: string): string {
    const value = process.env[name] || defaultValue;
    if (!value) {
      this.errors.push(`Required environment variable ${name} is not set`);
      return '';
    }
    return value;
  }

  /**
   * Validates an optional string environment variable
   */
  private validateOptionalString(name: string, defaultValue: string = ''): string {
    return process.env[name] || defaultValue;
  }

  /**
   * Validates a required number environment variable
   */
  private validateRequiredNumber(
    name: string,
    defaultValue?: number,
    min?: number,
    max?: number
  ): number {
    const value = process.env[name];
    if (!value && defaultValue === undefined) {
      this.errors.push(`Required environment variable ${name} is not set`);
      return 0;
    }

    const numValue = value ? parseInt(value, 10) : defaultValue!;
    if (isNaN(numValue)) {
      this.errors.push(`Environment variable ${name} must be a valid number, got: ${value}`);
      return 0;
    }

    if (min !== undefined && numValue < min) {
      this.errors.push(`Environment variable ${name} must be at least ${min}, got: ${numValue}`);
    }

    if (max !== undefined && numValue > max) {
      this.errors.push(`Environment variable ${name} must be at most ${max}, got: ${numValue}`);
    }

    return numValue;
  }

  /**
   * Validates a boolean environment variable
   */
  private validateBoolean(name: string, defaultValue: boolean = false): boolean {
    const value = process.env[name];
    if (!value) return defaultValue;

    const lowerValue = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lowerValue)) return true;
    if (['false', '0', 'no', 'off'].includes(lowerValue)) return false;

    this.warnings.push(
      `Environment variable ${name} has invalid boolean value "${value}", using default: ${defaultValue}`
    );
    return defaultValue;
  }

  /**
   * Validates an enum environment variable
   */
  private validateEnum<T extends string>(name: string, validValues: T[], defaultValue: T): T {
    const value = process.env[name] as T;
    if (!value) return defaultValue;

    if (!validValues.includes(value)) {
      this.errors.push(
        `Environment variable ${name} must be one of: ${validValues.join(', ')}, got: ${value}`
      );
      return defaultValue;
    }

    return value;
  }

  /**
   * Validates file path existence
   */
  private validateFilePath(name: string, path: string, required: boolean = false): boolean {
    if (!path && required) {
      this.errors.push(`Environment variable ${name} is required but not set`);
      return false;
    }

    if (path && !existsSync(resolve(path))) {
      if (required) {
        this.errors.push(`File specified in ${name} does not exist: ${path}`);
      } else {
        this.warnings.push(`File specified in ${name} does not exist: ${path}`);
      }
      return false;
    }

    return true;
  }

  /**
   * Validates security configuration for production environments
   */
  private validateProductionSecurity(config: EnvironmentConfig): void {
    if (config.nodeEnv !== 'production') return;

    // JWT Secret validation
    if (config.security.jwtSecret.length < 32) {
      this.errors.push('JWT_SECRET must be at least 32 characters in production');
    }

    if (config.security.jwtSecret === 'dev_jwt_secret_key_change_in_production_32chars') {
      this.errors.push('JWT_SECRET must be changed from default value in production');
    }

    // Encryption Key validation
    if (config.security.encryptionKey.length < 32) {
      this.errors.push('ENCRYPTION_KEY must be at least 32 characters in production');
    }

    if (config.security.encryptionKey === 'dev_encryption_key_change_in_production_32chars') {
      this.errors.push('ENCRYPTION_KEY must be changed from default value in production');
    }

    // Database password validation
    if (config.database.password.length < 12) {
      this.errors.push('Database password must be at least 12 characters in production');
    }

    if (config.database.password.includes('dev') || config.database.password.includes('password')) {
      this.errors.push(
        'Database password appears to be a development/default password in production'
      );
    }

    // Host binding validation
    if (config.host === 'localhost' || config.host === '127.0.0.1') {
      this.warnings.push(
        'Server is bound to localhost in production - this may limit accessibility'
      );
    }

    // SSL certificate validation
    this.validateFilePath('SSL_CERT_PATH', config.ssl.certPath, true);
    this.validateFilePath('SSL_KEY_PATH', config.ssl.keyPath, true);
  }

  /**
   * Validates logical consistency between configuration values
   */
  private validateConfigConsistency(config: EnvironmentConfig): void {
    // Database pool validation
    if (config.database.poolMin > config.database.poolMax) {
      this.errors.push(
        `Database pool minimum (${config.database.poolMin}) cannot be greater than maximum (${config.database.poolMax})`
      );
    }

    // Port conflict validation
    const ports = [config.port, config.httpPort, config.httpsPort, config.protocols.dnsPort];
    const uniquePorts = new Set(ports);
    if (uniquePorts.size !== ports.length) {
      this.errors.push('Port conflicts detected - multiple services cannot use the same port');
    }

    // Cluster configuration validation
    if (config.cluster.enable) {
      if (config.cluster.minNodes > config.cluster.maxNodes) {
        this.errors.push(
          `Cluster minimum nodes (${config.cluster.minNodes}) cannot be greater than maximum nodes (${config.cluster.maxNodes})`
        );
      }

      if (config.cluster.heartbeatTimeout <= config.cluster.heartbeatInterval) {
        this.errors.push('Cluster heartbeat timeout must be greater than heartbeat interval');
      }
    }

    // Session configuration validation
    if (config.session.maxIdleSeconds > config.session.ttlSeconds) {
      this.warnings.push(
        'Session max idle time is greater than session TTL - sessions may expire before idle timeout'
      );
    }

    // Load balancer validation
    if (config.loadBalancer.healthCheckTimeout >= config.loadBalancer.healthCheckInterval) {
      this.errors.push(
        'Load balancer health check timeout must be less than health check interval'
      );
    }
  }

  /**
   * Main validation method that parses and validates all configuration
   */
  public validate(): ValidationResult & { config?: EnvironmentConfig } {
    this.errors = [];
    this.warnings = [];

    try {
      const config: EnvironmentConfig = {
        // Environment
        nodeEnv: this.validateEnum(
          'NODE_ENV',
          ['development', 'production', 'staging', 'test'],
          'development'
        ),

        // Server Configuration
        port: this.validateRequiredNumber('PORT', 3000, 1, 65535),
        host: this.validateOptionalString('HOST', 'localhost'),

        // HTTP Configuration
        httpPort: this.validateRequiredNumber('HTTP_PORT', 8080, 1, 65535),
        httpsPort: this.validateRequiredNumber('HTTPS_PORT', 8443, 1, 65535),
        corsOrigins: (
          process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001'
        ).split(','),
        enableRequestLogging: this.validateBoolean('ENABLE_REQUEST_LOGGING', true),

        // Database Configuration
        database: {
          host: this.validateRequiredString('DB_HOST', 'localhost'),
          port: this.validateRequiredNumber('DB_PORT', 5432, 1, 65535),
          name: this.validateRequiredString('DB_NAME', 'seraphc2'),
          user: this.validateRequiredString('DB_USER', 'seraphc2'),
          password: this.validateRequiredString('DB_PASSWORD'),
          poolMin: this.validateRequiredNumber('DB_POOL_MIN', 2, 1, 100),
          poolMax: this.validateRequiredNumber('DB_POOL_MAX', 20, 1, 1000),
          poolIdleTimeout: this.validateRequiredNumber('DB_POOL_IDLE_TIMEOUT', 30000, 1000),
          poolConnectionTimeout: this.validateRequiredNumber(
            'DB_POOL_CONNECTION_TIMEOUT',
            10000,
            1000
          ),
          enableHealthCheck: this.validateBoolean('DB_ENABLE_HEALTH_CHECK', true),
          healthCheckInterval: this.validateRequiredNumber('DB_HEALTH_CHECK_INTERVAL', 30000, 5000),
        },

        // Redis Configuration
        redis: {
          host: this.validateRequiredString('REDIS_HOST', 'localhost'),
          port: this.validateRequiredNumber('REDIS_PORT', 6379, 1, 65535),
          password: this.validateOptionalString('REDIS_PASSWORD') || undefined,
          db: this.validateRequiredNumber('REDIS_DB', 0, 0, 15),
          keyPrefix: this.validateOptionalString('REDIS_KEY_PREFIX', 'seraphc2:'),
          maxRetries: this.validateRequiredNumber('REDIS_MAX_RETRIES', 3, 0, 10),
          connectTimeout: this.validateRequiredNumber('REDIS_CONNECT_TIMEOUT', 10000, 1000),
        },

        // Session Configuration
        session: {
          ttlSeconds: this.validateRequiredNumber('SESSION_TTL_SECONDS', 3600, 60),
          maxIdleSeconds: this.validateRequiredNumber('SESSION_MAX_IDLE_SECONDS', 1800, 60),
          enableSlidingExpiration: this.validateBoolean('SESSION_ENABLE_SLIDING_EXPIRATION', true),
          maxConcurrent: this.validateRequiredNumber('SESSION_MAX_CONCURRENT', 10, 1),
          enableDistributed: this.validateBoolean('SESSION_ENABLE_DISTRIBUTED', true),
        },

        // Cluster Configuration
        cluster: {
          nodeId: this.validateOptionalString('NODE_ID', `seraphc2-node-${Date.now()}`),
          role: this.validateEnum('NODE_ROLE', ['primary', 'secondary', 'worker'], 'primary'),
          enable: this.validateBoolean('CLUSTER_ENABLE', false),
          heartbeatInterval: this.validateRequiredNumber('CLUSTER_HEARTBEAT_INTERVAL', 5000, 1000),
          heartbeatTimeout: this.validateRequiredNumber('CLUSTER_HEARTBEAT_TIMEOUT', 15000, 5000),
          enableAutoScaling: this.validateBoolean('CLUSTER_ENABLE_AUTO_SCALING', false),
          minNodes: this.validateRequiredNumber('CLUSTER_MIN_NODES', 1, 1),
          maxNodes: this.validateRequiredNumber('CLUSTER_MAX_NODES', 10, 1),
        },

        // Load Balancer Configuration
        loadBalancer: {
          algorithm: this.validateEnum(
            'LB_ALGORITHM',
            ['round-robin', 'least-connections', 'ip-hash', 'weighted'],
            'round-robin'
          ),
          healthCheckInterval: this.validateRequiredNumber('LB_HEALTH_CHECK_INTERVAL', 30000, 5000),
          healthCheckTimeout: this.validateRequiredNumber('LB_HEALTH_CHECK_TIMEOUT', 5000, 1000),
          enableStickySessions: this.validateBoolean('LB_ENABLE_STICKY_SESSIONS', false),
          enableCircuitBreaker: this.validateBoolean('LB_ENABLE_CIRCUIT_BREAKER', true),
          circuitBreakerThreshold: this.validateRequiredNumber(
            'LB_CIRCUIT_BREAKER_THRESHOLD',
            5,
            1
          ),
          maxRetries: this.validateRequiredNumber('LB_MAX_RETRIES', 3, 0, 10),
        },

        // Monitoring Configuration
        monitoring: {
          enable: this.validateBoolean('MONITORING_ENABLE', true),
          metricsInterval: this.validateRequiredNumber('MONITORING_METRICS_INTERVAL', 30000, 1000),
          retentionDays: this.validateRequiredNumber('MONITORING_RETENTION_DAYS', 7, 1),
          enableAlerting: this.validateBoolean('MONITORING_ENABLE_ALERTING', true),
          alertCheckInterval: this.validateRequiredNumber(
            'MONITORING_ALERT_CHECK_INTERVAL',
            60000,
            10000
          ),
          maxAlertsPerHour: this.validateRequiredNumber('MONITORING_MAX_ALERTS_PER_HOUR', 10, 1),
        },

        // Security Configuration
        security: {
          jwtSecret: this.validateRequiredString('JWT_SECRET'),
          encryptionKey: this.validateRequiredString('ENCRYPTION_KEY'),
        },

        // Logging Configuration
        logging: {
          level: this.validateEnum(
            'LOG_LEVEL',
            ['error', 'warn', 'info', 'debug', 'verbose'],
            'info'
          ),
          file: this.validateOptionalString('LOG_FILE', 'logs/seraphc2.log'),
        },

        // Protocol Configuration
        protocols: {
          dnsPort: this.validateRequiredNumber('DNS_PORT', 53, 1, 65535),
          smbPipeName: this.validateOptionalString('SMB_PIPE_NAME', 'seraphc2'),
        },

        // SSL/TLS Configuration
        ssl: {
          certPath: this.validateOptionalString('SSL_CERT_PATH', 'certificates/server.crt'),
          keyPath: this.validateOptionalString('SSL_KEY_PATH', 'certificates/server.key'),
        },
      };

      // Perform additional validations
      this.validateProductionSecurity(config);
      this.validateConfigConsistency(config);

      return {
        isValid: this.errors.length === 0,
        errors: this.errors,
        warnings: this.warnings,
        config: this.errors.length === 0 ? config : undefined,
      };
    } catch (error) {
      this.errors.push(
        `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        isValid: false,
        errors: this.errors,
        warnings: this.warnings,
      };
    }
  }

  /**
   * Validates configuration at application startup
   */
  public static validateStartupConfig(): EnvironmentConfig {
    const validator = new ConfigValidator();
    const result = validator.validate();

    // Log warnings
    if (result.warnings.length > 0) {
      console.warn('⚠️  Configuration warnings:');
      result.warnings.forEach(warning => console.warn(`   - ${warning}`));
    }

    // Handle errors
    if (!result.isValid) {
      console.error('❌ Configuration validation failed:');
      result.errors.forEach(error => console.error(`   - ${error}`));
      throw new Error(`Configuration validation failed with ${result.errors.length} error(s)`);
    }

    console.log('✅ Configuration validation passed');
    return result.config!;
  }
}

/**
 * Utility functions for configuration validation
 */
export const configValidationUtils = {
  /**
   * Validates that required environment variables are set
   */
  validateRequiredEnvVars(requiredVars: string[]): string[] {
    const missing: string[] = [];
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    });
    return missing;
  },

  /**
   * Validates database connection string format
   */
  validateDatabaseUrl(url: string): boolean {
    const dbUrlPattern = /^postgresql:\/\/[^:]+:[^@]+@[^:]+:\d+\/[^?]+(\?.*)?$/;
    return dbUrlPattern.test(url);
  },

  /**
   * Validates Redis connection string format
   */
  validateRedisUrl(url: string): boolean {
    const redisUrlPattern = /^redis:\/\/(:[^@]+@)?[^:]+:\d+$/;
    return redisUrlPattern.test(url);
  },

  /**
   * Validates JWT secret strength
   */
  validateJwtSecret(secret: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (secret.length < 32) {
      issues.push('JWT secret must be at least 32 characters');
    }

    if (!/[A-Z]/.test(secret)) {
      issues.push('JWT secret should contain uppercase letters');
    }

    if (!/[a-z]/.test(secret)) {
      issues.push('JWT secret should contain lowercase letters');
    }

    if (!/[0-9]/.test(secret)) {
      issues.push('JWT secret should contain numbers');
    }

    if (!/[^A-Za-z0-9]/.test(secret)) {
      issues.push('JWT secret should contain special characters');
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  },

  /**
   * Generates a secure random configuration value
   */
  generateSecureSecret(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
};
