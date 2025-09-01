/**
 * Implant API service
 */

import api from './authService';
import { EnhancedImplant, ImplantStats } from './websocketService';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ImplantListResponse {
  success: boolean;
  data: EnhancedImplant[];
  count: number;
}

export class ImplantService {
  /**
   * Get all implants
   */
  async getImplants(): Promise<EnhancedImplant[]> {
    const response = await api.get<ImplantListResponse>('/implants');
    return response.data.data;
  }

  /**
   * Get implant statistics
   */
  async getImplantStats(): Promise<ImplantStats> {
    const response = await api.get<ApiResponse<ImplantStats>>('/implants/stats');
    return response.data.data;
  }

  /**
   * Get specific implant details
   */
  async getImplant(id: string): Promise<EnhancedImplant> {
    const response = await api.get<ApiResponse<EnhancedImplant>>(`/implants/${id}`);
    return response.data.data;
  }

  /**
   * Disconnect an implant
   */
  async disconnectImplant(id: string, reason?: string): Promise<void> {
    await api.post(`/implants/${id}/disconnect`, { reason });
  }
}

export const implantService = new ImplantService();
