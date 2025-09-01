import { Pool, PoolClient } from 'pg';
import { DatabaseConnection } from './connection';

export class DatabaseService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || DatabaseConnection.getInstance().getPool();
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
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

  async exportDatabase(): Promise<string> {
    // This is a simplified implementation
    // In a real scenario, you'd use pg_dump or similar
    const tables = await this.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
    `);

    let dump = '-- Database Export\n';
    for (const table of tables.rows) {
      const data = await this.query(`SELECT * FROM ${table.tablename}`);
      dump += `-- Table: ${table.tablename}\n`;
      dump += `-- Rows: ${data.rows.length}\n\n`;
    }

    return dump;
  }

  async importDatabase(dumpData: string): Promise<void> {
    // This is a simplified implementation
    // In a real scenario, you'd parse and execute SQL statements
    console.log('Importing database from dump:', dumpData.substring(0, 100) + '...');
  }

  async getConfiguration(): Promise<any> {
    // Return database configuration (non-sensitive parts)
    return {
      maxConnections: this.pool.options.max,
      database: this.pool.options.database,
      host: this.pool.options.host,
      port: this.pool.options.port,
    };
  }

  async sanitizeDatabase(): Promise<void> {
    // Clear sensitive data during emergency shutdown
    const sensitiveQueries = [
      'DELETE FROM sessions',
      'DELETE FROM api_keys',
      "DELETE FROM operators WHERE role != 'administrator'",
      "UPDATE operators SET password_hash = 'SANITIZED' WHERE role != 'administrator'",
    ];

    for (const query of sensitiveQueries) {
      try {
        await this.query(query);
      } catch (error) {
        console.warn(`Failed to execute sanitization query: ${query}`, error);
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
