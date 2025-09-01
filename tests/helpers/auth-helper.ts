/**
 * Auth Helper for Tests
 * Provides authentication utilities for testing
 */

import { DatabaseConnection } from '../../src/core/database/connection';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export interface TestOperator {
  id: string;
  username: string;
  email: string;
  role: string;
}

export async function createTestOperator(
  username: string,
  role: 'read_only' | 'operator' | 'administrator' = 'operator'
): Promise<TestOperator> {
  const db = DatabaseConnection.getInstance();

  const hashedPassword = await bcrypt.hash('password123', 10);
  const email = `${username}@test.com`;

  const result = await db.query(
    `INSERT INTO operators (username, email, password_hash, role, is_active, mfa_enabled)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, email, role`,
    [username, email, hashedPassword, role, true, false]
  );

  return result.rows[0];
}

export async function getAuthToken(username: string, password: string): Promise<string> {
  const db = DatabaseConnection.getInstance();

  const result = await db.query(
    'SELECT id, username, password_hash, role FROM operators WHERE username = $1',
    [username]
  );

  if (result.rows.length === 0) {
    throw new Error('Operator not found');
  }

  const operator = result.rows[0];
  const isValidPassword = await bcrypt.compare(password, operator.password_hash);

  if (!isValidPassword) {
    throw new Error('Invalid password');
  }

  // Generate JWT token
  const token = jwt.sign(
    {
      operatorId: operator.id,
      username: operator.username,
      role: operator.role,
    },
    process.env['JWT_SECRET'] || 'test-secret',
    { expiresIn: '1h' }
  );

  return token;
}

export async function deleteTestOperator(operatorId: string): Promise<void> {
  const db = DatabaseConnection.getInstance();
  await db.query('DELETE FROM operators WHERE id = $1', [operatorId]);
}
