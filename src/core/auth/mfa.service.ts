/**
 * Multi-Factor Authentication service for SeraphC2
 * Handles TOTP-based second factor authentication
 */

import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { OperatorRepository } from '../repositories/interfaces';
import { BackupCodesRepository } from '../repositories/backup-codes.repository';
import { Operator, OperatorRole } from '../../types/entities';

export interface MfaSetupResponse {
  success: boolean;
  secret?: string;
  qrCodeUrl?: string;
  backupCodes?: string[];
  error?: string;
}

export interface MfaVerificationRequest {
  operatorId: string;
  token: string;
}

export interface MfaVerificationResponse {
  success: boolean;
  error?: string;
}

export interface BackupCodeVerificationRequest {
  operatorId: string;
  backupCode: string;
}

export interface MfaEnforcementPolicy {
  enforceForRole: OperatorRole[];
  gracePeriodDays: number;
  allowBackupCodes: boolean;
}

export class MfaService {
  private readonly serviceName = 'SeraphC2';
  private readonly issuer = 'SeraphC2 C2 Framework';

  constructor(
    private operatorRepository: OperatorRepository,
    private backupCodesRepository: BackupCodesRepository,
    private enforcementPolicy: MfaEnforcementPolicy = {
      enforceForRole: [OperatorRole.ADMINISTRATOR],
      gracePeriodDays: 7,
      allowBackupCodes: true,
    }
  ) {}

  /**
   * Generate TOTP secret and QR code for operator
   */
  async setupMfa(operatorId: string): Promise<MfaSetupResponse> {
    try {
      const operator = await this.operatorRepository.findById(operatorId);
      if (!operator) {
        return {
          success: false,
          error: 'Operator not found',
        };
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `${this.serviceName} (${operator.username})`,
        issuer: this.issuer,
        length: 32,
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Store secret
      await this.operatorRepository.update(operatorId, {
        totpSecret: secret.base32,
      });

      // Store backup codes in database
      await this.backupCodesRepository.createMultiple(operatorId, backupCodes);

      return {
        success: true,
        secret: secret.base32,
        qrCodeUrl,
        backupCodes,
      };
    } catch (error) {
      console.error('MFA setup error:', error);
      return {
        success: false,
        error: 'Failed to setup MFA',
      };
    }
  }

  /**
   * Verify TOTP token
   */
  async verifyMfaToken(request: MfaVerificationRequest): Promise<MfaVerificationResponse> {
    try {
      const operator = await this.operatorRepository.findById(request.operatorId);
      if (!operator || !operator.totpSecret) {
        return {
          success: false,
          error: 'MFA not configured for this operator',
        };
      }

      const verified = speakeasy.totp.verify({
        secret: operator.totpSecret,
        encoding: 'base32',
        token: request.token,
        window: 2, // Allow 2 time steps (60 seconds) of drift
      });

      if (verified) {
        return { success: true };
      } else {
        return { success: false, error: 'Invalid MFA token' };
      }
    } catch (error) {
      console.error('MFA verification error:', error);
      return {
        success: false,
        error: 'MFA verification failed',
      };
    }
  }

  /**
   * Verify backup code
   */
  async verifyBackupCode(request: BackupCodeVerificationRequest): Promise<MfaVerificationResponse> {
    try {
      if (!this.enforcementPolicy.allowBackupCodes) {
        return {
          success: false,
          error: 'Backup codes are not allowed',
        };
      }

      const isValid = await this.backupCodesRepository.validateAndConsume(
        request.operatorId,
        request.backupCode
      );

      if (isValid) {
        return { success: true };
      } else {
        return { success: false, error: 'Invalid or already used backup code' };
      }
    } catch (error) {
      console.error('Backup code verification error:', error);
      return {
        success: false,
        error: 'Backup code verification failed',
      };
    }
  }

  /**
   * Check if MFA is required for operator
   */
  async isMfaRequired(operator: Operator): Promise<boolean> {
    // Check if operator's role requires MFA
    if (!this.enforcementPolicy.enforceForRole.includes(operator.role)) {
      return false;
    }

    // If MFA is already configured, it's required
    if (operator.totpSecret) {
      return true;
    }

    // Check grace period for new operators
    const gracePeriodMs = this.enforcementPolicy.gracePeriodDays * 24 * 60 * 60 * 1000;
    const operatorAge = Date.now() - operator.createdAt.getTime();

    return operatorAge > gracePeriodMs;
  }

  /**
   * Check if operator has MFA configured
   */
  async isMfaConfigured(operatorId: string): Promise<boolean> {
    try {
      const operator = await this.operatorRepository.findById(operatorId);
      return !!(operator && operator.totpSecret);
    } catch (error) {
      console.error('MFA configuration check error:', error);
      return false;
    }
  }

  /**
   * Disable MFA for operator (admin only)
   */
  async disableMfa(operatorId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.operatorRepository.update(operatorId, {
        totpSecret: undefined,
      });

      // Remove backup codes
      await this.backupCodesRepository.deleteByOperatorId(operatorId);

      return { success: true };
    } catch (error) {
      console.error('MFA disable error:', error);
      return {
        success: false,
        error: 'Failed to disable MFA',
      };
    }
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(operatorId: string): Promise<MfaSetupResponse> {
    try {
      const operator = await this.operatorRepository.findById(operatorId);
      if (!operator || !operator.totpSecret) {
        return {
          success: false,
          error: 'MFA not configured for this operator',
        };
      }

      const backupCodes = this.generateBackupCodes();
      await this.backupCodesRepository.createMultiple(operatorId, backupCodes);

      return {
        success: true,
        backupCodes,
      };
    } catch (error) {
      console.error('Backup code regeneration error:', error);
      return {
        success: false,
        error: 'Failed to regenerate backup codes',
      };
    }
  }

  /**
   * Update MFA enforcement policy
   */
  updateEnforcementPolicy(policy: Partial<MfaEnforcementPolicy>): void {
    this.enforcementPolicy = {
      ...this.enforcementPolicy,
      ...policy,
    };
  }

  /**
   * Get current enforcement policy
   */
  getEnforcementPolicy(): MfaEnforcementPolicy {
    return { ...this.enforcementPolicy };
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }
}
