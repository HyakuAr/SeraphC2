/**
 * Authentication service for SeraphC2
 * Handles user login, logout, and session management
 */

import { OperatorRepository } from '../repositories/interfaces';
import { Operator, OperatorRole } from '../../types/entities';
import { JwtUtils, TokenPair } from './jwt.utils';
import { PasswordUtils } from './password.utils';
import { MfaService } from './mfa.service';

export interface LoginRequest {
  username: string;
  password: string;
  mfaToken?: string;
}

export interface LoginResponse {
  success: boolean;
  requiresMfa?: boolean;
  operator?: {
    id: string;
    username: string;
    email: string;
    role: OperatorRole;
    lastLogin: Date;
    mfaConfigured: boolean;
  };
  tokens?: TokenPair;
  error?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  accessToken?: string;
  error?: string;
}

export class AuthService {
  constructor(
    private operatorRepository: OperatorRepository,
    private mfaService?: MfaService
  ) {}

  /**
   * Authenticate operator and generate tokens
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    try {
      // Find operator by username
      const operator = await this.operatorRepository.findByUsername(request.username);

      if (!operator) {
        return {
          success: false,
          error: 'Invalid username or password',
        };
      }

      // Check if operator is active
      if (!operator.isActive) {
        return {
          success: false,
          error: 'Account is disabled',
        };
      }

      // Verify password
      const hashedPassword = PasswordUtils.deserializeHashedPassword(operator.passwordHash);
      const isPasswordValid = PasswordUtils.verifyPassword(request.password, hashedPassword);

      if (!isPasswordValid) {
        return {
          success: false,
          error: 'Invalid username or password',
        };
      }

      // Check if MFA is required and configured
      const mfaConfigured = !!operator.totpSecret;
      const mfaRequired = this.mfaService ? await this.mfaService.isMfaRequired(operator) : false;

      // If MFA is required but no token provided, request MFA
      if (mfaRequired && !request.mfaToken) {
        return {
          success: false,
          requiresMfa: true,
          error: 'MFA token required',
          operator: {
            id: operator.id,
            username: operator.username,
            email: operator.email,
            role: operator.role,
            lastLogin: operator.lastLogin || new Date(),
            mfaConfigured,
          },
        };
      }

      // If MFA token provided, verify it
      if (request.mfaToken && this.mfaService) {
        const mfaResult = await this.mfaService.verifyMfaToken({
          operatorId: operator.id,
          token: request.mfaToken,
        });

        if (!mfaResult.success) {
          return {
            success: false,
            error: mfaResult.error || 'Invalid MFA token',
          };
        }
      }

      // Generate tokens
      const tokens = JwtUtils.generateTokenPair(operator.id, operator.username, operator.role);

      // Update last login and session token
      await this.operatorRepository.update(operator.id, {
        lastLogin: new Date(),
        sessionToken: tokens.refreshToken,
      });

      return {
        success: true,
        operator: {
          id: operator.id,
          username: operator.username,
          email: operator.email,
          role: operator.role,
          lastLogin: new Date(),
          mfaConfigured,
        },
        tokens,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Logout operator and invalidate session
   */
  async logout(operatorId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Clear session token
      await this.operatorRepository.update(operatorId, {
        sessionToken: undefined,
      });

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        error: 'Logout failed',
      };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    try {
      // Validate refresh token
      const decoded = JwtUtils.validateRefreshToken(request.refreshToken);

      if (!decoded) {
        return {
          success: false,
          error: 'Invalid refresh token',
        };
      }

      // Find operator and verify session token
      const operator = await this.operatorRepository.findById(decoded.operatorId);

      if (!operator || !operator.isActive || operator.sessionToken !== request.refreshToken) {
        return {
          success: false,
          error: 'Invalid session',
        };
      }

      // Generate new access token
      const tokens = JwtUtils.generateTokenPair(operator.id, operator.username, operator.role);

      // Update session token
      await this.operatorRepository.update(operator.id, {
        sessionToken: tokens.refreshToken,
      });

      return {
        success: true,
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: 'Token refresh failed',
      };
    }
  }

  /**
   * Validate access token and return operator info
   */
  async validateToken(
    token: string
  ): Promise<{ valid: boolean; operator?: Operator; error?: string }> {
    try {
      const decoded = JwtUtils.validateAccessToken(token);

      if (!decoded) {
        return {
          valid: false,
          error: 'Invalid token',
        };
      }

      // Find operator to ensure they still exist and are active
      const operator = await this.operatorRepository.findById(decoded.operatorId);

      if (!operator || !operator.isActive) {
        return {
          valid: false,
          error: 'Operator not found or inactive',
        };
      }

      return {
        valid: true,
        operator,
      };
    } catch (error) {
      console.error('Token validation error:', error);
      return {
        valid: false,
        error: 'Token validation failed',
      };
    }
  }

  /**
   * Create a new operator account
   */
  async createOperator(
    username: string,
    email: string,
    password: string,
    role: OperatorRole = OperatorRole.OPERATOR
  ): Promise<{ success: boolean; operatorId?: string; error?: string }> {
    try {
      // Validate password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: `Password validation failed: ${passwordValidation.errors.join(', ')}`,
        };
      }

      // Check if username already exists
      const existingOperator = await this.operatorRepository.findByUsername(username);
      if (existingOperator) {
        return {
          success: false,
          error: 'Username already exists',
        };
      }

      // Hash password
      const hashedPassword = PasswordUtils.hashPassword(password);
      const serializedPassword = PasswordUtils.serializeHashedPassword(hashedPassword);

      // Create operator
      const operator = await this.operatorRepository.create({
        username,
        email,
        passwordHash: serializedPassword,
        role,
        permissions: [], // Default permissions based on role can be set here
      });

      return {
        success: true,
        operatorId: operator.id,
      };
    } catch (error) {
      console.error('Create operator error:', error);
      return {
        success: false,
        error: 'Failed to create operator',
      };
    }
  }

  /**
   * Change operator password
   */
  async changePassword(
    operatorId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Find operator
      const operator = await this.operatorRepository.findById(operatorId);
      if (!operator) {
        return {
          success: false,
          error: 'Operator not found',
        };
      }

      // Verify current password
      const hashedPassword = PasswordUtils.deserializeHashedPassword(operator.passwordHash);
      const isCurrentPasswordValid = PasswordUtils.verifyPassword(currentPassword, hashedPassword);

      if (!isCurrentPasswordValid) {
        return {
          success: false,
          error: 'Current password is incorrect',
        };
      }

      // Validate new password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: `Password validation failed: ${passwordValidation.errors.join(', ')}`,
        };
      }

      // Hash new password
      const newHashedPassword = PasswordUtils.hashPassword(newPassword);
      const serializedPassword = PasswordUtils.serializeHashedPassword(newHashedPassword);

      // Update password and clear session token to force re-login
      await this.operatorRepository.update(operatorId, {
        passwordHash: serializedPassword,
        sessionToken: undefined,
      });

      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return {
        success: false,
        error: 'Failed to change password',
      };
    }
  }
}
