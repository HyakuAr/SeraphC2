/**
 * Backup codes repository for MFA
 * Handles storage and validation of backup codes
 */

import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

export interface BackupCode {
  id: string;
  operatorId: string;
  codeHash: string;
  isUsed: boolean;
  usedAt?: Date;
  createdAt: Date;
}

export interface CreateBackupCodeData {
  operatorId: string;
  code: string;
}

export interface BackupCodesRepository {
  create(data: CreateBackupCodeData): Promise<BackupCode>;
  findByOperatorId(operatorId: string): Promise<BackupCode[]>;
  validateAndConsume(operatorId: string, code: string): Promise<boolean>;
  deleteByOperatorId(operatorId: string): Promise<void>;
  createMultiple(operatorId: string, codes: string[]): Promise<BackupCode[]>;
}

export class PostgresBackupCodesRepository implements BackupCodesRepository {
  constructor(private pool: Pool) {}

  async create(data: CreateBackupCodeData): Promise<BackupCode> {
    const codeHash = await bcrypt.hash(data.code, 12);
    const id = this.generateId();

    const query = `
      INSERT INTO backup_codes (id, operator_id, code_hash, is_used, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [id, data.operatorId, codeHash, false, new Date()];
    const result = await this.pool.query(query, values);

    return this.mapRowToBackupCode(result.rows[0]);
  }

  async findByOperatorId(operatorId: string): Promise<BackupCode[]> {
    const query = `
      SELECT * FROM backup_codes
      WHERE operator_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [operatorId]);
    return result.rows.map(row => this.mapRowToBackupCode(row));
  }

  async validateAndConsume(operatorId: string, code: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Find unused backup codes for the operator
      const findQuery = `
        SELECT * FROM backup_codes
        WHERE operator_id = $1 AND is_used = false
        FOR UPDATE
      `;

      const findResult = await client.query(findQuery, [operatorId]);

      // Check each code hash
      for (const row of findResult.rows) {
        const isMatch = await bcrypt.compare(code, row.code_hash);
        if (isMatch) {
          // Mark as used
          const updateQuery = `
            UPDATE backup_codes
            SET is_used = true, used_at = $1
            WHERE id = $2
          `;

          await client.query(updateQuery, [new Date(), row.id]);
          await client.query('COMMIT');
          return true;
        }
      }

      await client.query('COMMIT');
      return false;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteByOperatorId(operatorId: string): Promise<void> {
    const query = `DELETE FROM backup_codes WHERE operator_id = $1`;
    await this.pool.query(query, [operatorId]);
  }

  async createMultiple(operatorId: string, codes: string[]): Promise<BackupCode[]> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // First, delete existing backup codes
      await client.query('DELETE FROM backup_codes WHERE operator_id = $1', [operatorId]);

      const backupCodes: BackupCode[] = [];

      // Create new backup codes
      for (const code of codes) {
        const codeHash = await bcrypt.hash(code, 12);
        const id = this.generateId();

        const query = `
          INSERT INTO backup_codes (id, operator_id, code_hash, is_used, created_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;

        const values = [id, operatorId, codeHash, false, new Date()];
        const result = await client.query(query, values);
        backupCodes.push(this.mapRowToBackupCode(result.rows[0]));
      }

      await client.query('COMMIT');
      return backupCodes;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapRowToBackupCode(row: any): BackupCode {
    return {
      id: row.id,
      operatorId: row.operator_id,
      codeHash: row.code_hash,
      isUsed: row.is_used,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
