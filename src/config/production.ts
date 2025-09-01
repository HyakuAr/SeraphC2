/**
 * SeraphC2 Production Configuration Defaults
 * Production-optimized configuration settings with security best practices
 */

import { EnvironmentConfig } from './validator';

/**
 * Production-specific configuration defaults
 * These values are optimized for production environments with security and performance in mind
 */
export const productionDefaults: Partial<EnvironmentConfig> = {
  // Environment
  nodeEnv: 'production',

  // Server Configuration - Bind to all interfaces in production
  host: '0.0.0.0',
  port: 3000,

  // HTTP Configuration - Production ports
  httpPort: 80,
  httpsPort: 443,
  enableRequestLogging: false, // Disable detailed request logging in production for performance

  // Database Configuration - Production-optimized pool settings
  database: {
    host: 'localhost',
    port: 5432,
    name: 'seraphc2_prod',
    user: 'seraphc2_prod',
    password: '', // Must be set via environment variable
    poolMin: 5, // Higher minimum for production
    poolMax: 50, // Higher maximum for production load
    poolIdleTimeout: 60000, // 1 minute
    poolConnectionTimeout: 15000, // 15 seconds
    enableHealthCheck: true,
    healthCheckInterval: 30000, // 30 seconds
  },

  // Redis Configuration - Production settings
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined, // Should be set for production
    db: 0,
    keyPrefix: 'seraphc2:prod:',
    maxRetries: 5, // More retries for production
    connectTimeout: 15000, // Longer timeout for production
  },

  // Session Configuration - Secure production settings
  session: {
    ttlSeconds: 7200, // 2 hours
    maxIdleSeconds: 3600, // 1 hour
    enableSlidingExpiration: true,
    maxConcurrent: 5, // Stricter limit for production
    enableDistributed: true, // Enable for production scaling
  },

  // Cluster Configuration - Production clustering
  cluster: {
    nodeId: '', // Should be set via environment variable
    role: 'primary',
    enable: true, // Enable clustering in production
    heartbeatInterval: 10000, // 10 seconds
    heartbeatTimeout: 30000, // 30 seconds
    enableAutoScaling: true,
    minNodes: 2, // Minimum redundancy
    maxNodes: 20, // Allow scaling
  },

  // Load Balancer Configuration - Production load balancing
  loadBalancer: {
    algorithm: 'least-connections', // Better for production
    healthCheckInterval: 15000, // 15 seconds
    healthCheckTimeout: 5000, // 5 seconds
    enableStickySessions: true, // Enable for session consistency
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 3, // Stricter threshold
    maxRetries: 2, // Fewer retries for faster failover
  },

  // Monitoring Configuration - Comprehensive production monitoring
  monitoring: {
    enable: true,
    metricsInterval: 60000, // 1 minute intervals
    retentionDays: 30, // 30 days retention
    enableAlerting: true,
    alertCheckInterval: 30000, // 30 seconds
    maxAlertsPerHour: 20, // Allow more alerts in production
  },

  // Security Configuration - Production security
  security: {
    jwtSecret: '', // Must be set via environment variable
    encryptionKey: '', // Must be set via environment variable
  },

  // Logging Configuration - Production logging
  logging: {
    level: 'warn', // Less verbose logging in production
    file: '/var/log/seraphc2/seraphc2.log',
  },

  // Protocol Configuration - Standard production ports
  protocols: {
    dnsPort: 53,
    smbPipeName: 'seraphc2_prod',
  },

  // SSL/TLS Configuration - Production certificates
  ssl: {
    certPath: '/etc/ssl/certs/seraphc2.crt',
    keyPath: '/etc/ssl/private/seraphc2.key',
  },
};

/**
 * Staging environment configuration defaults
 * Similar to production but with some relaxed settings for testing
 */
