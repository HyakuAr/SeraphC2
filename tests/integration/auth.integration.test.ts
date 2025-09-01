/**
 * Integration tests for authentication system
 */

import { AuthService } from '../../src/core/auth/auth.service';
// import { AuthMiddleware } from '../../src/core/auth/auth.middleware';
import { JwtUtils } from '../../src/core/auth/jwt.utils';
import { PasswordUtils } from '../../src/core/auth/password.utils';
import { OperatorRepository } from '../../src/core/repositories/interfaces';
import { OperatorRole, Operator } from '../../src/types/entities';

describe('Authentication Integration Tests', () => {
  let authService: AuthService;
  // let authMiddleware: AuthMiddleware;
  let mockOperatorRepository: jest.Mocked<OperatorRepository>;

  const testOperator: Operator = {
    id: 'test-operator-id',
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: '',
    role: OperatorRole.OPERATOR,
    permissions: [{ resource: 'implants', actions: ['read', 'write'] }],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Set up test environment
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['JWT_ACCESS_EXPIRY'] = '15m';
    process.env['JWT_REFRESH_EXPIRY'] = '7d';

    // Create mock repository
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
    };

    // Set up password hash for test operator
    const hashedPassword = PasswordUtils.hashPassword('TestPassword123!');
    testOperator.passwordHash = PasswordUtils.serializeHashedPassword(hashedPassword);

    authService = new AuthService(mockOperatorRepository);
    // authMiddleware = new AuthMiddleware(authService);

    jest.clearAllMocks();
  });

  describe('Complete Authentication Flow', () => {
    it('should handle complete login -> token validation -> logout flow', async () => {
      // Setup mocks
      mockOperatorRepository.findByUsername.mockResolvedValue(testOperator);
      mockOperatorRepository.update.mockResolvedValue(testOperator);
      mockOperatorRepository.findById.mockResolvedValue(testOperator);

      // Step 1: Login
      const loginResult = await authService.login({
        username: 'testuser',
        password: 'TestPassword123!',
      });

      expect(loginResult.success).toBe(true);
      expect(loginResult.tokens).toBeDefined();
      expect(loginResult.operator).toBeDefined();

      // Step 2: Validate token
      if (loginResult.tokens) {
        const validationResult = await authService.validateToken(loginResult.tokens.accessToken);

        expect(validationResult.valid).toBe(true);
        expect(validationResult.operator).toBeDefined();
        expect(validationResult.operator?.username).toBe('testuser');
      }

      // Step 3: Logout
      const logoutResult = await authService.logout(testOperator.id);
      expect(logoutResult.success).toBe(true);

      // Verify repository calls
      expect(mockOperatorRepository.findByUsername).toHaveBeenCalledWith('testuser');
      expect(mockOperatorRepository.update).toHaveBeenCalledTimes(2); // Login and logout
    });

    it('should handle token refresh flow', async () => {
      // Setup mocks
      mockOperatorRepository.findByUsername.mockResolvedValue(testOperator);
      mockOperatorRepository.update.mockResolvedValue(testOperator);
      mockOperatorRepository.findById.mockResolvedValue(testOperator);

      // Step 1: Login to get tokens
      const loginResult = await authService.login({
        username: 'testuser',
        password: 'TestPassword123!',
      });

      expect(loginResult.success).toBe(true);
      expect(loginResult.tokens).toBeDefined();

      // Step 2: Use refresh token to get new access token
      if (loginResult.tokens) {
        // Update mock to return operator with session token
        const operatorWithSession = {
          ...testOperator,
          sessionToken: loginResult.tokens.refreshToken,
        };
        mockOperatorRepository.findById.mockResolvedValue(operatorWithSession);

        const refreshResult = await authService.refreshToken({
          refreshToken: loginResult.tokens.refreshToken,
        });

        expect(refreshResult.success).toBe(true);
        expect(refreshResult.accessToken).toBeDefined();
      }
    });

    it('should handle password change flow', async () => {
      // Setup mocks
      mockOperatorRepository.findById.mockResolvedValue(testOperator);
      mockOperatorRepository.update.mockResolvedValue(testOperator);

      // Change password
      const changeResult = await authService.changePassword(
        testOperator.id,
        'TestPassword123!',
        'NewStrongPassword123!'
      );

      expect(changeResult.success).toBe(true);
      expect(mockOperatorRepository.update).toHaveBeenCalledWith(
        testOperator.id,
        expect.objectContaining({
          passwordHash: expect.any(String),
          sessionToken: undefined, // Should clear session token
        })
      );
    });
  });

  describe('JWT Token Lifecycle', () => {
    it('should generate, validate, and handle token expiry correctly', () => {
      // Generate tokens
      const tokens = JwtUtils.generateTokenPair(
        testOperator.id,
        testOperator.username,
        testOperator.role
      );

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();

      // Validate access token
      const decoded = JwtUtils.validateAccessToken(tokens.accessToken);
      expect(decoded).not.toBeNull();
      expect(decoded?.operatorId).toBe(testOperator.id);
      expect(decoded?.username).toBe(testOperator.username);
      expect(decoded?.role).toBe(testOperator.role);

      // Validate refresh token
      const refreshDecoded = JwtUtils.validateRefreshToken(tokens.refreshToken);
      expect(refreshDecoded).not.toBeNull();
      expect(refreshDecoded?.operatorId).toBe(testOperator.id);

      // Check token expiry
      expect(JwtUtils.isTokenExpired(tokens.accessToken)).toBe(false);
    });
  });

  describe('Password Security', () => {
    it('should handle password hashing and verification securely', () => {
      const password = 'TestPassword123!';

      // Hash password
      const hashed = PasswordUtils.hashPassword(password);
      expect(hashed.hash).toBeDefined();
      expect(hashed.salt).toBeDefined();
      expect(hashed.iterations).toBeGreaterThan(0);

      // Verify correct password
      expect(PasswordUtils.verifyPassword(password, hashed)).toBe(true);

      // Reject incorrect password
      expect(PasswordUtils.verifyPassword('WrongPassword', hashed)).toBe(false);

      // Test serialization
      const serialized = PasswordUtils.serializeHashedPassword(hashed);
      const deserialized = PasswordUtils.deserializeHashedPassword(serialized);

      expect(deserialized.hash).toBe(hashed.hash);
      expect(deserialized.salt).toBe(hashed.salt);
      expect(deserialized.iterations).toBe(hashed.iterations);
    });

    it('should validate password strength correctly', () => {
      const strongPassword = 'StrongP@ssw0rd123';
      const weakPassword = 'weak';

      const strongValidation = PasswordUtils.validatePasswordStrength(strongPassword);
      expect(strongValidation.isValid).toBe(true);
      expect(strongValidation.errors).toHaveLength(0);

      const weakValidation = PasswordUtils.validatePasswordStrength(weakPassword);
      expect(weakValidation.isValid).toBe(false);
      expect(weakValidation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      // Test with non-existent user
      mockOperatorRepository.findByUsername.mockResolvedValue(null);

      const result = await authService.login({
        username: 'nonexistent',
        password: 'password',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid username or password');
    });

    it('should handle repository errors gracefully', async () => {
      // Test with repository error
      mockOperatorRepository.findByUsername.mockRejectedValue(new Error('Database error'));

      const result = await authService.login({
        username: 'testuser',
        password: 'TestPassword123!',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });
  });
});
