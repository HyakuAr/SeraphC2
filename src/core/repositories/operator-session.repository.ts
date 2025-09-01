/**
 * Operator Session Repository
 * Handles database operations for operator sessions
 */

import { DatabaseConnection } from '../database/connection';

export interface OperatorSession {
  id: string;
  operatorId: string;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  lastActivity: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateOperatorSessionData {
  operatorId: string;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

export interface UpdateOperatorSessionData {
  isActive?: boolean;
  lastActivity?: Date;
}

export class OperatorSessionRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Create a new operator session
   */
  async create(data: CreateOperatorSessionData): Promise<OperatorSession> {
    const query = `
      INSERT INTO operator_sessions (
        operator_id, session_token, ip_address, user_agent, expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      data.operatorId,
      data.sessionToken,
      data.ipAddress || null,
      data.userAgent || null,
      data.expiresAt,
    ];

    const result = await this.db.query(query, values);
    return this.mapRowToSession(result.rows[0]);
  }

  /**
   * Find session by token
   */
  async findByToken(sessionToken: string): Promise<OperatorSession | null> {
    const query = `
      SELECT * FROM operator_sessions 
      WHERE session_token = $1 AND is_active = true AND expires_at > NOW()
    `;

    const result = await this.db.query(query, [sessionToken]);
    return result.rows.length > 0 ? this.mapRowToSession(result.rows[0]) : null;
  }

  /**
   * Find sessions by operator ID
   */
  async findByOperatorId(operatorId: string): Promise<OperatorSession[]> {
    const query = `
      SELECT * FROM operator_sessions 
      WHERE operator_id = $1 
      ORDER BY created_at DESC
    `;

    const result = await this.db.query(query, [operatorId]);
    return result.rows.map(row => this.mapRowToSession(row));
  }

  /**
   * Find active sessions by operator ID
   */
  async findActiveByOperatorId(operatorId: string): Promise<OperatorSession[]> {
    const query = `
      SELECT * FROM operator_sessions 
      WHERE operator_id = $1 AND is_active = true AND expires_at > NOW()
      ORDER BY last_activity DESC
    `;

    const result = await this.db.query(query, [operatorId]);
    return result.rows.map(row => this.mapRowToSession(row));
  }

  /**
   * Update session
   */
  async update(
    sessionToken: string,
    data: UpdateOperatorSessionData
  ): Promise<OperatorSession | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (data.isActive !== undefined) {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(data.isActive);
    }

    if (data.lastActivity !== undefined) {
      paramCount++;
      updates.push(`last_activity = $${paramCount}`);
      values.push(data.lastActivity);
    }

    if (updates.length === 0) {
      return this.findByToken(sessionToken);
    }

    paramCount++;
    const query = `
      UPDATE operator_sessions 
      SET ${updates.join(', ')}
      WHERE session_token = $${paramCount}
      RETURNING *
    `;
    values.push(sessionToken);

    const result = await this.db.query(query, values);
    return result.rows.length > 0 ? this.mapRowToSession(result.rows[0]) : null;
  }

  /**
   * Deactivate session
   */
  async deactivate(sessionToken: string): Promise<boolean> {
    const query = `
      UPDATE operator_sessions 
      SET is_active = false 
      WHERE session_token = $1
    `;

    const result = await this.db.query(query, [sessionToken]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Deactivate all sessions for an operator
   */
  async deactivateAllForOperator(operatorId: string): Promise<number> {
    const query = `
      UPDATE operator_sessions 
      SET is_active = false 
      WHERE operator_id = $1 AND is_active = true
    `;

    const result = await this.db.query(query, [operatorId]);
    return result.rowCount || 0;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const query = `
      UPDATE operator_sessions 
      SET is_active = false 
      WHERE expires_at <= NOW() AND is_active = true
    `;

    const result = await this.db.query(query);
    return result.rowCount || 0;
  }

  /**
   * Delete old sessions
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const query = 'DELETE FROM operator_sessions WHERE created_at < $1';
    const result = await this.db.query(query, [date]);
    return result.rowCount || 0;
  }

  /**
   * Get session statistics
   */
  async getStatistics(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    uniqueOperators: number;
  }> {
    const queries = [
      'SELECT COUNT(*) as total_sessions FROM operator_sessions',
      'SELECT COUNT(*) as active_sessions FROM operator_sessions WHERE is_active = true AND expires_at > NOW()',
      'SELECT COUNT(*) as expired_sessions FROM operator_sessions WHERE expires_at <= NOW()',
      'SELECT COUNT(DISTINCT operator_id) as unique_operators FROM operator_sessions WHERE is_active = true AND expires_at > NOW()',
    ];

    const results = await Promise.all(queries.map(query => this.db.query(query)));

    return {
      totalSessions: parseInt(results[0].rows[0].total_sessions),
      activeSessions: parseInt(results[1].rows[0].active_sessions),
      expiredSessions: parseInt(results[2].rows[0].expired_sessions),
      uniqueOperators: parseInt(results[3].rows[0].unique_operators),
    };
  }

  /**
   * Map database row to OperatorSession object
   */
  private mapRowToSession(row: any): OperatorSession {
    return {
      id: row.id,
      operatorId: row.operator_id,
      sessionToken: row.session_token,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      isActive: row.is_active,
      lastActivity: row.last_activity,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
