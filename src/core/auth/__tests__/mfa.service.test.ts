/**
 * Tests for MFA service
 */

import { MfaService } from '../mfa.service';
import { OperatorRepository } from '../../repositories/interfaces';
import { BackupCodesRepository } from '../../repositories/backup-codes.repository';
import { Operator, OperatorRole } from '../../../types/entities';
import * as speakeasy from 'speakeasy';

// Mock dependencies
const mockOperatorRepository: jest.Mocked<OperatorRepository> = {
  findById: jest.fn(),
  findByUsername: jest.fn(),
  findByEmail: jest.fn(),
  findBySessionToken: jest.fn(),
  findActiveOperators: jest.fn(),
  updateLastLogin: jest.fn(),
  updateSessionToken: jest.fn(),
  deactivateOperator: jest.fn(),
  activateOperator: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findAll: jest.fn(),
};

const mockBackupCodesRepository: jest.Mocked<BackupCodesRepository> = {
  create: jest.fn(),
  findByOperatorId: jest.fn(),
  validateAndConsume: jest.fn(),
  deleteByOperatorId: jest.fn(),
  createMultiple: jest.fn(),
};

describe('MfaService', () => {
  let mfaService: MfaService;
  let mockOperator: Operator;

  beforeEach(() => {
    jest.clearAllMocks();

    mfaService = new MfaService(mockOperatorRepository, mockBackupCodesRepository);

    mockOperator = {
      id: 'operator-1',
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      role: OperatorRole.ADMINISTRATOR,
      permissions: [],
      isActive: true,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    };
  });

  describe('setupMfa', () => {
    it('should setup MFA for operator successfully', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);
      mockOperatorRepository.update.mockResolvedValue(mockOperator);
      mockBackupCodesRepository.createMultiple.mockResolvedValue([]);

      const result = await mfaService.setupMfa('operator-1');

      expect(result.success).toBe(true);
      expect(result.secret).toBeDefined();
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.backupCodes).toBeDefined();
      expect(result.backupCodes).toHaveLength(10);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith('operator-1', {
        totpSecret: expect.any(String),
      });
      expect(mockBackupCodesRepository.createMultiple).toHaveBeenCalledWith(
        'operator-1',
        expect.any(Array)
      );
    });

    it('should fail if operator not found', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const result = await mfaService.setupMfa('operator-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operator not found');
    });

    it('should handle database errors gracefully', async () => {
      mockOperatorRepository.findById.mockRejectedValue(new Error('Database error'));

      const result = await mfaService.setupMfa('operator-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to setup MFA');
    });
  });

  describe('verifyMfaToken', () => {
    it('should verify valid TOTP token', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });
      const token = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      });

      mockOperatorRepository.findById.mockResolvedValue({
        ...mockOperator,
        totpSecret: secret.base32,
      });

      const result = await mfaService.verifyMfaToken({
        operatorId: 'operator-1',
        token,
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid TOTP token', async () => {
      const secret = speakeasy.generateSecret({ length: 32 });

      mockOperatorRepository.findById.mockResolvedValue({
        ...mockOperator,
        totpSecret: secret.base32,
      });

      const result = await mfaService.verifyMfaToken({
        operatorId: 'operator-1',
        token: '000000', // Invalid token
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid MFA token');
    });

    it('should fail if MFA not configured', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const result = await mfaService.verifyMfaToken({
        operatorId: 'operator-1',
        token: '123456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('MFA not configured for this operator');
    });

    it('should fail if operator not found', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const result = await mfaService.verifyMfaToken({
        operatorId: 'operator-1',
        token: '123456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('MFA not configured for this operator');
    });
  });

  describe('verifyBackupCode', () => {
    it('should verify valid backup code', async () => {
      mockBackupCodesRepository.validateAndConsume.mockResolvedValue(true);

      const result = await mfaService.verifyBackupCode({
        operatorId: 'operator-1',
        backupCode: 'ABCD1234',
      });

      expect(result.success).toBe(true);
      expect(mockBackupCodesRepository.validateAndConsume).toHaveBeenCalledWith(
        'operator-1',
        'ABCD1234'
      );
    });

    it('should reject invalid backup code', async () => {
      mockBackupCodesRepository.validateAndConsume.mockResolvedValue(false);

      const result = await mfaService.verifyBackupCode({
        operatorId: 'operator-1',
        backupCode: 'INVALID1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or already used backup code');
    });

    it('should fail if backup codes are disabled', async () => {
      mfaService.updateEnforcementPolicy({ allowBackupCodes: false });

      const result = await mfaService.verifyBackupCode({
        operatorId: 'operator-1',
        backupCode: 'ABCD1234',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Backup codes are not allowed');
    });
  });

  describe('isMfaRequired', () => {
    it('should require MFA for administrator role', async () => {
      const adminOperator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };
      const result = await mfaService.isMfaRequired(adminOperator);
      expect(result).toBe(true);
    });

    it('should not require MFA for read-only role by default', async () => {
      const readOnlyOperator = { ...mockOperator, role: OperatorRole.READ_ONLY };
      const result = await mfaService.isMfaRequired(readOnlyOperator);
      expect(result).toBe(false);
    });

    it('should not require MFA for operator role by default', async () => {
      const operatorUser = { ...mockOperator, role: OperatorRole.OPERATOR };
      const result = await mfaService.isMfaRequired(operatorUser);
      expect(result).toBe(false);
    });

    it('should respect grace period for new operators', async () => {
      const newOperator = {
        ...mockOperator,
        role: OperatorRole.ADMINISTRATOR,
        createdAt: new Date(), // Just created
        totpSecret: undefined,
      };

      const result = await mfaService.isMfaRequired(newOperator);
      expect(result).toBe(false); // Within grace period
    });

    it('should require MFA after grace period expires', async () => {
      const oldOperator = {
        ...mockOperator,
        role: OperatorRole.ADMINISTRATOR,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        totpSecret: undefined,
      };

      const result = await mfaService.isMfaRequired(oldOperator);
      expect(result).toBe(true); // Grace period expired
    });
  });

  describe('isMfaConfigured', () => {
    it('should return true if MFA is configured', async () => {
      mockOperatorRepository.findById.mockResolvedValue({
        ...mockOperator,
        totpSecret: 'secret123',
      });

      const result = await mfaService.isMfaConfigured('operator-1');
      expect(result).toBe(true);
    });

    it('should return false if MFA is not configured', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const result = await mfaService.isMfaConfigured('operator-1');
      expect(result).toBe(false);
    });

    it('should return false if operator not found', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const result = await mfaService.isMfaConfigured('operator-1');
      expect(result).toBe(false);
    });
  });

  describe('disableMfa', () => {
    it('should disable MFA successfully', async () => {
      mockOperatorRepository.update.mockResolvedValue(mockOperator);
      mockBackupCodesRepository.deleteByOperatorId.mockResolvedValue();

      const result = await mfaService.disableMfa('operator-1');

      expect(result.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith('operator-1', {
        totpSecret: undefined,
      });
      expect(mockBackupCodesRepository.deleteByOperatorId).toHaveBeenCalledWith('operator-1');
    });

    it('should handle errors gracefully', async () => {
      mockOperatorRepository.update.mockRejectedValue(new Error('Database error'));

      const result = await mfaService.disableMfa('operator-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to disable MFA');
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should regenerate backup codes successfully', async () => {
      mockOperatorRepository.findById.mockResolvedValue({
        ...mockOperator,
        totpSecret: 'secret123',
      });
      mockBackupCodesRepository.createMultiple.mockResolvedValue([]);

      const result = await mfaService.regenerateBackupCodes('operator-1');

      expect(result.success).toBe(true);
      expect(result.backupCodes).toBeDefined();
      expect(result.backupCodes).toHaveLength(10);
      expect(mockBackupCodesRepository.createMultiple).toHaveBeenCalledWith(
        'operator-1',
        expect.any(Array)
      );
    });

    it('should fail if MFA not configured', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const result = await mfaService.regenerateBackupCodes('operator-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('MFA not configured for this operator');
    });
  });

  describe('enforcement policy', () => {
    it('should update enforcement policy', () => {
      const newPolicy = {
        enforceForRole: [OperatorRole.ADMINISTRATOR, OperatorRole.OPERATOR],
        gracePeriodDays: 14,
        allowBackupCodes: false,
      };

      mfaService.updateEnforcementPolicy(newPolicy);
      const currentPolicy = mfaService.getEnforcementPolicy();

      expect(currentPolicy.enforceForRole).toEqual(newPolicy.enforceForRole);
      expect(currentPolicy.gracePeriodDays).toBe(newPolicy.gracePeriodDays);
      expect(currentPolicy.allowBackupCodes).toBe(newPolicy.allowBackupCodes);
    });

    it('should partially update enforcement policy', () => {
      mfaService.updateEnforcementPolicy({ gracePeriodDays: 14 });
      const currentPolicy = mfaService.getEnforcementPolicy();

      expect(currentPolicy.gracePeriodDays).toBe(14);
      expect(currentPolicy.enforceForRole).toEqual([OperatorRole.ADMINISTRATOR]); // Default
      expect(currentPolicy.allowBackupCodes).toBe(true); // Default
    });
  });
});
