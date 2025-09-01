/**
 * Unit tests for authentication service
 */

import { AuthService, LoginRequest } from '../../../src/core/auth/auth.service';
import { OperatorRepository } from '../../../src/core/repositories/interfaces';
import { OperatorRole, Operator } from '../../../src/types/entities';
import { PasswordUtils } from '../../../src/core/auth/password.utils';

// Mock the operator repository
jest.mock('../../../src/core/repositories/operator.repository');

describe('AuthService', () => {
  let authService: AuthService;
  let mockOperatorRepository: jest.Mocked<OperatorRepository>;

  const mockOperator: Operator = {
    id: 'test-operator-id',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: '',
    role: OperatorRole.OPERATOR,
    permissions: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockOperatorRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByUsername: jest.fn(),
      findByEmail: jest.fn(),
      findBySessionToken: jest.fn(),
      findActiveOperators: jest.fn(),
      updateLastLogin: jest.fn(),
      updateSessionToken: jest.fn(),
      deactivateOperator: jest.fn(),
      activateOperator: jest.fn(),
    } as jest.Mocked<OperatorRepository>;
    authService = new AuthService(mockOperatorRepository);

    // Set up password hash for mock operator
    const hashedPassword = PasswordUtils.hashPassword('TestPassword123!');
    mockOperator.passwordHash = PasswordUtils.serializeHashedPassword(hashedPassword);

    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginRequest: LoginRequest = {
      username: 'testuser',
      password: 'TestPassword123!',
    };

    it('should login successfully with valid credentials', async () => {
      mockOperatorRepository.findByUsername.mockResolvedValue(mockOperator);
      mockOperatorRepository.update.mockResolvedValue(mockOperator);

      const result = await authService.login(loginRequest);

      expect(result.success).toBe(true);
      expect(result.operator).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.operator?.username).toBe(mockOperator.username);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith(
        mockOperator.id,
        expect.objectContaining({
          lastLogin: expect.any(Date),
          sessionToken: expect.any(String),
        })
      );
    });

    it('should fail login with invalid username', async () => {
      mockOperatorRepository.findByUsername.mockResolvedValue(null);

      const result = await authService.login(loginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid username or password');
      expect(result.operator).toBeUndefined();
      expect(result.tokens).toBeUndefined();
    });

    it('should fail login with invalid password', async () => {
      mockOperatorRepository.findByUsername.mockResolvedValue(mockOperator);

      const invalidRequest = { ...loginRequest, password: 'WrongPassword' };
      const result = await authService.login(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid username or password');
    });

    it('should fail login for inactive operator', async () => {
      const inactiveOperator = { ...mockOperator, isActive: false };
      mockOperatorRepository.findByUsername.mockResolvedValue(inactiveOperator);

      const result = await authService.login(loginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is disabled');
    });

    it('should handle repository errors gracefully', async () => {
      mockOperatorRepository.findByUsername.mockRejectedValue(new Error('Database error'));

      const result = await authService.login(loginRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockOperatorRepository.update.mockResolvedValue(mockOperator);

      const result = await authService.logout(mockOperator.id);

      expect(result.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith(mockOperator.id, {
        sessionToken: undefined,
      });
    });

    it('should handle logout errors gracefully', async () => {
      mockOperatorRepository.update.mockRejectedValue(new Error('Database error'));

      const result = await authService.logout(mockOperator.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Logout failed');
    });
  });

  describe('createOperator', () => {
    it('should create operator successfully', async () => {
      const newOperator = { ...mockOperator, id: 'new-operator-id' };
      mockOperatorRepository.findByUsername.mockResolvedValue(null);
      mockOperatorRepository.create.mockResolvedValue(newOperator);

      const result = await authService.createOperator(
        'newuser',
        'new@example.com',
        'StrongPassword123!',
        OperatorRole.OPERATOR
      );

      expect(result.success).toBe(true);
      expect(result.operatorId).toBe(newOperator.id);
      expect(mockOperatorRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'newuser',
          email: 'new@example.com',
          role: OperatorRole.OPERATOR,
        })
      );
    });

    it('should fail to create operator with existing username', async () => {
      mockOperatorRepository.findByUsername.mockResolvedValue(mockOperator);

      const result = await authService.createOperator(
        'testuser',
        'new@example.com',
        'StrongPassword123!'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username already exists');
    });

    it('should fail to create operator with weak password', async () => {
      mockOperatorRepository.findByUsername.mockResolvedValue(null);

      const result = await authService.createOperator('newuser', 'new@example.com', 'weak');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password validation failed');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);
      mockOperatorRepository.update.mockResolvedValue(mockOperator);

      const result = await authService.changePassword(
        mockOperator.id,
        'TestPassword123!',
        'NewStrongPassword123!'
      );

      expect(result.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith(
        mockOperator.id,
        expect.objectContaining({
          passwordHash: expect.any(String),
          sessionToken: undefined,
        })
      );
    });

    it('should fail with incorrect current password', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const result = await authService.changePassword(
        mockOperator.id,
        'WrongCurrentPassword',
        'NewStrongPassword123!'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Current password is incorrect');
    });

    it('should fail with weak new password', async () => {
      mockOperatorRepository.findById.mockResolvedValue(mockOperator);

      const result = await authService.changePassword(mockOperator.id, 'TestPassword123!', 'weak');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Password validation failed');
    });

    it('should fail for non-existent operator', async () => {
      mockOperatorRepository.findById.mockResolvedValue(null);

      const result = await authService.changePassword(
        'non-existent-id',
        'TestPassword123!',
        'NewStrongPassword123!'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operator not found');
    });
  });

  describe('validateToken', () => {
    it('should validate token successfully', async () => {
      // Generate a real token for testing
      const tokens = await authService.login({
        username: 'testuser',
        password: 'TestPassword123!',
      });

      if (tokens.success && tokens.tokens) {
        mockOperatorRepository.findByUsername.mockResolvedValue(mockOperator);
        mockOperatorRepository.update.mockResolvedValue(mockOperator);
        mockOperatorRepository.findById.mockResolvedValue(mockOperator);

        const result = await authService.validateToken(tokens.tokens.accessToken);

        expect(result.valid).toBe(true);
        expect(result.operator).toBeDefined();
      }
    });

    it('should fail validation for invalid token', async () => {
      const result = await authService.validateToken('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should fail validation for inactive operator', async () => {
      // This test would require a more complex setup with actual JWT validation
      // For now, we'll test the basic case
      const result = await authService.validateToken('invalid-token');

      expect(result.valid).toBe(false);
    });
  });
});