export const stagingDefaults: Partial<EnvironmentConfig> = {
  ...productionDefaults,

  // Environment
  nodeEnv: 'staging',

  // Database Configuration - Staging database
  database: {
    ...productionDefaults.database!,
    name: 'seraphc2_staging',
    user: 'seraphc2_staging',
    poolMin: 2,
    poolMax: 20,
  },

  // Redis Configuration - Staging Redis
  redis: {
    ...productionDefaults.redis!,
    keyPrefix: 'seraphc2:staging:',
    db: 1, // Different database for staging
  },

  // Session Configuration - More relaxed for staging
  session: {
    ...productionDefaults.session!,
    maxConcurrent: 10,
  },

  // Cluster Configuration - Smaller cluster for staging
  cluster: {
    ...productionDefaults.cluster!,
    minNodes: 1,
    maxNodes: 5,
    enableAutoScaling: false, // Disable auto-scaling in staging
  },

  // Monitoring Configuration - More verbose for staging
  monitoring: {
    ...productionDefaults.monitoring!,
    retentionDays: 7, // Shorter retention
  },

  // Logging Configuration - More verbose for staging
  logging: {
    level: 'info',
    file: '/var/log/seraphc2/seraphc2-staging.log',
  },

  // Protocol Configuration - Staging pipe name
  protocols: {
    ...productionDefaults.protocols!,
    smbPipeName: 'seraphc2_staging',
  },
};

/**
 * Production security checklist and validation
 */
