/**
 * RBAC Enhancements Migration
 * Adds tables and enhancements for Role-Based Access Control
 */

import { Migration } from '../migrations';
import { readFileSync } from 'fs';
import { join } from 'path';

export const rbacEnhancementsMigration: Migration = {
  id: '014',
  name: 'RBAC Enhancements - Audit Logs and Permissions',

  async up(client) {
    // Read and execute the SQL migration file
    const sqlPath = join(__dirname, '../migrations/014_rbac_enhancements.sql');
    const sql = readFileSync(sqlPath, 'utf8');

    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      await client.query(statement);
    }
  },

  async down(client) {
    // Drop tables in reverse order
    await client.query('DROP TABLE IF EXISTS operator_permissions;');
    await client.query('DROP TABLE IF EXISTS role_permissions;');
    await client.query('DROP TABLE IF EXISTS operator_sessions;');
    await client.query('DROP TABLE IF EXISTS audit_logs;');

    // Drop functions
    await client.query('DROP FUNCTION IF EXISTS update_session_last_activity();');
  },
};
