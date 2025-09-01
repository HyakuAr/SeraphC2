/**
 * Operator repository implementation
 */

import { DatabaseConnection } from '../database/connection';
import { OperatorRepository } from './interfaces';
import {
  Operator,
  CreateOperatorData,
  UpdateOperatorData,
  OperatorRole,
} from '../../types/entities';

export class PostgresOperatorRepository implements OperatorRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToOperator(row: any): Operator {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role as OperatorRole,
      permissions: row.permissions || [],
      lastLogin: row.last_login ? new Date(row.last_login) : undefined,
      isActive: row.is_active,
      sessionToken: row.session_token || undefined,
      totpSecret: row.totp_secret || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async create(data: CreateOperatorData): Promise<Operator> {
    const query = `
      INSERT INTO operators (
        username, email, password_hash, role, permissions
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;

    const values = [
      data.username,
      data.email,
      data.passwordHash,
      data.role,
      JSON.stringify(data.permissions || []),
    ];

    const result = await this.db.query(query, values);
    return this.mapRowToOperator(result.rows[0]);
  }

  async findById(id: string): Promise<Operator | null> {
    const query = 'SELECT * FROM operators WHERE id = $1;';
    const result = await this.db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOperator(result.rows[0]);
  }

  async findAll(): Promise<Operator[]> {
    const query = 'SELECT * FROM operators ORDER BY created_at DESC;';
    const result = await this.db.query(query);

    return result.rows.map((row: any) => this.mapRowToOperator(row));
  }

  async update(id: string, data: UpdateOperatorData): Promise<Operator | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }

    if (data.passwordHash !== undefined) {
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(data.passwordHash);
    }

    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }

    if (data.permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(data.permissions));
    }

    if (data.lastLogin !== undefined) {
      updates.push(`last_login = $${paramIndex++}`);
      values.push(data.lastLogin);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (data.sessionToken !== undefined) {
      updates.push(`session_token = $${paramIndex++}`);
      values.push(data.sessionToken);
    }

    if (data.totpSecret !== undefined) {
      updates.push(`totp_secret = $${paramIndex++}`);
      values.push(data.totpSecret);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE operators 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    const result = await this.db.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOperator(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM operators WHERE id = $1;';
    const result = await this.db.query(query, [id]);

    return result.rowCount > 0;
  }

  async findByUsername(username: string): Promise<Operator | null> {
    const query = 'SELECT * FROM operators WHERE username = $1;';
    const result = await this.db.query(query, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOperator(result.rows[0]);
  }

  async findByEmail(email: string): Promise<Operator | null> {
    const query = 'SELECT * FROM operators WHERE email = $1;';
    const result = await this.db.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOperator(result.rows[0]);
  }

  async findBySessionToken(token: string): Promise<Operator | null> {
    const query = 'SELECT * FROM operators WHERE session_token = $1 AND is_active = true;';
    const result = await this.db.query(query, [token]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToOperator(result.rows[0]);
  }

  async findActiveOperators(): Promise<Operator[]> {
    const query = 'SELECT * FROM operators WHERE is_active = true ORDER BY last_login DESC;';
    const result = await this.db.query(query);

    return result.rows.map((row: any) => this.mapRowToOperator(row));
  }

  async updateLastLogin(id: string): Promise<void> {
    const query = 'UPDATE operators SET last_login = NOW() WHERE id = $1;';
    await this.db.query(query, [id]);
  }

  async updateSessionToken(id: string, token: string | null): Promise<void> {
    const query = 'UPDATE operators SET session_token = $1 WHERE id = $2;';
    await this.db.query(query, [token, id]);
  }

  async deactivateOperator(id: string): Promise<void> {
    const query = 'UPDATE operators SET is_active = false, session_token = NULL WHERE id = $1;';
    await this.db.query(query, [id]);
  }

  async activateOperator(id: string): Promise<void> {
    const query = 'UPDATE operators SET is_active = true WHERE id = $1;';
    await this.db.query(query, [id]);
  }
}
