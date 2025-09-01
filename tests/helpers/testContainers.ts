/**
 * Test container management utilities for integration testing
 * Provides Docker containers for PostgreSQL, Redis, and other services
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { PasswordUtils } from '../../src/core/auth/password.utils';

export interface TestContainerConfig {
  postgres?: {
    image?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  };
  redis?: {
    image?: string;
    port?: number;
    password?: string;
  };
}

export interface TestContainers {
  postgres?: {
    pool: Pool;
    config: {
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
    };
  };
  redis?: {
    client: Redis;
    config: {
      host: string;
      port: number;
      password?: string;
    };
  };
}

export class TestContainerManager {
  private containers: TestContainers = {};
  private isSetup = false;

  constructor(private config: TestContainerConfig = {}) {}

  /**
   * Setup test containers
   */
  async setup(): Promise<TestContainers> {
    if (this.isSetup) {
      return this.containers;
    }

    try {
      // Setup PostgreSQL container
      if (this.config.postgres !== undefined) {
        await this.setupPostgres();
      }

      // Setup Redis container
      if (this.config.redis !== undefined) {
        await this.setupRedis();
      }

      this.isSetup = true;
      return this.containers;
    } catch (error) {
      console.error('Failed to setup test containers:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Setup PostgreSQL test container
   */
  private async setupPostgres(): Promise<void> {
    const postgresConfig = {
      image: 'postgres:15-alpine',
      port: 5433, // Use different port to avoid conflicts
      database: 'seraphc2_test',
      username: 'test_user',
      password: 'test_password',
      ...this.config.postgres,
    };

    // In a real implementation, this would use testcontainers library
    // For now, we'll assume containers are managed externally or use local services
    const pool = new Pool({
      host: process.env['TEST_DB_HOST'] || 'localhost',
      port: parseInt(process.env['TEST_DB_PORT'] || postgresConfig.port.toString()),
      database: process.env['TEST_DB_NAME'] || postgresConfig.database,
      user: process.env['TEST_DB_USER'] || postgresConfig.username,
      password: process.env['TEST_DB_PASSWORD'] || postgresConfig.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    try {
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.containers.postgres = {
        pool,
        config: {
          host: process.env['TEST_DB_HOST'] || 'localhost',
          port: parseInt(process.env['TEST_DB_PORT'] || postgresConfig.port.toString()),
          database: process.env['TEST_DB_NAME'] || postgresConfig.database,
          username: process.env['TEST_DB_USER'] || postgresConfig.username,
          password: process.env['TEST_DB_PASSWORD'] || postgresConfig.password,
        },
      };

      console.log('✅ PostgreSQL test container ready');
    } catch (error) {
      await pool.end();
      throw new Error(`Failed to connect to PostgreSQL test container: ${error}`);
    }
  }

  /**
   * Setup Redis test container
   */
  private async setupRedis(): Promise<void> {
    const redisConfig = {
      image: 'redis:7-alpine',
      port: 6380, // Use different port to avoid conflicts
      password: undefined,
      ...this.config.redis,
    };

    const redisOptions: any = {
      host: process.env['TEST_REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['TEST_REDIS_PORT'] || redisConfig.port.toString()),
      lazyConnect: true,
    };

    const redisPassword = process.env['TEST_REDIS_PASSWORD'] || redisConfig.password;
    if (redisPassword) {
      redisOptions.password = redisPassword;
    }

    const client = new Redis(redisOptions);

    // Test connection
    try {
      await client.connect();
      await client.ping();

      this.containers.redis = {
        client,
        config: {
          host: process.env['TEST_REDIS_HOST'] || 'localhost',
          port: parseInt(process.env['TEST_REDIS_PORT'] || redisConfig.port.toString()),
          ...(redisPassword && { password: redisPassword }),
        },
      };

      console.log('✅ Redis test container ready');
    } catch (error) {
      client.disconnect();
      throw new Error(`Failed to connect to Redis test container: ${error}`);
    }
  }

  /**
   * Get PostgreSQL pool
   */
  getPostgresPool(): Pool {
    if (!this.containers.postgres) {
      throw new Error('PostgreSQL container not initialized');
    }
    return this.containers.postgres.pool;
  }

  /**
   * Get Redis client
   */
  getRedisClient(): Redis {
    if (!this.containers.redis) {
      throw new Error('Redis container not initialized');
    }
    return this.containers.redis.client;
  }

  /**
   * Execute SQL migrations for testing
   */
  async runMigrations(): Promise<void> {
    if (!this.containers.postgres) {
      throw new Error('PostgreSQL container not initialized');
    }

    const pool = this.containers.postgres.pool;

    // Create test tables
    const migrations = [
      `
        CREATE TABLE IF NOT EXISTS operators (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'operator',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS implants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          hostname VARCHAR(255),
          ip_address INET,
          operating_system VARCHAR(100),
          architecture VARCHAR(50),
          status VARCHAR(50) DEFAULT 'inactive',
          last_checkin TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS commands (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          implant_id UUID REFERENCES implants(id) ON DELETE CASCADE,
          operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
          command TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          result TEXT,
          timestamp TIMESTAMP DEFAULT NOW(),
          executed_at TIMESTAMP,
          completed_at TIMESTAMP
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
          action VARCHAR(255) NOT NULL,
          resource_type VARCHAR(100),
          resource_id VARCHAR(255),
          details JSONB,
          ip_address INET,
          user_agent TEXT,
          success BOOLEAN DEFAULT true,
          timestamp TIMESTAMP DEFAULT NOW()
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          command TEXT NOT NULL,
          implant_id UUID REFERENCES implants(id) ON DELETE CASCADE,
          operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
          priority INTEGER DEFAULT 5,
          status VARCHAR(50) DEFAULT 'pending',
          scheduled_at TIMESTAMP,
          started_at TIMESTAMP,
          completed_at TIMESTAMP,
          result TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS export_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type VARCHAR(100) NOT NULL,
          format VARCHAR(50) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          progress INTEGER DEFAULT 0,
          total_records INTEGER,
          processed_records INTEGER,
          file_path TEXT,
          file_size BIGINT,
          error_message TEXT,
          operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
          filters JSONB,
          fields JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP
        );
      `,
    ];

    for (const migration of migrations) {
      try {
        await pool.query(migration);
      } catch (error) {
        console.error('Migration failed:', error);
        throw error;
      }
    }

    console.log('✅ Test migrations completed');
  }

  /**
   * Clean up test data
   */
  async cleanupData(): Promise<void> {
    if (!this.containers.postgres) {
      return;
    }

    const pool = this.containers.postgres.pool;

    // Clean up tables in reverse dependency order
    const cleanupQueries = [
      'DELETE FROM audit_logs',
      'DELETE FROM tasks',
      'DELETE FROM commands',
      'DELETE FROM export_jobs',
      'DELETE FROM implants',
      'DELETE FROM operators',
    ];

    for (const query of cleanupQueries) {
      try {
        await pool.query(query);
      } catch (error) {
        console.warn('Cleanup query failed:', query, error);
      }
    }

    // Clean up Redis
    if (this.containers.redis) {
      try {
        await this.containers.redis.client.flushdb();
      } catch (error) {
        console.warn('Redis cleanup failed:', error);
      }
    }

    console.log('✅ Test data cleaned up');
  }

  /**
   * Seed test data
   */
  async seedData(): Promise<{
    operators: any[];
    implants: any[];
    commands: any[];
  }> {
    if (!this.containers.postgres) {
      throw new Error('PostgreSQL container not initialized');
    }

    const pool = this.containers.postgres.pool;

    // Create test operators with proper password hashes
    const adminPasswordHash = PasswordUtils.serializeHashedPassword(
      PasswordUtils.hashPassword('admin123')
    );
    const operatorPasswordHash = PasswordUtils.serializeHashedPassword(
      PasswordUtils.hashPassword('operator123')
    );
    const readonlyPasswordHash = PasswordUtils.serializeHashedPassword(
      PasswordUtils.hashPassword('readonly123')
    );

    const operatorResult = await pool.query(
      `
      INSERT INTO operators (id, username, email, password_hash, role, is_active)
      VALUES 
        ('550e8400-e29b-41d4-a716-446655440001', 'admin', 'admin@test.com', $1, 'administrator', true),
        ('550e8400-e29b-41d4-a716-446655440002', 'operator1', 'op1@test.com', $2, 'operator', true),
        ('550e8400-e29b-41d4-a716-446655440003', 'readonly', 'ro@test.com', $3, 'read_only', true)
      RETURNING *
    `,
      [adminPasswordHash, operatorPasswordHash, readonlyPasswordHash]
    );

    // Create test implants
    const implantResult = await pool.query(`
      INSERT INTO implants (id, name, hostname, ip_address, operating_system, architecture, status)
      VALUES 
        ('660e8400-e29b-41d4-a716-446655440001', 'test-implant-1', 'host1.test.com', '192.168.1.100', 'Windows 10', 'x64', 'active'),
        ('660e8400-e29b-41d4-a716-446655440002', 'test-implant-2', 'host2.test.com', '192.168.1.101', 'Ubuntu 20.04', 'x64', 'inactive'),
        ('660e8400-e29b-41d4-a716-446655440003', 'test-implant-3', 'host3.test.com', '192.168.1.102', 'macOS 12', 'arm64', 'active')
      RETURNING *
    `);

    // Create test commands
    const commandResult = await pool.query(`
      INSERT INTO commands (id, implant_id, operator_id, command, status, result)
      VALUES 
        ('770e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'whoami', 'completed', 'test\\user'),
        ('770e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002', 'pwd', 'pending', null),
        ('770e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'ls -la', 'failed', 'Command not found')
      RETURNING *
    `);

    console.log('✅ Test data seeded');

    return {
      operators: operatorResult.rows,
      implants: implantResult.rows,
      commands: commandResult.rows,
    };
  }

  /**
   * Cleanup all containers and connections
   */
  async cleanup(): Promise<void> {
    try {
      // Close PostgreSQL connections
      if (this.containers.postgres) {
        await this.containers.postgres.pool.end();
        console.log('✅ PostgreSQL connections closed');
      }

      // Close Redis connections
      if (this.containers.redis) {
        this.containers.redis.client.disconnect();
        console.log('✅ Redis connections closed');
      }

      this.containers = {};
      this.isSetup = false;
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Wait for containers to be ready
   */
  async waitForReady(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Test PostgreSQL
        if (this.containers.postgres) {
          const client = await this.containers.postgres.pool.connect();
          await client.query('SELECT 1');
          client.release();
        }

        // Test Redis
        if (this.containers.redis) {
          await this.containers.redis.client.ping();
        }

        console.log('✅ All containers are ready');
        return;
      } catch (error) {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Containers did not become ready within timeout');
  }

  /**
   * Get container status
   */
  getStatus(): {
    postgres: boolean;
    redis: boolean;
    ready: boolean;
  } {
    return {
      postgres: !!this.containers.postgres,
      redis: !!this.containers.redis,
      ready: this.isSetup,
    };
  }
}

// Global test container manager instance
let globalTestContainers: TestContainerManager | null = null;

/**
 * Get or create global test container manager
 */
export function getTestContainers(config?: TestContainerConfig): TestContainerManager {
  if (!globalTestContainers) {
    globalTestContainers = new TestContainerManager(config);
  }
  return globalTestContainers;
}

/**
 * Setup test containers for Jest
 */
export async function setupTestContainers(config?: TestContainerConfig): Promise<TestContainers> {
  const manager = getTestContainers(config);
  const containers = await manager.setup();
  await manager.runMigrations();
  return containers;
}

/**
 * Cleanup test containers for Jest
 */
export async function cleanupTestContainers(): Promise<void> {
  if (globalTestContainers) {
    await globalTestContainers.cleanup();
    globalTestContainers = null;
  }
}

/**
 * Reset test data between tests
 */
export async function resetTestData(): Promise<void> {
  if (globalTestContainers) {
    await globalTestContainers.cleanupData();
    await globalTestContainers.seedData();
  }
}
