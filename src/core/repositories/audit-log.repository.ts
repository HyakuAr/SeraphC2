/**
 * Audit Log Repository
 * Handles database operations for audit logs
 */

// import { PoolClient } from 'pg';
import { DatabaseConnection } from '../database/connection';

export interface AuditLog {
  id: string;
  operatorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

export interface CreateAuditLogData {
  operatorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
}

export interface AuditLogFilter {
  operatorId?: string;
  action?: string;
  resourceType?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditLogRepository {
  private db: DatabaseConnection;

  constructor() {
    this.db = DatabaseConnection.getInstance();
  }

  /**
   * Create a new audit log entry
   */
  async create(data: CreateAuditLogData): Promise<AuditLog> {
    const query = `
      INSERT INTO audit_logs (
        operator_id, action, resource_type, resource_id, details,
        ip_address, user_agent, success, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      data.operatorId || null,
      data.action,
      data.resourceType,
      data.resourceId || null,
      JSON.stringify(data.details || {}),
      data.ipAddress || null,
      data.userAgent || null,
      data.success !== false, // Default to true
      data.errorMessage || null,
    ];

    const result = await this.db.query(query, values);
    return this.mapRowToAuditLog(result.rows[0]);
  }

  /**
   * Find audit logs with filters
   */
  async findMany(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    let query = `
      SELECT al.*, o.username as operator_username
      FROM audit_logs al
      LEFT JOIN operators o ON al.operator_id = o.id
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramCount = 0;

    if (filter.operatorId) {
      paramCount++;
      query += ` AND al.operator_id = $${paramCount}`;
      values.push(filter.operatorId);
    }

    if (filter.action) {
      paramCount++;
      query += ` AND al.action = $${paramCount}`;
      values.push(filter.action);
    }

    if (filter.resourceType) {
      paramCount++;
      query += ` AND al.resource_type = $${paramCount}`;
      values.push(filter.resourceType);
    }

    if (filter.success !== undefined) {
      paramCount++;
      query += ` AND al.success = $${paramCount}`;
      values.push(filter.success);
    }

    if (filter.startDate) {
      paramCount++;
      query += ` AND al.created_at >= $${paramCount}`;
      values.push(filter.startDate);
    }

    if (filter.endDate) {
      paramCount++;
      query += ` AND al.created_at <= $${paramCount}`;
      values.push(filter.endDate);
    }

    query += ` ORDER BY al.created_at DESC`;

    if (filter.limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(filter.offset);
    }

    const result = await this.db.query(query, values);
    return result.rows.map((row: any) => this.mapRowToAuditLog(row));
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(filter: AuditLogFilter = {}): Promise<{
    totalLogs: number;
    successfulActions: number;
    failedActions: number;
    uniqueOperators: number;
    topActions: Array<{ action: string; count: number }>;
  }> {
    let whereClause = 'WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (filter.startDate) {
      paramCount++;
      whereClause += ` AND created_at >= $${paramCount}`;
      values.push(filter.startDate);
    }

    if (filter.endDate) {
      paramCount++;
      whereClause += ` AND created_at <= $${paramCount}`;
      values.push(filter.endDate);
    }

    const queries = [
      `SELECT COUNT(*) as total_logs FROM audit_logs ${whereClause}`,
      `SELECT COUNT(*) as successful_actions FROM audit_logs ${whereClause} AND success = true`,
      `SELECT COUNT(*) as failed_actions FROM audit_logs ${whereClause} AND success = false`,
      `SELECT COUNT(DISTINCT operator_id) as unique_operators FROM audit_logs ${whereClause}`,
      `SELECT action, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY action ORDER BY count DESC LIMIT 10`,
    ];

    const results = await Promise.all(queries.map(query => this.db.query(query, values)));

    return {
      totalLogs: parseInt(results[0].rows[0].total_logs),
      successfulActions: parseInt(results[1].rows[0].successful_actions),
      failedActions: parseInt(results[2].rows[0].failed_actions),
      uniqueOperators: parseInt(results[3].rows[0].unique_operators),
      topActions: results[4].rows.map((row: any) => ({
        action: row.action,
        count: parseInt(row.count),
      })),
    };
  }

  /**
   * Delete old audit logs
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const query = 'DELETE FROM audit_logs WHERE created_at < $1';
    const result = await this.db.query(query, [date]);
    return result.rowCount || 0;
  }

  /**
   * Map database row to AuditLog object
   */
  private mapRowToAuditLog(row: any): AuditLog {
    return {
      id: row.id,
      operatorId: row.operator_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      success: row.success,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }
}
