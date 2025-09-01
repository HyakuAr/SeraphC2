/**
 * Unit tests for password utilities
 */

import { PasswordUtils } from '../../../src/core/auth/password.utils';

describe('PasswordUtils', () => {
  const testPassword = 'TestPassword123!';
  const weakPassword = '123';
  const strongPassword = 'StrongP@ssw0rd123';

  describe('hashPassword', () => {
    it('should hash a password successfully', () => {
      const hashed = PasswordUtils.hashPassword(testPassword);

      expect(hashed).toHaveProperty('hash');
      expect(hashed).toHaveProperty('salt');
      expect(hashed).toHaveProperty('iterations');
      expect(typeof hashed.hash).toBe('string');
      expect(typeof hashed.salt).toBe('string');
      expect(typeof hashed.iterations).toBe('number');
      expect(hashed.hash.length).toBeGreaterThan(0);
      expect(hashed.salt.length).toBeGreaterThan(0);
      expect(hashed.iterations).toBeGreaterThan(0);
    });

    it('should generate different salts for same password', () => {
      const hashed1 = PasswordUtils.hashPassword(testPassword);
      const hashed2 = PasswordUtils.hashPassword(testPassword);

      expect(hashed1.salt).not.toBe(hashed2.salt);
      expect(hashed1.hash).not.toBe(hashed2.hash);
    });

    it('should use custom iterations when provided', () => {
      const customIterations = 50000;
      const hashed = PasswordUtils.hashPassword(testPassword, customIterations);

      expect(hashed.iterations).toBe(customIterations);
    });

    it('should throw error for empty password', () => {
      expect(() => PasswordUtils.hashPassword('')).toThrow('Password cannot be empty');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', () => {
      const hashed = PasswordUtils.hashPassword(testPassword);
      const isValid = PasswordUtils.verifyPassword(testPassword, hashed);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', () => {
      const hashed = PasswordUtils.hashPassword(testPassword);
      const isValid = PasswordUtils.verifyPassword('WrongPassword', hashed);

      expect(isValid).toBe(false);
    });

    it('should return false for empty password', () => {
      const hashed = PasswordUtils.hashPassword(testPassword);
      const isValid = PasswordUtils.verifyPassword('', hashed);

      expect(isValid).toBe(false);
    });

    it('should return false for null/undefined inputs', () => {
      const hashed = PasswordUtils.hashPassword(testPassword);

      expect(PasswordUtils.verifyPassword('', hashed)).toBe(false);
      expect(PasswordUtils.verifyPassword(testPassword, null as any)).toBe(false);
    });
  });

  describe('serializeHashedPassword and deserializeHashedPassword', () => {
    it('should serialize and deserialize correctly', () => {
      const hashed = PasswordUtils.hashPassword(testPassword);
      const serialized = PasswordUtils.serializeHashedPassword(hashed);
      const deserialized = PasswordUtils.deserializeHashedPassword(serialized);

      expect(deserialized.hash).toBe(hashed.hash);
      expect(deserialized.salt).toBe(hashed.salt);
      expect(deserialized.iterations).toBe(hashed.iterations);
    });

    it('should throw error for invalid serialized format', () => {
      expect(() => PasswordUtils.deserializeHashedPassword('invalid-json')).toThrow();
      expect(() => PasswordUtils.deserializeHashedPassword('{}')).toThrow();
      expect(() => PasswordUtils.deserializeHashedPassword('{"hash":"test"}')).toThrow();
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const validation = PasswordUtils.validatePasswordStrength(strongPassword);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject weak password', () => {
      const validation = PasswordUtils.validatePasswordStrength(weakPassword);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should identify specific password weaknesses', () => {
      const validations = [
        PasswordUtils.validatePasswordStrength('short'),
        PasswordUtils.validatePasswordStrength('nouppercase123!'),
        PasswordUtils.validatePasswordStrength('NOLOWERCASE123!'),
        PasswordUtils.validatePasswordStrength('NoNumbers!'),
        PasswordUtils.validatePasswordStrength('NoSpecialChars123'),
      ];

      validations.forEach(validation => {
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate password of specified length', () => {
      const password = PasswordUtils.generateSecurePassword(16);
      expect(password.length).toBe(16);
    });

    it('should generate password with default length', () => {
      const password = PasswordUtils.generateSecurePassword();
      expect(password.length).toBe(16);
    });

    it('should generate strong password that passes validation', () => {
      const password = PasswordUtils.generateSecurePassword(20);
      const validation = PasswordUtils.validatePasswordStrength(password);

      expect(validation.isValid).toBe(true);
    });

    it('should generate different passwords each time', () => {
      const password1 = PasswordUtils.generateSecurePassword();
      const password2 = PasswordUtils.generateSecurePassword();

      expect(password1).not.toBe(password2);
    });
  });
});
