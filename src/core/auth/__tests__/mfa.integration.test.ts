/**
 * Integration tests for MFA workflow
 */

import { MfaService } from '../mfa.service';
import { AuthService } from '../auth.service';
import { PostgresBackupCodesRepository } from '../../repositories/backup-codes.repository';
import { OperatorRepository } from '../../repositories/interfaces';
import { Operator, OperatorRole } from '../../../types/entities';
import { PasswordUtils } from '../password.utils';
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

const mockBackupCodesRepository: jest.Mocked<PostgresBackupCodesRepository> = {
  create: jest.fn(),
  findByOperatorId: jest.fn(),
  validateAndConsume: jest.fn(),
  deleteByOperatorId: jest.fn(),
  createMultiple: jest.fn(),
} as any;

describe('MFA Integration Tests', () => {
  let mfaService: MfaService;
  let authService: AuthService;
  let mockOperator: Operator;

  beforeEach(() => {
    jest.clearAllMocks();

    mfaService = new MfaService(mockOperatorRepository, mockBackupCodesRepository);
    authService = new AuthService(mockOperatorRepository, mfaService);

    // Create a properly hashed password for testing
    const hashedPassword = PasswordUtils.hashPassword('password123');
    const serializedPassword = PasswordUtils.serializeHashedPassword(hashedPassword);

    mockOperator = {
      id: 'operator-1',
      username: 'admin',
      email: 'admin@seraphc2.com',
      passwordHash: serializedPassword,
      role: OperatorRole.ADMINISTRATOR,
      permissions: [],
      isActive: true,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    };
  });

  describe('Complete MFA Setup and Login Workflow', () => {
    it('should complete full MFA setup and login workflow', async () => {
      // Step 1: Setup MFA for operator
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);
      mockOperatorRepository.update.mockResolvedValue(mockOperator);
      mockBackupCodesRepository.createMultiple.mockResolvedValue([]);

      const setupResult = await mfaService.setupMfa('operator-1');
      expect(setupResult.success).toBe(true);
      expect(setupResult.secret).toBeDefined();
      expect(setupResult.qrCodeUrl).toBeDefined();
      expect(setupResult.backupCodes).toHaveLength(10);

      // Step 2: Verify MFA is now required
      const operatorWithMfa = {
        ...mockOperator,
        totpSecret: setupResult.secret,
      };

      const isRequired = await mfaService.isMfaRequired(operatorWithMfa);
      expect(isRequired).toBe(true);

      // Mock the operator with MFA configured for subsequent calls
      mockOperatorRepository.findById.mockResolvedValue(operatorWithMfa);

      const isConfigured = await mfaService.isMfaConfigured('operator-1');
      expect(isConfigured).toBe(true);

      // Step 3: Test login without MFA token (should fail)
      mockOperatorRepository.findByUsername.mockResolvedValue(operatorWithMfa);

      const loginWithoutMfa = await authService.login({
        username: 'admin',
        password: 'password123',
      });

      expect(loginWithoutMfa.success).toBe(false);
      expect(loginWithoutMfa.requiresMfa).toBe(true);
      expect(loginWithoutMfa.operator?.mfaConfigured).toBe(true);

      // Step 4: Generate valid TOTP token
      const token = speakeasy.totp({
        secret: setupResult.secret!,
        encoding: 'base32',
      });

      // Step 5: Test login with valid MFA token (should succeed)
      const loginWithMfa = await authService.login({
        username: 'admin',
        password: 'password123',
        mfaToken: token,
      });

      expect(loginWithMfa.success).toBe(true);
      expect(loginWithMfa.tokens).toBeDefined();
      expect(loginWithMfa.operator?.mfaConfigured).toBe(true);

      // Step 6: Test backup code verification
      mockBackupCodesRepository.validateAndConsume.mockResolvedValue(true);

      const backupCodeResult = await mfaService.verifyBackupCode({
        operatorId: 'operator-1',
        backupCode: setupResult.backupCodes![0]!,
      });

      expect(backupCodeResult.success).toBe(true);

      // Step 7: Test regenerating backup codes
      mockBackupCodesRepository.createMultiple.mockResolvedValue([]);

      const regenerateResult = await mfaService.regenerateBackupCodes('operator-1');
      expect(regenerateResult.success).toBe(true);
      expect(regenerateResult.backupCodes).toHaveLength(10);

      // Step 8: Test disabling MFA
      const disableResult = await mfaService.disableMfa('operator-1');
      expect(disableResult.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith('operator-1', {
        totpSecret: undefined,
      });
      expect(mockBackupCodesRepository.deleteByOperatorId).toHaveBeenCalledWith('operator-1');
    });

    it('should enforce MFA policy correctly', async () => {
      // Test default policy (only administrators)
      const adminOperator = { ...mockOperator, role: OperatorRole.ADMINISTRATOR };
      const operatorUser = { ...mockOperator, role: OperatorRole.OPERATOR };
      const readOnlyUser = { ...mockOperator, role: OperatorRole.READ_ONLY };

      expect(await mfaService.isMfaRequired(adminOperator)).toBe(true);
      expect(await mfaService.isMfaRequired(operatorUser)).toBe(false);
      expect(await mfaService.isMfaRequired(readOnlyUser)).toBe(false);

      // Update policy to require MFA for all roles
      mfaService.updateEnforcementPolicy({
        enforceForRole: [OperatorRole.ADMINISTRATOR, OperatorRole.OPERATOR, OperatorRole.READ_ONLY],
        gracePeriodDays: 0, // No grace period
        allowBackupCodes: true,
      });

      expect(await mfaService.isMfaRequired(adminOperator)).toBe(true);
      expect(await mfaService.isMfaRequired(operatorUser)).toBe(true);
      expect(await mfaService.isMfaRequired(readOnlyUser)).toBe(true);

      // Test grace period
      mfaService.updateEnforcementPolicy({
        enforceForRole: [OperatorRole.ADMINISTRATOR],
        gracePeriodDays: 7,
        allowBackupCodes: true,
      });

      const newOperator = {
        ...adminOperator,
        createdAt: new Date(), // Just created
        totpSecret: undefined,
      };

      expect(await mfaService.isMfaRequired(newOperator)).toBe(false); // Within grace period

      const oldOperator = {
        ...adminOperator,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        totpSecret: undefined,
      };

      expect(await mfaService.isMfaRequired(oldOperator)).toBe(true); // Grace period expired
    });

    it('should handle backup codes policy correctly', async () => {
      // Test with backup codes enabled
      mfaService.updateEnforcementPolicy({ allowBackupCodes: true });

      mockBackupCodesRepository.validateAndConsume.mockResolvedValue(true);

      let result = await mfaService.verifyBackupCode({
        operatorId: 'operator-1',
        backupCode: 'ABCD1234',
      });

      expect(result.success).toBe(true);

      // Test with backup codes disabled
      mfaService.updateEnforcementPolicy({ allowBackupCodes: false });

      result = await mfaService.verifyBackupCode({
        operatorId: 'operator-1',
        backupCode: 'ABCD1234',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Backup codes are not allowed');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid TOTP tokens gracefully', async () => {
      const operatorWithMfa = {
        ...mockOperator,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      };

      mockOperatorRepository.findById.mockResolvedValue(operatorWithMfa);

      const result = await mfaService.verifyMfaToken({
        operatorId: 'operator-1',
        token: '000000', // Invalid token
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid MFA token');
    });

    it('should handle database errors during setup', async () => {
      mockOperatorRepository.findById.mockRejectedValue(new Error('Database connection failed'));

      const result = await mfaService.setupMfa('operator-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to setup MFA');
    });

    it('should handle missing operator gracefully', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const setupResult = await mfaService.setupMfa('nonexistent-operator');
      expect(setupResult.success).toBe(false);
      expect(setupResult.error).toBe('Operator not found');

      const verifyResult = await mfaService.verifyMfaToken({
        operatorId: 'nonexistent-operator',
        token: '123456',
      });
      expect(verifyResult.success).toBe(false);
      expect(verifyResult.error).toBe('MFA not configured for this operator');
    });
  });
});
