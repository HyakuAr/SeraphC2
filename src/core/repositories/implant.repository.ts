/**
 * Implant repository implementation
 */

import { DatabaseConnection } from '../database/connection';
import { ImplantRepository } from './interfaces';
import {
  Implant,
  CreateImplantData,
  UpdateImplantData,
  ImplantStatus,
  PrivilegeLevel,
  Protocol,
} from '../../types/entities';

export class PostgresImplantRepository implements ImplantRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  private mapRowToImplant(row: any): Implant {
    return {
      id: row.id,
      hostname: row.hostname,
      username: row.username,
      operatingSystem: row.operating_system,
      architecture: row.architecture,
      privileges: row.privileges as PrivilegeLevel,
      lastSeen: new Date(row.last_seen),
      status: row.status as ImplantStatus,
      communicationProtocol: row.communication_protocol as Protocol,
      encryptionKey: row.encryption_key,
      configuration: row.configuration,
      systemInfo: row.system_info,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async create(data: CreateImplantData): Promise<Implant> {
    const query = `
      INSERT INTO implants (
        hostname, username, operating_system, architecture, privileges,
        communication_protocol, encryption_key, configuration, system_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const values = [
      data.hostname,
      data.username,
      data.operatingSystem,
      data.architecture,
      data.privileges,
      data.communicationProtocol,
      data.encryptionKey,
      JSON.stringify(data.configuration),
      JSON.stringify(data.systemInfo),
    ];

    const result = await this.db.query(query, values);
    return this.mapRowToImplant(result.rows[0]);
  }

  async findById(id: string): Promise<Implant | null> {
    const query = 'SELECT * FROM implants WHERE id = $1;';
    const result = await this.db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToImplant(result.rows[0]);
  }

  async findAll(): Promise<Implant[]> {
    const query = 'SELECT * FROM implants ORDER BY created_at DESC;';
    const result = await this.db.query(query);

    return result.rows.map((row: any) => this.mapRowToImplant(row));
  }

  async update(id: string, data: UpdateImplantData): Promise<Implant | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.lastSeen !== undefined) {
      updates.push(`last_seen = $${paramIndex++}`);
      values.push(data.lastSeen);
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.communicationProtocol !== undefined) {
      updates.push(`communication_protocol = $${paramIndex++}`);
      values.push(data.communicationProtocol);
    }

    if (data.configuration !== undefined) {
      updates.push(`configuration = $${paramIndex++}`);
      values.push(JSON.stringify(data.configuration));
    }

    if (data.systemInfo !== undefined) {
      updates.push(`system_info = $${paramIndex++}`);
      values.push(JSON.stringify(data.systemInfo));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE implants 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *;
    `;

    const result = await this.db.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToImplant(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM implants WHERE id = $1;';
    const result = await this.db.query(query, [id]);

    return result.rowCount > 0;
  }

  async findByHostname(hostname: string): Promise<Implant[]> {
    const query = 'SELECT * FROM implants WHERE hostname = $1 ORDER BY created_at DESC;';
    const result = await this.db.query(query, [hostname]);

    return result.rows.map((row: any) => this.mapRowToImplant(row));
  }

  async findByStatus(status: ImplantStatus): Promise<Implant[]> {
    const query = 'SELECT * FROM implants WHERE status = $1 ORDER BY last_seen DESC;';
    const result = await this.db.query(query, [status]);

    return result.rows.map((row: any) => this.mapRowToImplant(row));
  }

  async findActiveImplants(): Promise<Implant[]> {
    return this.findByStatus(ImplantStatus.ACTIVE);
  }

  async findInactiveImplants(thresholdMinutes: number): Promise<Implant[]> {
    const query = `
      SELECT * FROM implants 
      WHERE last_seen < NOW() - INTERVAL '${thresholdMinutes} minutes'
      ORDER BY last_seen DESC;
    `;
    const result = await this.db.query(query);

    return result.rows.map((row: any) => this.mapRowToImplant(row));
  }

  async updateLastSeen(id: string): Promise<void> {
    const query = 'UPDATE implants SET last_seen = NOW() WHERE id = $1;';
    await this.db.query(query, [id]);
  }

  async updateStatus(id: string, status: ImplantStatus): Promise<void> {
    const query = 'UPDATE implants SET status = $1 WHERE id = $2;';
    await this.db.query(query, [status, id]);
  }

  async getImplantCount(): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM implants;';
    const result = await this.db.query(query);

    return parseInt(result.rows[0].count, 10);
  }

  async getImplantsByProtocol(protocol: string): Promise<Implant[]> {
    const query =
      'SELECT * FROM implants WHERE communication_protocol = $1 ORDER BY last_seen DESC;';
    const result = await this.db.query(query, [protocol]);

    return result.rows.map((row: any) => this.mapRowToImplant(row));
  }
}
