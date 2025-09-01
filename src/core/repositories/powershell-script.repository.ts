/**
 * PostgreSQL repository for PowerShell scripts
 */

import { PowerShellScript } from '../../types/entities';
import { PowerShellScriptRepository } from '../services/powershell.service';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../../utils/logger';

export class PostgresPowerShellScriptRepository implements PowerShellScriptRepository {
  private dbConnection: DatabaseConnection;
  private logger: Logger;

  constructor() {
    this.dbConnection = DatabaseConnection.getInstance();
    this.logger = Logger.getInstance();
  }

  async create(
    script: Omit<PowerShellScript, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PowerShellScript> {
    const query = `
      INSERT INTO powershell_scripts (name, description, content, parameters, tags, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      script.name,
      script.description || null,
      script.content,
      JSON.stringify(script.parameters || []),
      JSON.stringify(script.tags || []),
      script.createdBy,
    ];

    try {
      const result = await this.dbConnection.query(query, values);
      return this.mapRowToScript(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        script: script.name,
      });
      throw error;
    }
  }

  async findById(id: string): Promise<PowerShellScript | null> {
    const query = 'SELECT * FROM powershell_scripts WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      return result.rows.length > 0 ? this.mapRowToScript(result.rows[0]) : null;
    } catch (error) {
      this.logger.error('Failed to find PowerShell script by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async findByOperator(operatorId: string): Promise<PowerShellScript[]> {
    const query = 'SELECT * FROM powershell_scripts WHERE created_by = $1 ORDER BY created_at DESC';

    try {
      const result = await this.dbConnection.query(query, [operatorId]);
      return result.rows.map((row: any) => this.mapRowToScript(row));
    } catch (error) {
      this.logger.error('Failed to find PowerShell scripts by operator', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId,
      });
      throw error;
    }
  }

  async findByTags(tags: string[]): Promise<PowerShellScript[]> {
    const query = `
      SELECT * FROM powershell_scripts 
      WHERE tags::jsonb ?| $1 
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.dbConnection.query(query, [tags]);
      return result.rows.map((row: any) => this.mapRowToScript(row));
    } catch (error) {
      this.logger.error('Failed to find PowerShell scripts by tags', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tags,
      });
      throw error;
    }
  }

  async update(id: string, updates: Partial<PowerShellScript>): Promise<PowerShellScript> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClause.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.description !== undefined) {
      setClause.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.content !== undefined) {
      setClause.push(`content = $${paramIndex++}`);
      values.push(updates.content);
    }

    if (updates.parameters !== undefined) {
      setClause.push(`parameters = $${paramIndex++}`);
      values.push(JSON.stringify(updates.parameters));
    }

    if (updates.tags !== undefined) {
      setClause.push(`tags = $${paramIndex++}`);
      values.push(JSON.stringify(updates.tags));
    }

    setClause.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE powershell_scripts 
      SET ${setClause.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await this.dbConnection.query(query, values);
      if (result.rows.length === 0) {
        throw new Error(`PowerShell script with ID ${id} not found`);
      }
      return this.mapRowToScript(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM powershell_scripts WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      if (result.rowCount === 0) {
        throw new Error(`PowerShell script with ID ${id} not found`);
      }
    } catch (error) {
      this.logger.error('Failed to delete PowerShell script', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async search(query: string): Promise<PowerShellScript[]> {
    const searchQuery = `
      SELECT * FROM powershell_scripts 
      WHERE name ILIKE $1 OR description ILIKE $1 OR content ILIKE $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.dbConnection.query(searchQuery, [`%${query}%`]);
      return result.rows.map((row: any) => this.mapRowToScript(row));
    } catch (error) {
      this.logger.error('Failed to search PowerShell scripts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
      });
      throw error;
    }
  }

  private mapRowToScript(row: any): PowerShellScript {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      content: row.content,
      parameters: row.parameters ? JSON.parse(row.parameters) : [],
      tags: row.tags ? JSON.parse(row.tags) : [],
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
