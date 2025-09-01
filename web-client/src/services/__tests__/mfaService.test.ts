import { mfaService } from '../mfaService';
import api from '../authService';

// Mock the API
jest.mock('../authService');
const mockApi = api as jest.Mocked<typeof api>;

describe('mfaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setupMfa', () => {
    it('should setup MFA successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            secret: 'JBSWY3DPEHPK3PXP',
            qrCodeUrl: 'data:image/png;base64,test',
            backupCodes: ['ABCD1234', 'EFGH5678'],
          },
        },
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await mfaService.setupMfa();

      expect(mockApi.post).toHaveBeenCalledWith('/mfa/setup');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle setup errors', async () => {
      const mockError = new Error('Network error');
      mockApi.post.mockRejectedValue(mockError);

      await expect(mfaService.setupMfa()).rejects.toThrow('Network error');
    });
  });

  describe('verifyMfaToken', () => {
    it('should verify MFA token successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
        },
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await mfaService.verifyMfaToken('123456');

      expect(mockApi.post).toHaveBeenCalledWith('/mfa/verify', { token: '123456' });
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle verification errors', async () => {
      const mockResponse = {
        data: {
          success: false,
          error: 'Invalid token',
        },
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await mfaService.verifyMfaToken('000000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify backup code successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
        },
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await mfaService.verifyBackupCode('ABCD1234');

      expect(mockApi.post).toHaveBeenCalledWith('/mfa/verify-backup-code', {
        backupCode: 'ABCD1234',
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getMfaStatus', () => {
    it('should get MFA status successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            configured: true,
            required: true,
            enforcementPolicy: {
              enforceForRole: ['administrator'],
              gracePeriodDays: 7,
              allowBackupCodes: true,
            },
          },
        },
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await mfaService.getMfaStatus();

      expect(mockApi.get).toHaveBeenCalledWith('/mfa/status');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should regenerate backup codes successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            backupCodes: ['NEW11111', 'NEW22222'],
          },
        },
      };

      mockApi.post.mockResolvedValue(mockResponse);

      const result = await mfaService.regenerateBackupCodes();

      expect(mockApi.post).toHaveBeenCalledWith('/mfa/regenerate-backup-codes');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('disableMfa', () => {
    it('should disable MFA for current user', async () => {
      const mockResponse = {
        data: {
          success: true,
        },
      };

      mockApi.delete.mockResolvedValue(mockResponse);

      const result = await mfaService.disableMfa();

      expect(mockApi.delete).toHaveBeenCalledWith('/mfa/disable');
      expect(result).toEqual(mockResponse.data);
    });

    it('should disable MFA for specific operator', async () => {
      const mockResponse = {
        data: {
          success: true,
        },
      };

      mockApi.delete.mockResolvedValue(mockResponse);

      const result = await mfaService.disableMfa('operator-123');

      expect(mockApi.delete).toHaveBeenCalledWith('/mfa/disable/operator-123');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('updateEnforcementPolicy', () => {
    it('should update enforcement policy successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            enforcementPolicy: {
              enforceForRole: ['administrator', 'operator'],
              gracePeriodDays: 14,
              allowBackupCodes: false,
            },
          },
        },
      };

      const policy = {
        enforceForRole: ['administrator', 'operator'],
        gracePeriodDays: 14,
        allowBackupCodes: false,
      };

      mockApi.put.mockResolvedValue(mockResponse);

      const result = await mfaService.updateEnforcementPolicy(policy);

      expect(mockApi.put).toHaveBeenCalledWith('/mfa/enforcement-policy', policy);
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getEnforcementPolicy', () => {
    it('should get enforcement policy successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            enforcementPolicy: {
              enforceForRole: ['administrator'],
              gracePeriodDays: 7,
              allowBackupCodes: true,
            },
          },
        },
      };

      mockApi.get.mockResolvedValue(mockResponse);

      const result = await mfaService.getEnforcementPolicy();

      expect(mockApi.get).toHaveBeenCalledWith('/mfa/enforcement-policy');
      expect(result).toEqual(mockResponse.data);
    });
  });
});
