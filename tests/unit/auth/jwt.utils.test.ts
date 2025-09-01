/**
 * Unit tests for JWT utilities
 */

import { JwtUtils } from '../../../src/core/auth/jwt.utils';
import { OperatorRole } from '../../../src/types/entities';

describe('JwtUtils', () => {
  const mockOperatorId = 'test-operator-id';
  const mockUsername = 'testuser';
  const mockRole = OperatorRole.OPERATOR;

  beforeAll(() => {
    // Set test environment variables
    process.env['JWT_ACCESS_SECRET'] = 'test-access-secret';
    process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
    process.env['JWT_ACCESS_EXPIRY'] = '15m';
    process.env['JWT_REFRESH_EXPIRY'] = '7d';
  });

  describe('generateTokenPair', () => {
    it('should generate valid access and refresh tokens', () => {
      const tokens = JwtUtils.generateTokenPair(mockOperatorId, mockUsername, mockRole);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(tokens.refreshToken.length).toBeGreaterThan(0);
    });

    it('should generate different tokens for different operators', () => {
      const tokens1 = JwtUtils.generateTokenPair('operator1', 'user1', mockRole);
      const tokens2 = JwtUtils.generateTokenPair('operator2', 'user2', mockRole);

      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe('validateAccessToken', () => {
    it('should validate a valid access token', () => {
      const tokens = JwtUtils.generateTokenPair(mockOperatorId, mockUsername, mockRole);
      const decoded = JwtUtils.validateAccessToken(tokens.accessToken);

      expect(decoded).not.toBeNull();
      expect(decoded?.operatorId).toBe(mockOperatorId);
      expect(decoded?.username).toBe(mockUsername);
      expect(decoded?.role).toBe(mockRole);
    });

    it('should return null for invalid token', () => {
      const decoded = JwtUtils.validateAccessToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should return null for empty token', () => {
      const decoded = JwtUtils.validateAccessToken('');
      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      const decoded = JwtUtils.validateAccessToken('malformed.token.here');
      expect(decoded).toBeNull();
    });
  });

  describe('validateRefreshToken', () => {
    it('should validate a valid refresh token', () => {
      const tokens = JwtUtils.generateTokenPair(mockOperatorId, mockUsername, mockRole);
      const decoded = JwtUtils.validateRefreshToken(tokens.refreshToken);

      expect(decoded).not.toBeNull();
      expect(decoded?.operatorId).toBe(mockOperatorId);
    });

    it('should return null for invalid refresh token', () => {
      const decoded = JwtUtils.validateRefreshToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'test-token-123';
      const header = `Bearer ${token}`;
      const extracted = JwtUtils.extractTokenFromHeader(header);

      expect(extracted).toBe(token);
    });

    it('should return null for invalid header format', () => {
      expect(JwtUtils.extractTokenFromHeader('Invalid token')).toBeNull();
      expect(JwtUtils.extractTokenFromHeader('Bearer')).toBeNull();
      expect(JwtUtils.extractTokenFromHeader('')).toBeNull();
    });

    it('should return null for undefined header', () => {
      expect(JwtUtils.extractTokenFromHeader(undefined)).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid non-expired token', () => {
      const tokens = JwtUtils.generateTokenPair(mockOperatorId, mockUsername, mockRole);
      const isExpired = JwtUtils.isTokenExpired(tokens.accessToken);

      expect(isExpired).toBe(false);
    });

    it('should return true for invalid token', () => {
      const isExpired = JwtUtils.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });

    it('should return true for empty token', () => {
      const isExpired = JwtUtils.isTokenExpired('');
      expect(isExpired).toBe(true);
    });
  });
});
