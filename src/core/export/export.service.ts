/**
 * Data export service for multiple formats (JSON, XML, CSV)
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { Parser } from 'json2csv';
import { create } from 'xmlbuilder2';

export interface ExportRequest {
  type: 'implants' | 'commands' | 'operators' | 'audit_logs' | 'tasks' | 'modules';
  format: 'json' | 'xml' | 'csv';
  filters?: ExportFilters;
  fields?: string[];
  operatorId: string;
}

export interface ExportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  implantIds?: string[];
  operatorIds?: string[];
  status?: string[];
  limit?: number;
  offset?: number;
}

export interface ExportJob {
  id: string;
  type: string;
  format: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalRecords?: number;
  processedRecords?: number;
  filePath?: string;
  fileSize?: number;
  errorMessage?: string;
  operatorId: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface ExportResult {
  jobId: string;
  data?: any;
  filePath?: string;
  downloadUrl?: string;
  recordCount: number;
  format: string;
}

export class ExportService {
  constructor(private pool: Pool) {}

  /**
   * Start an export job
   */
  async startExport(request: ExportRequest): Promise<string> {
    const jobId = randomUUID();

    // Create export job record
    const query = `
      INSERT INTO export_jobs (id, type, format, status, progress, operator_id, created_at, filters, fields)
      VALUES ($1, $2, $3, 'pending', 0, $4, NOW(), $5, $6)
    `;

    await this.pool.query(query, [
      jobId,
      request.type,
      request.format,
      request.operatorId,
      JSON.stringify(request.filters || {}),
      JSON.stringify(request.fields || []),
    ]);

    // Process export asynchronously
    setImmediate(() => {
      this.processExport(jobId, request);
    });

    return jobId;
  }

  /**
   * Get export job status
   */
  async getExportJob(jobId: string): Promise<ExportJob | null> {
    const query = 'SELECT * FROM export_jobs WHERE id = $1';
    const result = await this.pool.query(query, [jobId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapExportJobRow(result.rows[0]);
  }

  /**
   * List export jobs for an operator
   */
  async listExportJobs(operatorId: string, limit: number = 50): Promise<ExportJob[]> {
    const query = `
      SELECT * FROM export_jobs 
      WHERE operator_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;

    const result = await this.pool.query(query, [operatorId, limit]);
    return result.rows.map(row => this.mapExportJobRow(row));
  }

  /**
   * Delete export job and associated files
   */
  async deleteExportJob(jobId: string, operatorId: string): Promise<boolean> {
    const query = 'DELETE FROM export_jobs WHERE id = $1 AND operator_id = $2';
    const result = await this.pool.query(query, [jobId, operatorId]);

    // TODO: Delete associated files from filesystem

    return (result.rowCount || 0) > 0;
  }

  /**
   * Export data synchronously (for small datasets)
   */
  async exportData(request: ExportRequest): Promise<ExportResult> {
    const data = await this.fetchData(request);
    const formattedData = await this.formatData(data, request.format, request.fields);

    return {
      jobId: 'sync',
      data: formattedData,
      recordCount: Array.isArray(data) ? data.length : 1,
      format: request.format,
    };
  }

  /**
   * Process export job asynchronously
   */
  private async processExport(jobId: string, request: ExportRequest): Promise<void> {
    try {
      // Update status to processing
      await this.updateJobStatus(jobId, 'processing', 10);

      // Fetch data
      const data = await this.fetchData(request);
      await this.updateJobStatus(jobId, 'processing', 50);

      // Format data
      const formattedData = await this.formatData(data, request.format, request.fields);
      await this.updateJobStatus(jobId, 'processing', 80);

      // Save to file (for large exports)
      const filePath = await this.saveToFile(jobId, formattedData, request.format);
      await this.updateJobStatus(jobId, 'processing', 90);

      // Update job with completion
      const updateQuery = `
        UPDATE export_jobs 
        SET status = 'completed', progress = 100, total_records = $1, processed_records = $1, 
            file_path = $2, file_size = $3, completed_at = NOW()
        WHERE id = $4
      `;

      const fileSize = Buffer.byteLength(formattedData, 'utf8');
      const recordCount = Array.isArray(data) ? data.length : 1;

      await this.pool.query(updateQuery, [recordCount, filePath, fileSize, jobId]);
    } catch (error: any) {
      console.error('Export job failed:', error);

      const updateQuery = `
        UPDATE export_jobs 
        SET status = 'failed', error_message = $1, completed_at = NOW()
        WHERE id = $2
      `;

      await this.pool.query(updateQuery, [error.message, jobId]);
    }
  }

  /**
   * Fetch data based on export request
   */
  private async fetchData(request: ExportRequest): Promise<any[]> {
    const { type, filters = {} } = request;

    let query = '';
    let values: any[] = [];
    let paramIndex = 1;

    switch (type) {
      case 'implants':
        query = 'SELECT * FROM implants WHERE 1=1';

        if (filters.dateFrom) {
          query += ` AND created_at >= $${paramIndex++}`;
          values.push(filters.dateFrom);
        }

        if (filters.dateTo) {
          query += ` AND created_at <= $${paramIndex++}`;
          values.push(filters.dateTo);
        }

        if (filters.status && filters.status.length > 0) {
          query += ` AND status = ANY($${paramIndex++})`;
          values.push(filters.status);
        }

        break;

      case 'commands':
        query = 'SELECT * FROM commands WHERE 1=1';

        if (filters.dateFrom) {
          query += ` AND timestamp >= $${paramIndex++}`;
          values.push(filters.dateFrom);
        }

        if (filters.dateTo) {
          query += ` AND timestamp <= $${paramIndex++}`;
          values.push(filters.dateTo);
        }

        if (filters.implantIds && filters.implantIds.length > 0) {
          query += ` AND implant_id = ANY($${paramIndex++})`;
          values.push(filters.implantIds);
        }

        if (filters.operatorIds && filters.operatorIds.length > 0) {
          query += ` AND operator_id = ANY($${paramIndex++})`;
          values.push(filters.operatorIds);
        }

        break;

      case 'operators':
        query =
          'SELECT id, username, email, role, last_login, is_active, created_at FROM operators WHERE 1=1';
        break;

      case 'audit_logs':
        query = 'SELECT * FROM audit_logs WHERE 1=1';

        if (filters.dateFrom) {
          query += ` AND timestamp >= $${paramIndex++}`;
          values.push(filters.dateFrom);
        }

        if (filters.dateTo) {
          query += ` AND timestamp <= $${paramIndex++}`;
          values.push(filters.dateTo);
        }

        if (filters.operatorIds && filters.operatorIds.length > 0) {
          query += ` AND operator_id = ANY($${paramIndex++})`;
          values.push(filters.operatorIds);
        }

        break;

      case 'tasks':
        query = 'SELECT * FROM tasks WHERE 1=1';

        if (filters.dateFrom) {
          query += ` AND created_at >= $${paramIndex++}`;
          values.push(filters.dateFrom);
        }

        if (filters.dateTo) {
          query += ` AND created_at <= $${paramIndex++}`;
          values.push(filters.dateTo);
        }

        break;

      case 'modules':
        query = 'SELECT * FROM modules WHERE 1=1';
        break;

      default:
        throw new Error(`Unsupported export type: ${type}`);
    }

    // Add ordering and limits
    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filters.offset);
    }

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Format data according to requested format
   */
  private async formatData(data: any[], format: string, fields?: string[]): Promise<string> {
    // Filter fields if specified
    let processedData = data;
    if (fields && fields.length > 0) {
      processedData = data.map(item => {
        const filtered: any = {};
        fields.forEach(field => {
          if (item.hasOwnProperty(field)) {
            filtered[field] = item[field];
          }
        });
        return filtered;
      });
    }

    switch (format) {
      case 'json':
        return JSON.stringify(processedData, null, 2);

      case 'csv':
        if (processedData.length === 0) {
          return '';
        }

        const parser = new Parser({
          fields: fields || Object.keys(processedData[0]),
        });

        return parser.parse(processedData);

      case 'xml':
        const xmlBuilder = create({ version: '1.0', encoding: 'UTF-8' });
        const root = xmlBuilder.ele('export');

        processedData.forEach((item, index) => {
          const itemElement = root.ele('item', { id: index + 1 });
          this.addObjectToXml(itemElement, item);
        });

        return root.end({ prettyPrint: true });

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Add object properties to XML element recursively
   */
  private addObjectToXml(element: any, obj: any): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        element.ele(key).txt('');
      } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        const childElement = element.ele(key);
        this.addObjectToXml(childElement, value);
      } else if (Array.isArray(value)) {
        const arrayElement = element.ele(key);
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            const itemElement = arrayElement.ele('item', { index });
            this.addObjectToXml(itemElement, item);
          } else {
            arrayElement.ele('item', { index }).txt(String(item));
          }
        });
      } else {
        element.ele(key).txt(String(value));
      }
    }
  }

  /**
   * Save formatted data to file
   */
  private async saveToFile(jobId: string, data: string, format: string): Promise<string> {
    const fs = require('fs').promises;
    const path = require('path');

    // Create exports directory if it doesn't exist
    const exportsDir = path.join(process.cwd(), 'exports');
    try {
      await fs.mkdir(exportsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const fileName = `export_${jobId}.${format}`;
    const filePath = path.join(exportsDir, fileName);

    await fs.writeFile(filePath, data, 'utf8');

    return filePath;
  }

  /**
   * Update export job status
   */
  private async updateJobStatus(jobId: string, status: string, progress: number): Promise<void> {
    const query = `
      UPDATE export_jobs 
      SET status = $1, progress = $2 
      WHERE id = $3
    `;

    await this.pool.query(query, [status, progress, jobId]);
  }

  /**
   * Map database row to ExportJob
   */
  private mapExportJobRow(row: any): ExportJob {
    return {
      id: row.id,
      type: row.type,
      format: row.format,
      status: row.status,
      progress: row.progress,
      totalRecords: row.total_records,
      processedRecords: row.processed_records,
      filePath: row.file_path,
      fileSize: row.file_size,
      errorMessage: row.error_message,
      operatorId: row.operator_id,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}
