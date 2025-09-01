/**
 * PostgreSQL repository for PowerShell favorites
 */

import { PowerShellFavorite } from '../../types/entities';
import { PowerShellFavoriteRepository } from '../services/powershell.service';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../../utils/logger';

export class PostgresPowerShellFavoriteRepository implements PowerShellFavoriteRepository {
  private dbConnection: DatabaseConnection;
  private logger: Logger;

  constructor() {
    this.dbConnection = DatabaseConnection.getInstance();
    this.logger = Logger.getInstance();
  }

  async create(
    favorite: Omit<PowerShellFavorite, 'id' | 'createdAt' | 'usageCount'>
  ): Promise<PowerShellFavorite> {
    const query = `
      INSERT INTO powershell_favorites (name, command, description, category, operator_id, usage_count)
      VALUES ($1, $2, $3, $4, $5, 0)
      RETURNING *
    `;

    const values = [
      favorite.name,
      favorite.command,
      favorite.description || null,
      favorite.category || null,
      favorite.operatorId,
    ];

    try {
      const result = await this.dbConnection.query(query, values);
      return this.mapRowToFavorite(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        favorite: favorite.name,
      });
      throw error;
    }
  }

  async findById(id: string): Promise<PowerShellFavorite | null> {
    const query = 'SELECT * FROM powershell_favorites WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      return result.rows.length > 0 ? this.mapRowToFavorite(result.rows[0]) : null;
    } catch (error) {
      this.logger.error('Failed to find PowerShell favorite by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async findByOperator(operatorId: string): Promise<PowerShellFavorite[]> {
    const query = 'SELECT * FROM powershell_favorites WHERE operator_id = $1 ORDER BY name ASC';

    try {
      const result = await this.dbConnection.query(query, [operatorId]);
      return result.rows.map((row: any) => this.mapRowToFavorite(row));
    } catch (error) {
      this.logger.error('Failed to find PowerShell favorites by operator', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId,
      });
      throw error;
    }
  }

  async findByCategory(category: string): Promise<PowerShellFavorite[]> {
    const query = 'SELECT * FROM powershell_favorites WHERE category = $1 ORDER BY name ASC';

    try {
      const result = await this.dbConnection.query(query, [category]);
      return result.rows.map((row: any) => this.mapRowToFavorite(row));
    } catch (error) {
      this.logger.error('Failed to find PowerShell favorites by category', {
        error: error instanceof Error ? error.message : 'Unknown error',
        category,
      });
      throw error;
    }
  }

  async update(id: string, updates: Partial<PowerShellFavorite>): Promise<PowerShellFavorite> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClause.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.command !== undefined) {
      setClause.push(`command = $${paramIndex++}`);
      values.push(updates.command);
    }

    if (updates.description !== undefined) {
      setClause.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.category !== undefined) {
      setClause.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }

    if (updates.lastUsed !== undefined) {
      setClause.push(`last_used = $${paramIndex++}`);
      values.push(updates.lastUsed);
    }

    values.push(id);

    const query = `
      UPDATE powershell_favorites 
      SET ${setClause.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await this.dbConnection.query(query, values);
      if (result.rows.length === 0) {
        throw new Error(`PowerShell favorite with ID ${id} not found`);
      }
      return this.mapRowToFavorite(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM powershell_favorites WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      if (result.rowCount === 0) {
        throw new Error(`PowerShell favorite with ID ${id} not found`);
      }
    } catch (error) {
      this.logger.error('Failed to delete PowerShell favorite', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async incrementUsage(id: string): Promise<void> {
    const query = 'UPDATE powershell_favorites SET usage_count = usage_count + 1 WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      if (result.rowCount === 0) {
        throw new Error(`PowerShell favorite with ID ${id} not found`);
      }
    } catch (error) {
      this.logger.error('Failed to increment PowerShell favorite usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id,
      });
      throw error;
    }
  }

  async getMostUsed(operatorId: string, limit = 10): Promise<PowerShellFavorite[]> {
    const query = `
      SELECT * FROM powershell_favorites 
      WHERE operator_id = $1 
      ORDER BY usage_count DESC, last_used DESC NULLS LAST
      LIMIT $2
    `;

    try {
      const result = await this.dbConnection.query(query, [operatorId, limit]);
      return result.rows.map((row: any) => this.mapRowToFavorite(row));
    } catch (error) {
      this.logger.error('Failed to get most used PowerShell favorites', {
        error: error instanceof Error ? error.message : 'Unknown error',
        operatorId,
        limit,
      });
      throw error;
    }
  }

  private mapRowToFavorite(row: any): PowerShellFavorite {
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      description: row.description,
      category: row.category,
      operatorId: row.operator_id,
      createdAt: new Date(row.created_at),
      usageCount: row.usage_count,
      ...(row.last_used && { lastUsed: new Date(row.last_used) }),
    };
  }
}
