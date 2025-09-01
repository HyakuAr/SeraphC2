/**
 * Database configuration for SeraphC2
 */

import { PoolConfig } from 'pg';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432', 10),
    database: process.env['DB_NAME'] || 'seraphc2',
    user: process.env['DB_USER'] || 'seraphc2',
    password: process.env['DB_PASSWORD'] || 'seraphc2_dev_password',
    ssl: process.env['DB_SSL'] === 'true',
    maxConnections: parseInt(process.env['DB_MAX_CONNECTIONS'] || '20', 10),
    idleTimeoutMillis: parseInt(process.env['DB_IDLE_TIMEOUT'] || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env['DB_CONNECTION_TIMEOUT'] || '2000', 10),
  };
}

export function createPoolConfig(config: DatabaseConfig): PoolConfig {
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
  };
}
