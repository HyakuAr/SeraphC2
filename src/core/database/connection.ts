/**
 * Database connection management for SeraphC2
 */

import { Pool, PoolClient } from 'pg';
import { getDatabaseConfig, createPoolConfig } from './config';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;
  private isConnected: boolean = false;

  private constructor() {
    const config = getDatabaseConfig();
    const poolConfig = createPoolConfig(config);
    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', err => {
      console.error('Unexpected error on idle client', err);
    });

    // Handle pool connection events
    this.pool.on('connect', () => {
      console.log('Database client connected');
    });

    this.pool.on('remove', () => {
      console.log('Database client removed');
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public async connect(): Promise<void> {
    try {
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log('✅ Database connection established successfully');
    } catch (error) {
      this.isConnected = false;
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      console.log('✅ Database connection closed successfully');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
      throw error;
    }
  }

  public async getClient(): Promise<PoolClient> {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.pool.connect();
  }

  public async query(text: string, params?: any[]): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && this.pool.totalCount > 0;
  }

  public getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  public getPool(): Pool {
    return this.pool;
  }
}

// Export convenience function to get the pool
export function getPool(): Pool {
  return DatabaseConnection.getInstance().getPool();
}
