/**
 * Command repository implementation
 */

import { DatabaseConnection } from '../database/connection';
import { CommandRepository } from './interfaces';
import {
  Command,
  CreateCommandData,
  UpdateCommandData,
  CommandStatus,
  CommandType,
} from '../../types/entities';

export class PostgresCommandRepository implements CommandRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToCommand(row: any): Command {
    return {
      id: row.id,
      implantId: row.implant_id,
      operatorId: row.operator_id,
      type: row.type as CommandType,
      payload: row.payload,
      timestamp: new Date(row.timestamp),
      status: row.status as CommandStatus,
      result: row.result,
      executionTime: row.execution_time,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async create(data: CreateCommandData): Promise<Command> {
    const query = `
      INSERT INTO commands (
        implant_id, operator_id, type, payload
      ) VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [data.implantId, data.operatorId, data.type, data.payload];

    const result = await this.db.query(query, values);
    return this.mapRowToCommand(result.rows[0]);
  }

  async findById(id: string): Promise<Command | null> {
    const query = 'SELECT * FROM commands WHERE id = $1;';
    const result = await this.db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToCommand(result.rows[0]);
  }

  async findAll(): Promise<Command[]> {
    const query = 'SELECT * FROM commands ORDER BY timestamp DESC;';
    const result = await this.db.query(query);

    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }

  async update(id: string, data: UpdateCommandData): Promise<Command | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.result !== undefined) {
      updates.push(`result = $${paramIndex++}`);
      values.push(JSON.stringify(data.result));
    }

    if (data.executionTime !== undefined) {
      updates.push(`execution_time = $${paramIndex++}`);
      values.push(data.executionTime);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE commands 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    const result = await this.db.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToCommand(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM commands WHERE id = $1;';
    const result = await this.db.query(query, [id]);

    return result.rowCount > 0;
  }

  async findByImplantId(implantId: string, limit: number = 100): Promise<Command[]> {
    const query = `
      SELECT * FROM commands 
      WHERE implant_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2;
    `;
    const result = await this.db.query(query, [implantId, limit]);

    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }

  async findByOperatorId(operatorId: string, limit: number = 100): Promise<Command[]> {
    const query = `
      SELECT * FROM commands 
      WHERE operator_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2;
    `;
    const result = await this.db.query(query, [operatorId, limit]);

    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }

  async findByStatus(status: CommandStatus): Promise<Command[]> {
    const query = 'SELECT * FROM commands WHERE status = $1 ORDER BY timestamp ASC;';
    const result = await this.db.query(query, [status]);

    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }

  async findPendingCommands(implantId?: string): Promise<Command[]> {
    let query = 'SELECT * FROM commands WHERE status = $1';
    const values: any[] = [CommandStatus.PENDING];

    if (implantId) {
      query += ' AND implant_id = $2';
      values.push(implantId);
    }

    query += ' ORDER BY timestamp ASC;';

    const result = await this.db.query(query, values);
    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }

  async updateCommandStatus(id: string, status: CommandStatus): Promise<void> {
    const query = 'UPDATE commands SET status = $1 WHERE id = $2;';
    await this.db.query(query, [status, id]);
  }

  async getCommandHistory(implantId: string, limit: number, offset: number): Promise<Command[]> {
    const query = `
      SELECT * FROM commands 
      WHERE implant_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2 OFFSET $3;
    `;
    const result = await this.db.query(query, [implantId, limit, offset]);

    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }

  async getCommandCount(): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM commands;';
    const result = await this.db.query(query);

    return parseInt(result.rows[0].count, 10);
  }

  async getCommandsByDateRange(startDate: Date, endDate: Date): Promise<Command[]> {
    const query = `
      SELECT * FROM commands 
      WHERE timestamp >= $1 AND timestamp <= $2 
      ORDER BY timestamp DESC;
    `;
    const result = await this.db.query(query, [startDate, endDate]);

    return result.rows.map((row: any) => this.mapRowToCommand(row));
  }
}
