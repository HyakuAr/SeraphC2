/**
 * Database migration system for SeraphC2
 */

import { PoolClient } from 'pg';
import { DatabaseConnection } from './connection';

export interface Migration {
  id: string;
  name: string;
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

export class MigrationManager {
  private db: DatabaseConnection;
  private migrations: Migration[] = [];

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  public addMigration(migration: Migration): void {
    this.migrations.push(migration);
  }

  public async initializeMigrationTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await this.db.query(query);
  }

  public async getExecutedMigrations(): Promise<string[]> {
    const result = await this.db.query('SELECT id FROM migrations ORDER BY executed_at ASC');
    return result.rows.map((row: any) => row.id);
  }

  public async executeMigration(migration: Migration): Promise<void> {
    await this.db.transaction(async client => {
      // Execute the migration
      await migration.up(client);

      // Record the migration as executed
      await client.query('INSERT INTO migrations (id, name) VALUES ($1, $2)', [
        migration.id,
        migration.name,
      ]);
    });
  }

  public async rollbackMigration(migration: Migration): Promise<void> {
    await this.db.transaction(async client => {
      // Execute the rollback
      await migration.down(client);

      // Remove the migration record
      await client.query('DELETE FROM migrations WHERE id = $1', [migration.id]);
    });
  }

  public async runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...');

    await this.initializeMigrationTable();
    const executedMigrations = await this.getExecutedMigrations();

    const pendingMigrations = this.migrations.filter(
      migration => !executedMigrations.includes(migration.id)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`📋 Found ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      try {
        console.log(`⚡ Executing migration: ${migration.name}`);
        await this.executeMigration(migration);
        console.log(`✅ Migration completed: ${migration.name}`);
      } catch (error) {
        console.error(`❌ Migration failed: ${migration.name}`, error);
        throw error;
      }
    }

    console.log('✅ All migrations completed successfully');
  }

  public async rollbackLastMigration(): Promise<void> {
    const executedMigrations = await this.getExecutedMigrations();

    if (executedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    const lastMigrationId = executedMigrations[executedMigrations.length - 1];
    const migration = this.migrations.find(m => m.id === lastMigrationId);

    if (!migration) {
      throw new Error(`Migration not found: ${lastMigrationId}`);
    }

    console.log(`🔄 Rolling back migration: ${migration.name}`);
    await this.rollbackMigration(migration);
    console.log(`✅ Rollback completed: ${migration.name}`);
  }
}
