/**
 * Database module exports
 */

export { DatabaseConnection } from './connection';
export { MigrationManager, Migration } from './migrations';
export { getDatabaseConfig, createPoolConfig } from './config';
export { initialSchemaMigration } from './schema/001_initial_schema';
export { rbacEnhancementsMigration } from './schema/014_rbac_enhancements';

import { DatabaseConnection } from './connection';
import { MigrationManager } from './migrations';
import { initialSchemaMigration } from './schema/001_initial_schema';
import { rbacEnhancementsMigration } from './schema/014_rbac_enhancements';

// Database initialization function
export async function initializeDatabase(): Promise<void> {
  const db = DatabaseConnection.getInstance();
  const migrationManager = new MigrationManager();

  // Add migrations
  migrationManager.addMigration(initialSchemaMigration);
  migrationManager.addMigration(rbacEnhancementsMigration);

  // Connect to database
  await db.connect();

  // Run migrations
  await migrationManager.runMigrations();

  console.log('✅ Database initialized successfully');
}

// Database cleanup function
export async function closeDatabaseConnection(): Promise<void> {
  const db = DatabaseConnection.getInstance();
  await db.disconnect();
}
