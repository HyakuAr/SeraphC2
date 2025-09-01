/**
 * PostgreSQL repository for PowerShell sessions
 */

import { PowerShellSession } from '../../types/entities';
import { PowerShellSessionRepository } from '../services/powershell.service';
import { DatabaseConnection } from '../database/connection';
import { Logger } from '../../utils/logger';

import { createErrorWithContext } from '../../types/errors';
export class PostgresPowerShellSessionRepository implements PowerShellSessionRepository {
  private dbConnection: DatabaseConnection;
  private logger: Logger;

  constructor() {
    this.dbConnection = DatabaseConnection.getInstance();
    this.logger = Logger.getInstance();
  }

  async create(
    session: Omit<PowerShellSession, 'id' | 'createdAt' | 'lastActivity'>
  ): Promise<PowerShellSession> {
    const query = `
      INSERT INTO powershell_sessions (implant_id, operator_id, session_state, runspace_id, modules, variables, execution_policy)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      session.implantId,
      session.operatorId,
      session.sessionState,
      session.runspaceId || null,
      JSON.stringify(session.modules || []),
      JSON.stringify(session.variables || {}),
      JSON.stringify(session.executionPolicy || []),
    ];

    try {
      const result = await this.dbConnection.query(query, values);
      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, {});
      this.logger.error('Failed to create PowerShell session', errorWithContext);
      throw error;
    }
  }

  async findById(id: string): Promise<PowerShellSession | null> {
    const query = 'SELECT * FROM powershell_sessions WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      return result.rows.length > 0 ? this.mapRowToSession(result.rows[0]) : null;
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { id });
      this.logger.error('Failed to find PowerShell session by ID', errorWithContext);
      throw error;
    }
  }

  async findByImplant(implantId: string): Promise<PowerShellSession[]> {
    const query =
      'SELECT * FROM powershell_sessions WHERE implant_id = $1 ORDER BY created_at DESC';

    try {
      const result = await this.dbConnection.query(query, [implantId]);
      return result.rows.map((row: any) => this.mapRowToSession(row));
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { implantId });
      this.logger.error('Failed to find PowerShell sessions by implant', errorWithContext);
      throw error;
    }
  }

  async findByOperator(operatorId: string): Promise<PowerShellSession[]> {
    const query =
      'SELECT * FROM powershell_sessions WHERE operator_id = $1 ORDER BY created_at DESC';

    try {
      const result = await this.dbConnection.query(query, [operatorId]);
      return result.rows.map((row: any) => this.mapRowToSession(row));
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { operatorId });
      this.logger.error('Failed to find PowerShell sessions by operator', errorWithContext);
      throw error;
    }
  }

  async update(id: string, updates: Partial<PowerShellSession>): Promise<PowerShellSession> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.sessionState !== undefined) {
      setClause.push(`session_state = $${paramIndex++}`);
      values.push(updates.sessionState);
    }

    if (updates.runspaceId !== undefined) {
      setClause.push(`runspace_id = $${paramIndex++}`);
      values.push(updates.runspaceId);
    }

    if (updates.modules !== undefined) {
      setClause.push(`modules = $${paramIndex++}`);
      values.push(JSON.stringify(updates.modules));
    }

    if (updates.variables !== undefined) {
      setClause.push(`variables = $${paramIndex++}`);
      values.push(JSON.stringify(updates.variables));
    }

    if (updates.executionPolicy !== undefined) {
      setClause.push(`execution_policy = $${paramIndex++}`);
      values.push(JSON.stringify(updates.executionPolicy));
    }

    values.push(id);

    const query = `
      UPDATE powershell_sessions 
      SET ${setClause.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await this.dbConnection.query(query, values);
      if (result.rows.length === 0) {
        throw new Error(`PowerShell session with ID ${id} not found`);
      }
      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { id });
      this.logger.error('Failed to update PowerShell session', errorWithContext);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const query = 'DELETE FROM powershell_sessions WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      if (result.rowCount === 0) {
        throw new Error(`PowerShell session with ID ${id} not found`);
      }
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { id });
      this.logger.error('Failed to delete PowerShell session', errorWithContext);
      throw error;
    }
  }

  async updateLastActivity(id: string): Promise<void> {
    const query = 'UPDATE powershell_sessions SET last_activity = NOW() WHERE id = $1';

    try {
      const result = await this.dbConnection.query(query, [id]);
      if (result.rowCount === 0) {
        throw new Error(`PowerShell session with ID ${id} not found`);
      }
    } catch (error) {
      const errorWithContext = createErrorWithContext(error, { id });
      this.logger.error('Failed to update PowerShell session activity', errorWithContext);
      throw error;
    }
  }

  private mapRowToSession(row: any): PowerShellSession {
    return {
      id: row.id,
      implantId: row.implant_id,
      operatorId: row.operator_id,
      sessionState: row.session_state,
      runspaceId: row.runspace_id,
      modules: row.modules ? JSON.parse(row.modules) : [],
      variables: row.variables ? JSON.parse(row.variables) : {},
      executionPolicy: row.execution_policy ? JSON.parse(row.execution_policy) : [],
      createdAt: new Date(row.created_at),
      lastActivity: new Date(row.last_activity),
    };
  }
}
