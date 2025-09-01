/**
 * Audit Service for web client
 * Handles audit log API calls
 */

import { apiClient } from './apiClient';

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

export interface AuditStatistics {
  totalLogs: number;
  successfulActions: number;
  failedActions: number;
  uniqueOperators: number;
  topActions: Array<{ action: string; count: number }>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class AuditService {
  /**
   * Get audit logs with optional query parameters
   */
  async getLogs(queryParams?: string): Promise<ApiResponse<AuditLog[]>> {
    try {
      const url = queryParams ? `/api/audit/logs?${queryParams}` : '/api/audit/logs';
      const response = await apiClient.get(url);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get audit logs',
      };
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(queryParams?: string): Promise<ApiResponse<AuditStatistics>> {
    try {
      const url = queryParams ? `/api/audit/statistics?${queryParams}` : '/api/audit/statistics';
      const response = await apiClient.get(url);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get audit statistics',
      };
    }
  }

  /**
   * Clean up old audit logs (admin only)
   */
  async cleanupLogs(olderThanDays: number): Promise<ApiResponse<{ deletedCount: number }>> {
    try {
      const response = await apiClient.delete('/api/audit/cleanup', {
        data: { olderThanDays },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to cleanup audit logs',
      };
    }
  }
}

export const auditService = new AuditService();
