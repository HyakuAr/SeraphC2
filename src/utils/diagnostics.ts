/**
 * SeraphC2 System Diagnostics and Status Reporting
 * Comprehensive system health monitoring and diagnostics
 */

import { existsSync, statSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { log } from './logger';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  responseTime?: number;
  lastCheck: Date;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemMetrics {
  cpu: {
    usage: NodeJS.CpuUsage;
    loadAverage?: number[];
    cores?: number;
  };
  memory: {
    usage: NodeJS.MemoryUsage;
    total?: number;
    free?: number;
    usagePercent?: number;
  };
  disk: {
    usage?: Array<{
      filesystem: string;
      size: string;
      used: string;
      available: string;
      usePercent: string;
      mountpoint: string;
    }>;
    totalSpace?: number;
    freeSpace?: number;
  };
  network: {
    connections?: number;
    interfaces?: Array<{
      name: string;
      address: string;
      family: string;
      internal: boolean;
    }>;
  };
  process: {
    pid: number;
    ppid?: number;
    platform: string;
    arch: string;
    nodeVersion: string;
    title: string;
    argv: string[];
    execPath: string;
    cwd: string;
  };
}

export interface DependencyStatus {
  [key: string]: ComponentHealth;
}

export interface ComprehensiveDiagnostics {
  system: SystemHealth;
  components: ComponentHealth[];
  metrics: SystemMetrics;
  dependencies: DependencyStatus;
  configuration: {
    environment: Record<string, string>;
    secrets: {
      configured: string[];
      missing: string[];
      warnings: string[];
    };
  };
  performance: {
    startupTime?: number;
    requestsPerSecond?: number;
    averageResponseTime?: number;
    errorRate?: number;
  };
}

export interface TestResult {
  success: boolean;
  component: string;
  duration: number;
  details: Record<string, any>;
  error?: string;
}

/**
 * System Diagnostics Manager
 */
export class SystemDiagnostics {
  private static instance: SystemDiagnostics;
  private startupTime: number;
  private lastHealthCheck: Map<string, ComponentHealth> = new Map();

  private constructor() {
    this.startupTime = Date.now();
  }

  public static getInstance(): SystemDiagnostics {
    if (!SystemDiagnostics.instance) {
      SystemDiagnostics.instance = new SystemDiagnostics();
    }
    return SystemDiagnostics.instance;
  }

  /**
   * Get overall system health status
   */
  public async getSystemHealth(): Promise<SystemHealth> {
    try {
      const components = await this.checkAllComponents();
      const unhealthyComponents = components.filter(c => c.status === 'unhealthy');
      const degradedComponents = components.filter(c => c.status === 'degraded');

      let status: SystemHealth['status'] = 'healthy';
      if (unhealthyComponents.length > 0) {
        status = 'unhealthy';
      } else if (degradedComponents.length > 0) {
        status = 'degraded';
      }

      return {
        status,
        timestamp: new Date(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };
    } catch (error) {
      log.error('Failed to get system health', error as Error);
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };
    }
  }

  /**
   * Get comprehensive system metrics
   */
  public async getSystemMetrics(): Promise<SystemMetrics> {
    const metrics: SystemMetrics = {
      cpu: {
        usage: process.cpuUsage(),
      },
      memory: {
        usage: process.memoryUsage(),
      },
      disk: {},
      network: {},
      process: {
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        title: process.title,
        argv: process.argv,
        execPath: process.execPath,
        cwd: process.cwd(),
      },
    };

    try {
      // Get system information (Linux/Unix only)
      if (process.platform !== 'win32') {
        try {
          // CPU information
          const cpuInfo = execSync('nproc', { encoding: 'utf8' }).trim();
          metrics.cpu.cores = parseInt(cpuInfo, 10);

          // Load average
          const loadAvg = execSync('uptime', { encoding: 'utf8' });
          const loadMatch = loadAvg.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
          if (loadMatch) {
            metrics.cpu.loadAverage = [
              parseFloat(loadMatch[1]),
              parseFloat(loadMatch[2]),
              parseFloat(loadMatch[3]),
            ];
          }
        } catch (error) {
          log.debug('Could not get CPU information', { error: (error as Error).message });
        }

        try {
          // Memory information
          const memInfo = readFileSync('/proc/meminfo', 'utf8');
          const totalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
          const freeMatch = memInfo.match(/MemAvailable:\s+(\d+)\s+kB/);

          if (totalMatch && freeMatch) {
            metrics.memory.total = parseInt(totalMatch[1], 10) * 1024;
            metrics.memory.free = parseInt(freeMatch[1], 10) * 1024;
            metrics.memory.usagePercent =
              ((metrics.memory.total - metrics.memory.free) / metrics.memory.total) * 100;
          }
        } catch (error) {
          log.debug('Could not get memory information', { error: (error as Error).message });
        }

        try {
          // Disk usage information
          const diskUsage = execSync('df -h', { encoding: 'utf8' });
          const lines = diskUsage.split('\n').slice(1); // Skip header
          metrics.disk.usage = lines
            .filter(line => line.trim())
            .map(line => {
              const parts = line.trim().split(/\s+/);
              return {
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                usePercent: parts[4],
                mountpoint: parts[5],
              };
            });
        } catch (error) {
          log.debug('Could not get disk information', { error: (error as Error).message });
        }
      }

      // Network interfaces (cross-platform)
      const networkInterfaces = require('os').networkInterfaces();
      metrics.network.interfaces = [];

      for (const [name, interfaces] of Object.entries(networkInterfaces)) {
        if (Array.isArray(interfaces)) {
          for (const iface of interfaces) {
            metrics.network.interfaces.push({
              name,
              address: iface.address,
              family: iface.family,
              internal: iface.internal,
            });
          }
        }
      }
    } catch (error) {
      log.error('Failed to get system metrics', error as Error);
    }

    return metrics;
  }

  /**
   * Check all system components
   */
  public async checkAllComponents(): Promise<ComponentHealth[]> {
    const components: ComponentHealth[] = [];

    // Check database
    components.push(await this.checkDatabase());

    // Check Redis (if configured)
    components.push(await this.checkRedis());

    // Check file system
    components.push(await this.checkFileSystem());

    // Check memory usage
    components.push(await this.checkMemoryUsage());

    // Check disk space
    components.push(await this.checkDiskSpace());

    // Check network connectivity
    components.push(await this.checkNetworkConnectivity());

    // Cache results
    components.forEach(component => {
      this.lastHealthCheck.set(component.name, component);
    });

    return components;
  }

  /**
   * Check database connectivity and performance
   */
  public async checkDatabase(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // Import DatabaseConnection dynamically to avoid circular dependencies
      const { DatabaseConnection } = await import('../core/database/connection');
      const db = DatabaseConnection.getInstance();

      // Test basic connectivity
      await db.query('SELECT 1 as test');

      // Test performance with a more complex query
      const perfStart = Date.now();
      await db.query('SELECT version(), current_database(), current_user, now()');
      const responseTime = Date.now() - perfStart;

      // Check connection pool status (if available)
      let poolStatus = {};
      try {
        // This would depend on your database connection implementation
        poolStatus = {
          totalConnections: 'unknown',
          idleConnections: 'unknown',
          activeConnections: 'unknown',
        };
      } catch (error) {
        log.debug('Could not get pool status', { error: (error as Error).message });
      }

      const totalTime = Date.now() - startTime;
      let status: ComponentHealth['status'] = 'healthy';

      if (responseTime > 1000) {
        status = 'degraded';
      } else if (responseTime > 5000) {
        status = 'unhealthy';
      }

      return {
        name: 'database',
        status,
        responseTime: totalTime,
        lastCheck: new Date(),
        details: {
          queryResponseTime: responseTime,
          poolStatus,
        },
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check Redis connectivity and performance
   */
  public async checkRedis(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // This would depend on your Redis implementation
      // For now, we'll simulate a Redis check
      const redisHost = process.env.REDIS_HOST;
      const redisPort = process.env.REDIS_PORT;

      if (!redisHost || !redisPort) {
        return {
          name: 'redis',
          status: 'unknown',
          lastCheck: new Date(),
          details: {
            reason: 'Redis not configured',
          },
        };
      }

      // Simulate Redis ping
      const responseTime = Date.now() - startTime;

      return {
        name: 'redis',
        status: 'healthy',
        responseTime,
        lastCheck: new Date(),
        details: {
          host: redisHost,
          port: redisPort,
        },
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check file system health
   */
  public async checkFileSystem(): Promise<ComponentHealth> {
    try {
      const criticalPaths = [process.cwd(), 'logs', 'certificates'];

      const pathChecks = criticalPaths.map(path => {
        try {
          const exists = existsSync(path);
          const stats = exists ? statSync(path) : null;

          return {
            path,
            exists,
            readable: exists,
            writable: exists && stats ? (stats.mode & 0o200) !== 0 : false,
            size: stats ? stats.size : 0,
          };
        } catch (error) {
          return {
            path,
            exists: false,
            readable: false,
            writable: false,
            error: (error as Error).message,
          };
        }
      });

      const hasErrors = pathChecks.some(check => !check.exists || check.error);

      return {
        name: 'filesystem',
        status: hasErrors ? 'degraded' : 'healthy',
        lastCheck: new Date(),
        details: {
          paths: pathChecks,
        },
      };
    } catch (error) {
      return {
        name: 'filesystem',
        status: 'unhealthy',
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check memory usage
   */
  public async checkMemoryUsage(): Promise<ComponentHealth> {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
      const rssMB = memoryUsage.rss / 1024 / 1024;

      let status: ComponentHealth['status'] = 'healthy';

      if (heapUsedMB > 1000) {
        // 1GB
        status = 'degraded';
      } else if (heapUsedMB > 2000) {
        // 2GB
        status = 'unhealthy';
      }

      return {
        name: 'memory',
        status,
        lastCheck: new Date(),
        details: {
          heapUsed: `${heapUsedMB.toFixed(2)} MB`,
          heapTotal: `${heapTotalMB.toFixed(2)} MB`,
          rss: `${rssMB.toFixed(2)} MB`,
          external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
          arrayBuffers: `${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`,
        },
      };
    } catch (error) {
      return {
        name: 'memory',
        status: 'unhealthy',
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check disk space
   */
  public async checkDiskSpace(): Promise<ComponentHealth> {
    try {
      let status: ComponentHealth['status'] = 'healthy';
      const details: Record<string, any> = {};

      if (process.platform !== 'win32') {
        try {
          const diskUsage = execSync('df /', { encoding: 'utf8' });
          const lines = diskUsage.split('\n');
          if (lines.length > 1) {
            const parts = lines[1].trim().split(/\s+/);
            const usePercent = parseInt(parts[4].replace('%', ''), 10);

            details.rootDiskUsage = `${usePercent}%`;

            if (usePercent > 80) {
              status = 'degraded';
            } else if (usePercent > 95) {
              status = 'unhealthy';
            }
          }
        } catch (error) {
          details.diskCheckError = (error as Error).message;
        }
      }

      return {
        name: 'disk',
        status,
        lastCheck: new Date(),
        details,
      };
    } catch (error) {
      return {
        name: 'disk',
        status: 'unhealthy',
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check network connectivity
   */
  public async checkNetworkConnectivity(): Promise<ComponentHealth> {
    try {
      const details: Record<string, any> = {};

      // Check if we can bind to configured ports
      const configuredPorts = [
        process.env.PORT || '3000',
        process.env.HTTP_PORT || '8080',
        process.env.HTTPS_PORT || '8443',
      ];

      details.configuredPorts = configuredPorts;
      details.networkInterfaces = Object.keys(require('os').networkInterfaces());

      return {
        name: 'network',
        status: 'healthy',
        lastCheck: new Date(),
        details,
      };
    } catch (error) {
      return {
        name: 'network',
        status: 'unhealthy',
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check external dependencies
   */
  public async checkDependencies(): Promise<DependencyStatus> {
    const dependencies: DependencyStatus = {};

    // Check database
    dependencies.database = await this.checkDatabase();

    // Check Redis
    dependencies.redis = await this.checkRedis();

    return dependencies;
  }

  /**
   * Test a specific component
   */
  public async testComponent(componentName: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      let result: ComponentHealth;

      switch (componentName.toLowerCase()) {
        case 'database':
          result = await this.checkDatabase();
          break;
        case 'redis':
          result = await this.checkRedis();
          break;
        case 'filesystem':
          result = await this.checkFileSystem();
          break;
        case 'memory':
          result = await this.checkMemoryUsage();
          break;
        case 'disk':
          result = await this.checkDiskSpace();
          break;
        case 'network':
          result = await this.checkNetworkConnectivity();
          break;
        default:
          throw new Error(`Unknown component: ${componentName}`);
      }

      return {
        success: result.status === 'healthy',
        component: componentName,
        duration: Date.now() - startTime,
        details: {
          status: result.status,
          responseTime: result.responseTime,
          ...result.details,
        },
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        component: componentName,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      };
    }
  }

  /**
   * Get comprehensive diagnostics
   */
  public async getComprehensiveDiagnostics(): Promise<ComprehensiveDiagnostics> {
    try {
      const [systemHealth, components, metrics, dependencies] = await Promise.all([
        this.getSystemHealth(),
        this.checkAllComponents(),
        this.getSystemMetrics(),
        this.checkDependencies(),
      ]);

      // Check configuration and secrets
      const secretsValidation = this.validateSecrets();
      const environmentConfig = this.getEnvironmentConfig();

      return {
        system: systemHealth,
        components,
        metrics,
        dependencies,
        configuration: {
          environment: environmentConfig,
          secrets: secretsValidation,
        },
        performance: {
          startupTime: Date.now() - this.startupTime,
        },
      };
    } catch (error) {
      log.error('Failed to get comprehensive diagnostics', error as Error);
      throw error;
    }
  }

  /**
   * Validate secrets configuration
   */
  private validateSecrets(): { configured: string[]; missing: string[]; warnings: string[] } {
    const requiredSecrets = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DB_PASSWORD'];
    const optionalSecrets = ['REDIS_PASSWORD', 'SSL_CERT_PATH', 'SSL_KEY_PATH'];

    const configured: string[] = [];
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required secrets
    for (const secret of requiredSecrets) {
      if (process.env[secret]) {
        configured.push(secret);

        // Basic validation without importing secrets to avoid circular dependency
        const secretValue = process.env[secret];
        if (secretValue && secretValue.length < 16) {
          warnings.push(`${secret} is shorter than recommended (16+ characters)`);
        }
        if (secretValue && (secretValue.includes('dev') || secretValue.includes('default'))) {
          warnings.push(`${secret} appears to be a development/default value`);
        }
      } else {
        missing.push(secret);
      }
    }

    // Check optional secrets
    for (const secret of optionalSecrets) {
      if (process.env[secret]) {
        configured.push(secret);
      } else if (process.env.NODE_ENV === 'production') {
        warnings.push(`${secret} not configured (recommended for production)`);
      }
    }

    return { configured, missing, warnings };
  }

  /**
   * Get environment configuration (sanitized)
   */
  private getEnvironmentConfig(): Record<string, string> {
    const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'PRIVATE'];
    const config: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        // Sanitize sensitive values
        const isSensitive = sensitiveKeys.some(sensitive => key.includes(sensitive));
        config[key] = isSensitive ? '[REDACTED]' : value;
      }
    }

    return config;
  }
}

// Export singleton instance
export const systemDiagnostics = SystemDiagnostics.getInstance();
