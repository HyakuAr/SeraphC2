import api from './authService';

export interface MfaSetupResponse {
  success: boolean;
  data?: {
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  };
  error?: string;
}

export interface MfaVerificationResponse {
  success: boolean;
  error?: string;
}

export interface MfaStatusResponse {
  success: boolean;
  data?: {
    configured: boolean;
    required: boolean;
    enforcementPolicy: {
      enforceForRole: string[];
      gracePeriodDays: number;
      allowBackupCodes: boolean;
    };
  };
  error?: string;
}

export interface BackupCodesResponse {
  success: boolean;
  data?: {
    backupCodes: string[];
  };
  error?: string;
}

export const mfaService = {
  async setupMfa(): Promise<MfaSetupResponse> {
    const response = await api.post('/mfa/setup');
    return response.data;
  },

  async verifyMfaToken(token: string): Promise<MfaVerificationResponse> {
    const response = await api.post('/mfa/verify', { token });
    return response.data;
  },

  async verifyBackupCode(backupCode: string): Promise<MfaVerificationResponse> {
    const response = await api.post('/mfa/verify-backup-code', { backupCode });
    return response.data;
  },

  async getMfaStatus(): Promise<MfaStatusResponse> {
    const response = await api.get('/mfa/status');
    return response.data;
  },

  async regenerateBackupCodes(): Promise<BackupCodesResponse> {
    const response = await api.post('/mfa/regenerate-backup-codes');
    return response.data;
  },

  async disableMfa(operatorId?: string): Promise<MfaVerificationResponse> {
    const url = operatorId ? `/mfa/disable/${operatorId}` : '/mfa/disable';
    const response = await api.delete(url);
    return response.data;
  },

  async updateEnforcementPolicy(policy: {
    enforceForRole?: string[];
    gracePeriodDays?: number;
    allowBackupCodes?: boolean;
  }): Promise<MfaStatusResponse> {
    const response = await api.put('/mfa/enforcement-policy', policy);
    return response.data;
  },

  async getEnforcementPolicy(): Promise<MfaStatusResponse> {
    const response = await api.get('/mfa/enforcement-policy');
    return response.data;
  },
};