export const productionSecurityChecklist = {
  /**
   * Validates that all required security configurations are set for production
   */
  validateProductionSecurity(config: EnvironmentConfig): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check JWT secret
    if (!config.security.jwtSecret || config.security.jwtSecret.length < 32) {
      issues.push('JWT_SECRET must be at least 32 characters in production');
    }

    if (
      config.security.jwtSecret.includes('dev') ||
      config.security.jwtSecret.includes('default')
    ) {
      issues.push('JWT_SECRET appears to be a development/default value');
    }

    // Check encryption key
    if (!config.security.encryptionKey || config.security.encryptionKey.length < 32) {
      issues.push('ENCRYPTION_KEY must be at least 32 characters in production');
    }

    if (
      config.security.encryptionKey.includes('dev') ||
      config.security.encryptionKey.includes('default')
    ) {
      issues.push('ENCRYPTION_KEY appears to be a development/default value');
    }

    // Check database password
    if (!config.database.password || config.database.password.length < 12) {
      issues.push('Database password must be at least 12 characters in production');
    }

    if (config.database.password.includes('dev') || config.database.password.includes('password')) {
      issues.push('Database password appears to be a development/default value');
    }

    // Check Redis password
    if (!config.redis.password) {
      issues.push('Redis password should be set in production');
    }

    // Check SSL configuration
    if (!config.ssl.certPath || !config.ssl.keyPath) {
      issues.push('SSL certificate and key paths must be configured in production');
    }

    // Check host binding
    if (config.host === 'localhost' || config.host === '127.0.0.1') {
      issues.push('Server should not be bound to localhost in production');
    }

    // Check logging level
    if (config.logging.level === 'debug' || config.logging.level === 'verbose') {
      issues.push(
        'Logging level should not be debug/verbose in production for security and performance'
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  },

  /**
   * Gets production security recommendations
   */
  getSecurityRecommendations(): string[] {
    return [
      'Use strong, randomly generated secrets for JWT_SECRET and ENCRYPTION_KEY',
      'Enable Redis authentication with a strong password',
      'Use proper SSL/TLS certificates from a trusted CA',
      'Bind server to specific interfaces, not 0.0.0.0 if possible',
      'Enable database connection encryption (SSL)',
      'Use environment-specific database credentials',
      'Enable audit logging for security events',
      'Configure proper firewall rules',
      'Use secrets management system (e.g., HashiCorp Vault, AWS Secrets Manager)',
      'Enable monitoring and alerting for security events',
      'Regularly rotate secrets and certificates',
      'Use least-privilege principle for database and Redis users',
    ];
  },
};

/**
 * Production performance optimization settings
 */
export const productionPerformanceSettings = {
  /**
   * Gets performance-optimized configuration overrides
   */
  getPerformanceConfig(): Partial<EnvironmentConfig> {
    return {
      // Database optimizations
      database: {
        ...productionDefaults.database!,
        poolMin: 10, // Higher minimum for better performance
        poolMax: 100, // Higher maximum for high load
        poolIdleTimeout: 300000, // 5 minutes
        poolConnectionTimeout: 20000, // 20 seconds
        healthCheckInterval: 60000, // 1 minute
      },

      // Redis optimizations
      redis: {
        ...productionDefaults.redis!,
        maxRetries: 3, // Fewer retries for faster failover
        connectTimeout: 10000, // 10 seconds
      },

      // Session optimizations
      session: {
        ...productionDefaults.session!,
        ttlSeconds: 14400, // 4 hours
        maxIdleSeconds: 7200, // 2 hours
      },

      // Monitoring optimizations
      monitoring: {
        ...productionDefaults.monitoring!,
        metricsInterval: 30000, // 30 seconds for better granularity
        alertCheckInterval: 15000, // 15 seconds
      },
    };
  },

  /**
   * Gets high-availability configuration overrides
   */
  getHighAvailabilityConfig(): Partial<EnvironmentConfig> {
    return {
      // Cluster settings for HA
      cluster: {
        ...productionDefaults.cluster!,
        minNodes: 3, // Minimum for proper HA
        maxNodes: 50, // Allow high scaling
        heartbeatInterval: 5000, // 5 seconds
        heartbeatTimeout: 15000, // 15 seconds
        enableAutoScaling: true,
      },

      // Load balancer settings for HA
      loadBalancer: {
        ...productionDefaults.loadBalancer!,
        healthCheckInterval: 10000, // 10 seconds
        healthCheckTimeout: 3000, // 3 seconds
        circuitBreakerThreshold: 2, // Faster failover
        maxRetries: 1, // Single retry for faster failover
      },

      // Session settings for HA
      session: {
        ...productionDefaults.session!,
        enableDistributed: true,
        maxConcurrent: 3, // Stricter limit for HA
      },
    };
  },
};

/**
 * Environment-specific configuration factory
 */
export class ProductionConfigFactory {
  /**
   * Creates configuration based on environment type
   */
  static createConfig(
    environment: 'production' | 'staging' | 'high-availability'
  ): Partial<EnvironmentConfig> {
    switch (environment) {
      case 'production':
        return productionDefaults;

      case 'staging':
        return stagingDefaults;

      case 'high-availability':
        return {
          ...productionDefaults,
          ...productionPerformanceSettings.getHighAvailabilityConfig(),
        };

      default:
        throw new Error(`Unknown environment type: ${environment}`);
    }
  }

  /**
   * Merges environment-specific defaults with current environment variables
   */
  static mergeWithEnvironment(defaults: Partial<EnvironmentConfig>): Record<string, string> {
    const envVars: Record<string, string> = {};

    // Helper function to set environment variable if not already set
    const setIfNotExists = (key: string, value: string | number | boolean) => {
      if (!process.env[key]) {
        envVars[key] = String(value);
      }
    };

    if (defaults.nodeEnv) setIfNotExists('NODE_ENV', defaults.nodeEnv);
    if (defaults.port) setIfNotExists('PORT', defaults.port);
    if (defaults.host) setIfNotExists('HOST', defaults.host);

    // Database defaults
    if (defaults.database) {
      const db = defaults.database;
      if (db.host) setIfNotExists('DB_HOST', db.host);
      if (db.port) setIfNotExists('DB_PORT', db.port);
      if (db.name) setIfNotExists('DB_NAME', db.name);
      if (db.user) setIfNotExists('DB_USER', db.user);
      if (db.poolMin) setIfNotExists('DB_POOL_MIN', db.poolMin);
      if (db.poolMax) setIfNotExists('DB_POOL_MAX', db.poolMax);
      if (db.poolIdleTimeout) setIfNotExists('DB_POOL_IDLE_TIMEOUT', db.poolIdleTimeout);
      if (db.poolConnectionTimeout)
        setIfNotExists('DB_POOL_CONNECTION_TIMEOUT', db.poolConnectionTimeout);
      if (db.enableHealthCheck !== undefined)
        setIfNotExists('DB_ENABLE_HEALTH_CHECK', db.enableHealthCheck);
      if (db.healthCheckInterval)
        setIfNotExists('DB_HEALTH_CHECK_INTERVAL', db.healthCheckInterval);
    }

    // Redis defaults
    if (defaults.redis) {
      const redis = defaults.redis;
      if (redis.host) setIfNotExists('REDIS_HOST', redis.host);
      if (redis.port) setIfNotExists('REDIS_PORT', redis.port);
      if (redis.db !== undefined) setIfNotExists('REDIS_DB', redis.db);
      if (redis.keyPrefix) setIfNotExists('REDIS_KEY_PREFIX', redis.keyPrefix);
      if (redis.maxRetries) setIfNotExists('REDIS_MAX_RETRIES', redis.maxRetries);
      if (redis.connectTimeout) setIfNotExists('REDIS_CONNECT_TIMEOUT', redis.connectTimeout);
    }

    // Add other configuration sections as needed...

    return envVars;
  }
}
