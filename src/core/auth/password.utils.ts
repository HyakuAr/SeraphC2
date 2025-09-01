/**
 * Password hashing utilities using PBKDF2 with secure salt generation
 * Implements secure password handling for SeraphC2 operators
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

export interface HashedPassword {
  hash: string;
  salt: string;
  iterations: number;
}

export class PasswordUtils {
  private static readonly DEFAULT_ITERATIONS = 100000;
  private static readonly SALT_LENGTH = 32;
  private static readonly HASH_LENGTH = 64;
  private static readonly ALGORITHM = 'sha512';

  /**
   * Hash a password using PBKDF2 with secure salt generation
   */
  static hashPassword(
    password: string,
    iterations: number = this.DEFAULT_ITERATIONS
  ): HashedPassword {
    if (!password || password.length === 0) {
      throw new Error('Password cannot be empty');
    }

    const salt = randomBytes(this.SALT_LENGTH);
    const hash = pbkdf2Sync(password, salt, iterations, this.HASH_LENGTH, this.ALGORITHM);

    return {
      hash: hash.toString('hex'),
      salt: salt.toString('hex'),
      iterations,
    };
  }

  /**
   * Verify a password against a stored hash
   */
  static verifyPassword(password: string, storedHash: HashedPassword): boolean {
    if (!password || !storedHash) {
      return false;
    }

    try {
      const salt = Buffer.from(storedHash.salt, 'hex');
      const hash = pbkdf2Sync(
        password,
        salt,
        storedHash.iterations,
        this.HASH_LENGTH,
        this.ALGORITHM
      );
      const storedHashBuffer = Buffer.from(storedHash.hash, 'hex');

      // Use timing-safe comparison to prevent timing attacks
      return timingSafeEqual(hash, storedHashBuffer);
    } catch (error) {
      return false;
    }
  }

  /**
   * Serialize hashed password for database storage
   */
  static serializeHashedPassword(hashedPassword: HashedPassword): string {
    return JSON.stringify({
      hash: hashedPassword.hash,
      salt: hashedPassword.salt,
      iterations: hashedPassword.iterations,
    });
  }

  /**
   * Deserialize hashed password from database storage
   */
  static deserializeHashedPassword(serialized: string): HashedPassword {
    try {
      const parsed = JSON.parse(serialized);

      if (!parsed.hash || !parsed.salt || !parsed.iterations) {
        throw new Error('Invalid serialized password format');
      }

      return {
        hash: parsed.hash,
        salt: parsed.salt,
        iterations: parsed.iterations,
      };
    } catch (error) {
      throw new Error('Failed to deserialize hashed password');
    }
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate a secure random password
   */
  static generateSecurePassword(length: number = 16): string {
    const charset =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';

    // Ensure at least one character from each required category
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest with random characters
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password to avoid predictable patterns
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}
