#!/usr/bin/env ts-node

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { Client } from 'pg';

interface MigrationInfo {
  id: string;
  name: string;
  filename: string;
  appliedAt?: Date;
  checksum?: string;
}

interface MigrationStatus {
  pending: MigrationInfo[];
  applied: MigrationInfo[];
  total: number;
  lastApplied?: MigrationInfo;
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

class MigrationManager {
  private projectRoot: string;
  private migrationsDir: string;
  private dbConfig: DatabaseConfig;

  constructor() {
    this.projectRoot = process.cwd();
    this.migrationsDir = join(this.projectRoot, 'migrations');
    this.dbConfig = this.loadDatabaseConfig();
  }

  /**
   * Load database configuration from environment
   */
  private loadDatabaseConfig(): DatabaseConfig {
    // Load environment variables
    require('dotenv').config();

    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      // Parse DATABASE_URL
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: url.username,
        password: url.password,
        ssl:
          url.searchParams.get('ssl') === 'true' ||
          (url.searchParams.get('sslmode') !== 'disable' && process.env.NODE_ENV === 'production'),
      };
    } else {
      // Use individual environment variables
      return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'seraphc2',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl:
          process.env.DB_SSL === 'true' ||
          (process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'),
      };
    }
  }

  /**
   * Run database migrations
   */
  async runMigrations(direction: 'up' | 'down' = 'up', count?: number): Promise<void> {
    console.log(`🔄 Running migrations ${direction}...`);

    try {
      await this.ensureMigrationsTable();

      const status = await this.getMigrationStatus();

      if (direction === 'up') {
        if (status.pending.length === 0) {
          console.log('✅ No pending migrations to run');
          return;
        }

        const migrationsToRun = count ? status.pending.slice(0, count) : status.pending;
        console.log(`📋 Running ${migrationsToRun.length} migration(s):`);

        for (const migration of migrationsToRun) {
          await this.runSingleMigration(migration, 'up');
        }
      } else {
        if (status.applied.length === 0) {
          console.log('✅ No applied migrations to rollback');
          return;
        }

        const migrationsToRollback = count
          ? status.applied.slice(-count).reverse()
          : [status.applied[status.applied.length - 1]];

        console.log(`📋 Rolling back ${migrationsToRollback.length} migration(s):`);

        for (const migration of migrationsToRollback) {
          await this.runSingleMigration(migration, 'down');
        }
      }

      console.log('✅ Migration completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    const allMigrations = this.getAllMigrations();
    const appliedMigrations = await this.getAppliedMigrations();

    const appliedIds = new Set(appliedMigrations.map(m => m.id));

    const applied = allMigrations.filter(m => appliedIds.has(m.id));
    const pending = allMigrations.filter(m => !appliedIds.has(m.id));

    // Add applied timestamps
    applied.forEach(migration => {
      const appliedMigration = appliedMigrations.find(m => m.id === migration.id);
      if (appliedMigration) {
        migration.appliedAt = appliedMigration.appliedAt;
      }
    });

    return {
      pending,
      applied,
      total: allMigrations.length,
      lastApplied: applied.length > 0 ? applied[applied.length - 1] : undefined,
    };
  }

  /**
   * Create a new migration file
   */
  async createMigration(name: string): Promise<string> {
    if (!name) {
      throw new Error('Migration name is required');
    }

    // Generate migration ID (timestamp + sequence)
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const existingMigrations = this.getAllMigrations();
    const sequence = String(existingMigrations.length + 1).padStart(3, '0');
    const migrationId = `${sequence}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    const filename = `${migrationId}.sql`;
    const filepath = join(this.migrationsDir, filename);

    if (existsSync(filepath)) {
      throw new Error(`Migration file already exists: ${filename}`);
    }

    const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}
-- Description: Add description here

-- Up migration
BEGIN;

-- Add your migration SQL here
-- Example:
-- CREATE TABLE example_table (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

COMMIT;

-- Down migration (for rollback)
-- Uncomment and modify as needed:
-- BEGIN;
-- DROP TABLE IF EXISTS example_table;
-- COMMIT;
`;

    writeFileSync(filepath, template, 'utf-8');

    console.log(`✅ Created migration: ${filename}`);
    console.log(`📝 Edit the file to add your migration SQL`);

    return filepath;
  }

  /**
   * Validate migrations
   */
  async validateMigrations(): Promise<boolean> {
    console.log('🔍 Validating migrations...');

    try {
      const migrations = this.getAllMigrations();
      let isValid = true;

      // Check for duplicate IDs
      const ids = migrations.map(m => m.id);
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

      if (duplicateIds.length > 0) {
        console.error(`❌ Duplicate migration IDs found: ${duplicateIds.join(', ')}`);
        isValid = false;
      }

      // Check migration file syntax
      for (const migration of migrations) {
        const filepath = join(this.migrationsDir, migration.filename);
        const content = readFileSync(filepath, 'utf-8');

        // Basic SQL syntax validation
        if (!content.trim()) {
          console.error(`❌ Empty migration file: ${migration.filename}`);
          isValid = false;
        }

        // Check for common SQL issues
        if (content.includes('DROP DATABASE') || content.includes('DROP SCHEMA')) {
          console.warn(`⚠️  Potentially dangerous operation in ${migration.filename}`);
        }
      }

      // Check database connectivity
      try {
        await this.testDatabaseConnection();
      } catch (error) {
        console.error('❌ Database connection failed:', error);
        isValid = false;
      }

      if (isValid) {
        console.log('✅ All migrations are valid');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Migration validation failed:', error);
      return false;
    }
  }

  /**
   * Reset database (rollback all migrations)
   */
  async resetDatabase(): Promise<void> {
    console.log('⚠️  Resetting database (rolling back all migrations)...');

    const status = await this.getMigrationStatus();

    if (status.applied.length === 0) {
      console.log('✅ No migrations to rollback');
      return;
    }

    // Rollback all applied migrations in reverse order
    const migrationsToRollback = [...status.applied].reverse();

    for (const migration of migrationsToRollback) {
      await this.runSingleMigration(migration, 'down');
    }

    console.log('✅ Database reset completed');
  }

  /**
   * Get all migration files
   */
  private getAllMigrations(): MigrationInfo[] {
    if (!existsSync(this.migrationsDir)) {
      return [];
    }

    const files = readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const id = basename(filename, '.sql');
      const name = id.replace(/^\d+_/, '').replace(/_/g, ' ');

      return {
        id,
        name,
        filename,
      };
    });
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(): Promise<MigrationInfo[]> {
    const client = new Client(this.dbConfig);

    try {
      await client.connect();

      const result = await client.query(`
        SELECT migration_id, applied_at 
        FROM schema_migrations 
        ORDER BY applied_at ASC
      `);

      return result.rows.map(row => ({
        id: row.migration_id,
        name: row.migration_id.replace(/^\d+_/, '').replace(/_/g, ' '),
        filename: `${row.migration_id}.sql`,
        appliedAt: new Date(row.applied_at),
      }));
    } finally {
      await client.end();
    }
  }

  /**
   * Ensure migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    const client = new Client(this.dbConfig);

    try {
      await client.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          migration_id VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          checksum VARCHAR(64)
        )
      `);
    } finally {
      await client.end();
    }
  }

  /**
   * Run a single migration
   */
  private async runSingleMigration(
    migration: MigrationInfo,
    direction: 'up' | 'down'
  ): Promise<void> {
    const filepath = join(this.migrationsDir, migration.filename);
    const content = readFileSync(filepath, 'utf-8');

    console.log(`  ${direction === 'up' ? '↑' : '↓'} ${migration.id}: ${migration.name}`);

    const client = new Client(this.dbConfig);

    try {
      await client.connect();
      await client.query('BEGIN');

      if (direction === 'up') {
        // Extract up migration (everything before "-- Down migration")
        const upContent = content.split('-- Down migration')[0];
        await client.query(upContent);

        // Record migration as applied
        await client.query(
          'INSERT INTO schema_migrations (migration_id, applied_at) VALUES ($1, CURRENT_TIMESTAMP)',
          [migration.id]
        );
      } else {
        // Extract down migration (everything after "-- Down migration")
        const parts = content.split('-- Down migration');
        if (parts.length < 2) {
          console.warn(`No down migration found in ${migration.filename}, skipping rollback`);
          // Just remove the migration record without running any SQL
          await client.query('DELETE FROM schema_migrations WHERE migration_id = $1', [
            migration.id,
          ]);
        } else {
          const downContent = parts[1].trim();
          if (downContent) {
            await client.query(downContent);
          }
          // Remove migration record
          await client.query('DELETE FROM schema_migrations WHERE migration_id = $1', [
            migration.id,
          ]);
        }
      }

      await client.query('COMMIT');
      console.log(`    ✅ ${direction === 'up' ? 'Applied' : 'Rolled back'} successfully`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`    ❌ Failed: ${error}`);
      throw error;
    } finally {
      await client.end();
    }
  }

  /**
   * Test database connection
   */
  private async testDatabaseConnection(): Promise<void> {
    const client = new Client(this.dbConfig);

    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end();
    }
  }

  /**
   * Print migration status
   */
  async printStatus(): Promise<void> {
    const status = await this.getMigrationStatus();

    console.log('\n📊 Migration Status:');
    console.log(`   Total migrations: ${status.total}`);
    console.log(`   Applied: ${status.applied.length}`);
    console.log(`   Pending: ${status.pending.length}`);

    if (status.lastApplied) {
      console.log(
        `   Last applied: ${status.lastApplied.id} (${status.lastApplied.appliedAt?.toISOString()})`
      );
    }

    if (status.pending.length > 0) {
      console.log('\n📋 Pending migrations:');
      status.pending.forEach(migration => {
        console.log(`   - ${migration.id}: ${migration.name}`);
      });
    }

    if (status.applied.length > 0) {
      console.log('\n✅ Applied migrations:');
      status.applied.forEach(migration => {
        console.log(
          `   - ${migration.id}: ${migration.name} (${migration.appliedAt?.toISOString()})`
        );
      });
    }

    console.log('');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new MigrationManager();

  try {
    switch (command) {
      case 'up':
        const upCount = args[1] ? parseInt(args[1]) : undefined;
        await manager.runMigrations('up', upCount);
        break;

      case 'down':
        const downCount = args[1] ? parseInt(args[1]) : 1;
        await manager.runMigrations('down', downCount);
        break;

      case 'status':
        await manager.printStatus();
        break;

      case 'create':
        const migrationName = args.slice(1).join(' ');
        if (!migrationName) {
          console.error('❌ Migration name is required');
          process.exit(1);
        }
        await manager.createMigration(migrationName);
        break;

      case 'validate':
        const isValid = await manager.validateMigrations();
        process.exit(isValid ? 0 : 1);

      case 'reset':
        console.log('⚠️  This will rollback ALL migrations. Are you sure? (y/N)');
        // In a real implementation, you'd want to add confirmation prompt
        await manager.resetDatabase();
        break;

      default:
        console.log(`
SeraphC2 Migration Manager

Usage: ts-node scripts/migrate.ts <command> [options]

Commands:
  up [count]        Run pending migrations (all or specified count)
  down [count]      Rollback migrations (1 or specified count)
  status            Show migration status
  create <name>     Create a new migration file
  validate          Validate all migrations
  reset             Rollback all migrations (dangerous!)

Examples:
  ts-node scripts/migrate.ts up              # Run all pending migrations
  ts-node scripts/migrate.ts up 2            # Run next 2 migrations
  ts-node scripts/migrate.ts down            # Rollback last migration
  ts-node scripts/migrate.ts down 3          # Rollback last 3 migrations
  ts-node scripts/migrate.ts status          # Show current status
  ts-node scripts/migrate.ts create "add user table"  # Create new migration
  ts-node scripts/migrate.ts validate        # Validate migrations

Environment Variables:
  DATABASE_URL      Full database connection string
  DB_HOST           Database host (default: localhost)
  DB_PORT           Database port (default: 5432)
  DB_NAME           Database name (default: seraphc2)
  DB_USER           Database user (default: postgres)
  DB_PASSWORD       Database password
  DB_SSL            Use SSL connection (default: false, true in production)
`);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { MigrationManager };
