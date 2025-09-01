/**
 * SeraphC2 Secrets Management Utilities
 * Secure secret loading, validation, and certificate management
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { log } from './logger';

export interface SecretValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  strength?: 'weak' | 'medium' | 'strong';
}

export interface CertificateInfo {
  path: string;
  exists: boolean;
  isValid: boolean;
  expiresAt?: Date;
  issuer?: string;
  subject?: string;
  errors: string[];
}

export interface TLSConfig {
  cert: string;
  key: string;
  ca?: string;
  passphrase?: string;
  secureProtocol?: string;
  ciphers?: string;
}

/**
 * Secrets Manager for secure handling of sensitive configuration
 */
export class SecretsManager {
  private static instance: SecretsManager;
  private encryptionKey: Buffer | null = null;
  private secretsCache: Map<string, { value: string; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  private constructor() {
    this.initializeEncryption();
  }

  public static getInstance(): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager();
    }
    return SecretsManager.instance;
  }

  /**
   * Initialize encryption key for secret encryption/decryption
   */
  private initializeEncryption(): void {
    try {
      const encryptionKeyEnv = process.env.ENCRYPTION_KEY;
      if (encryptionKeyEnv && encryptionKeyEnv.length >= 32) {
        this.encryptionKey = Buffer.from(createHash('sha256').update(encryptionKeyEnv).digest());
        log.debug('Encryption key initialized successfully');
      } else {
        log.warn('ENCRYPTION_KEY not set or too short, secret encryption disabled');
      }
    } catch (error) {
      log.error('Failed to initialize encryption key', error as Error);
    }
  }

  /**
   * Securely load a secret from environment variables with validation
   */
  public loadSecret(
    name: string,
    options: {
      required?: boolean;
      defaultValue?: string;
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
      encrypted?: boolean;
    } = {}
  ): string | null {
    const {
      required = false,
      defaultValue,
      minLength = 1,
      maxLength = 1024,
      pattern,
      encrypted = false,
    } = options;

    try {
      // Check cache first
      const cached = this.secretsCache.get(name);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.value;
      }

      let value = process.env[name] || defaultValue;

      if (!value) {
        if (required) {
          const error = `Required secret ${name} is not set`;
          log.error(error);
          throw new Error(error);
        }
        return null;
      }

      // Decrypt if needed
      if (encrypted && this.encryptionKey) {
        try {
          value = this.decryptSecret(value);
        } catch (error) {
          log.error(`Failed to decrypt secret ${name}`, error as Error);
          throw new Error(`Failed to decrypt secret ${name}`);
        }
      }

      // Validate length
      if (value.length < minLength) {
        const error = `Secret ${name} is too short (minimum ${minLength} characters)`;
        log.error(error);
        throw new Error(error);
      }

      if (value.length > maxLength) {
        const error = `Secret ${name} is too long (maximum ${maxLength} characters)`;
        log.error(error);
        throw new Error(error);
      }

      // Validate pattern
      if (pattern && !pattern.test(value)) {
        const error = `Secret ${name} does not match required pattern`;
        log.error(error);
        throw new Error(error);
      }

      // Cache the secret
      this.secretsCache.set(name, { value, timestamp: Date.now() });

      log.debug(`Secret ${name} loaded successfully`);
      return value;
    } catch (error) {
      log.error(`Failed to load secret ${name}`, error as Error);
      if (required) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Validate secret strength and security
   */
  public validateSecret(secret: string, name?: string): SecretValidationResult {
    const result: SecretValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Length validation
    if (secret.length < 8) {
      result.errors.push('Secret must be at least 8 characters long');
      result.isValid = false;
    } else if (secret.length < 16) {
      result.warnings.push('Secret should be at least 16 characters for better security');
    }

    // Character diversity validation
    const hasLowercase = /[a-z]/.test(secret);
    const hasUppercase = /[A-Z]/.test(secret);
    const hasNumbers = /[0-9]/.test(secret);
    const hasSpecialChars = /[^A-Za-z0-9]/.test(secret);

    let characterTypes = 0;
    if (hasLowercase) characterTypes++;
    if (hasUppercase) characterTypes++;
    if (hasNumbers) characterTypes++;
    if (hasSpecialChars) characterTypes++;

    if (characterTypes < 2) {
      result.errors.push('Secret must contain at least 2 different character types');
      result.isValid = false;
    } else if (characterTypes < 3) {
      result.warnings.push('Secret should contain at least 3 different character types');
    }

    // Common patterns validation
    const commonPatterns = [
      /(.)\1{3,}/, // Repeated characters
      /123456|654321|abcdef|qwerty/i, // Common sequences
      /password|secret|admin|root|user/i, // Common words
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(secret)) {
        result.warnings.push('Secret contains common patterns that reduce security');
        break;
      }
    }

    // Development/default value detection
    if (name && (secret.includes('dev') || secret.includes('default') || secret.includes('test'))) {
      if (process.env.NODE_ENV === 'production') {
        result.errors.push('Secret appears to be a development/default value in production');
        result.isValid = false;
      } else {
        result.warnings.push('Secret appears to be a development/default value');
      }
    }

    // Determine strength
    if (result.isValid) {
      if (secret.length >= 32 && characterTypes >= 4) {
        result.strength = 'strong';
      } else if (secret.length >= 16 && characterTypes >= 3) {
        result.strength = 'medium';
      } else {
        result.strength = 'weak';
      }
    }

    return result;
  }

  /**
   * Generate a cryptographically secure secret
   */
  public generateSecret(length: number = 32, includeSpecialChars: boolean = true): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let charset = lowercase + uppercase + numbers;
    if (includeSpecialChars) {
      charset += specialChars;
    }

    const secret = Array.from(randomBytes(length))
      .map(byte => charset[byte % charset.length])
      .join('');

    log.debug(`Generated secure secret of length ${length}`);
    return secret;
  }

  /**
   * Encrypt a secret for storage
   */
  public encryptSecret(plaintext: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and encrypted data
    const result = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;

    log.debug('Secret encrypted successfully');
    return result;
  }

  /**
   * Decrypt a secret from storage
   */
  public decryptSecret(encryptedData: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    log.debug('Secret decrypted successfully');
    return decrypted;
  }

  /**
   * Clear secrets cache
   */
  public clearCache(): void {
    this.secretsCache.clear();
    log.debug('Secrets cache cleared');
  }

  /**
   * Rotate encryption key (for key rotation scenarios)
   */
  public rotateEncryptionKey(newKey: string): void {
    if (newKey.length < 32) {
      throw new Error('New encryption key must be at least 32 characters');
    }

    this.encryptionKey = Buffer.from(createHash('sha256').update(newKey).digest());
    this.clearCache();
    log.info('Encryption key rotated successfully');
  }
}

/**
 * Certificate Management Utilities
 */
export class CertificateManager {
  /**
   * Load and validate TLS certificate configuration
   */
  public static loadTLSConfig(
    certPath: string,
    keyPath: string,
    caPath?: string,
    passphrase?: string
  ): TLSConfig {
    const config: TLSConfig = {
      cert: '',
      key: '',
      secureProtocol: 'TLSv1_2_method',
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384',
      ].join(':'),
    };

    try {
      // Load certificate
      if (!existsSync(certPath)) {
        throw new Error(`Certificate file not found: ${certPath}`);
      }
      config.cert = readFileSync(certPath, 'utf8');

      // Load private key
      if (!existsSync(keyPath)) {
        throw new Error(`Private key file not found: ${keyPath}`);
      }
      config.key = readFileSync(keyPath, 'utf8');

      // Load CA certificate if provided
      if (caPath) {
        if (!existsSync(caPath)) {
          throw new Error(`CA certificate file not found: ${caPath}`);
        }
        config.ca = readFileSync(caPath, 'utf8');
      }

      // Set passphrase if provided
      if (passphrase) {
        config.passphrase = passphrase;
      }

      log.info('TLS configuration loaded successfully', {
        certPath,
        keyPath,
        caPath,
        hasPassphrase: !!passphrase,
      });

      return config;
    } catch (error) {
      log.error('Failed to load TLS configuration', error as Error);
      throw error;
    }
  }

  /**
   * Validate certificate file and get information
   */
  public static validateCertificate(certPath: string): CertificateInfo {
    const info: CertificateInfo = {
      path: certPath,
      exists: false,
      isValid: false,
      errors: [],
    };

    try {
      // Check if file exists
      if (!existsSync(certPath)) {
        info.errors.push('Certificate file does not exist');
        return info;
      }
      info.exists = true;

      // Check file permissions
      const stats = statSync(certPath);
      if (stats.mode & 0o044) {
        info.errors.push('Certificate file has overly permissive permissions');
      }

      // Read and validate certificate content
      const certContent = readFileSync(certPath, 'utf8');

      // Basic PEM format validation
      if (
        !certContent.includes('-----BEGIN CERTIFICATE-----') ||
        !certContent.includes('-----END CERTIFICATE-----')
      ) {
        info.errors.push('Certificate file is not in valid PEM format');
        return info;
      }

      // Extract certificate information (basic parsing)
      try {
        // This is a simplified validation - in production, you might want to use
        // a proper X.509 certificate parsing library
        const certLines = certContent.split('\n');
        const certData = certLines.filter(line => !line.startsWith('-----')).join('');

        if (certData.length === 0) {
          info.errors.push('Certificate contains no data');
          return info;
        }

        info.isValid = true;
        log.debug('Certificate validation successful', { certPath });
      } catch (parseError) {
        info.errors.push('Failed to parse certificate content');
        log.error('Certificate parsing error', parseError as Error);
      }
    } catch (error) {
      info.errors.push(`Certificate validation error: ${(error as Error).message}`);
      log.error('Certificate validation failed', error as Error);
    }

    return info;
  }

  /**
   * Validate private key file
   */
  public static validatePrivateKey(keyPath: string, passphrase?: string): CertificateInfo {
    const info: CertificateInfo = {
      path: keyPath,
      exists: false,
      isValid: false,
      errors: [],
    };

    try {
      // Check if file exists
      if (!existsSync(keyPath)) {
        info.errors.push('Private key file does not exist');
        return info;
      }
      info.exists = true;

      // Check file permissions (should be restrictive)
      const stats = statSync(keyPath);
      if (stats.mode & 0o077) {
        info.errors.push(
          'Private key file has overly permissive permissions (should be 600 or 400)'
        );
      }

      // Read and validate key content
      const keyContent = readFileSync(keyPath, 'utf8');

      // Basic PEM format validation for private keys
      const validKeyHeaders = [
        '-----BEGIN PRIVATE KEY-----',
        '-----BEGIN RSA PRIVATE KEY-----',
        '-----BEGIN EC PRIVATE KEY-----',
        '-----BEGIN ENCRYPTED PRIVATE KEY-----',
      ];

      const hasValidHeader = validKeyHeaders.some(header => keyContent.includes(header));
      if (!hasValidHeader) {
        info.errors.push('Private key file is not in valid PEM format');
        return info;
      }

      // Check if key is encrypted and passphrase is provided
      if (keyContent.includes('ENCRYPTED') && !passphrase) {
        info.errors.push('Private key is encrypted but no passphrase provided');
        return info;
      }

      info.isValid = true;
      log.debug('Private key validation successful', { keyPath });
    } catch (error) {
      info.errors.push(`Private key validation error: ${(error as Error).message}`);
      log.error('Private key validation failed', error as Error);
    }

    return info;
  }

  /**
   * Generate self-signed certificate for development/testing
   */
  public static generateSelfSignedCert(
    commonName: string = 'localhost',
    validityDays: number = 365
  ): { cert: string; key: string } {
    // Note: This is a placeholder implementation
    // In a real implementation, you would use a crypto library like 'node-forge'
    // or call openssl via child_process to generate actual certificates

    log.warn(
      'Self-signed certificate generation not implemented - use openssl or proper crypto library'
    );

    throw new Error('Self-signed certificate generation requires additional crypto library');
  }
}

/**
 * Utility functions for secret management
 */
export const secretsUtils = {
  /**
   * Validate all required secrets for production
   */
  validateProductionSecrets(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const secrets = SecretsManager.getInstance();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required secrets for production
    const requiredSecrets = [
      { name: 'JWT_SECRET', minLength: 32 },
      { name: 'ENCRYPTION_KEY', minLength: 32 },
      { name: 'DB_PASSWORD', minLength: 12 },
    ];

    for (const { name, minLength } of requiredSecrets) {
      try {
        const secret = secrets.loadSecret(name, { required: true, minLength });
        if (secret) {
          const validation = secrets.validateSecret(secret, name);
          errors.push(...validation.errors);
          warnings.push(...validation.warnings);
        }
      } catch (error) {
        errors.push(`${name}: ${(error as Error).message}`);
      }
    }

    // Optional but recommended secrets
    const optionalSecrets = ['REDIS_PASSWORD'];
    for (const name of optionalSecrets) {
      const secret = secrets.loadSecret(name);
      if (!secret && process.env.NODE_ENV === 'production') {
        warnings.push(`${name} is not set - recommended for production`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  },

  /**
   * Validate TLS configuration
   */
  validateTLSConfiguration(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const certPath = process.env.SSL_CERT_PATH;
    const keyPath = process.env.SSL_KEY_PATH;

    if (!certPath || !keyPath) {
      if (process.env.NODE_ENV === 'production') {
        errors.push('SSL_CERT_PATH and SSL_KEY_PATH must be set in production');
      } else {
        warnings.push('SSL_CERT_PATH and SSL_KEY_PATH not set - HTTPS will be disabled');
      }
      return { isValid: errors.length === 0, errors, warnings };
    }

    // Validate certificate
    const certInfo = CertificateManager.validateCertificate(certPath);
    if (!certInfo.isValid) {
      errors.push(...certInfo.errors.map(err => `Certificate: ${err}`));
    }

    // Validate private key
    const keyInfo = CertificateManager.validatePrivateKey(keyPath);
    if (!keyInfo.isValid) {
      errors.push(...keyInfo.errors.map(err => `Private key: ${err}`));
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  },

  /**
   * Initialize secrets management for application startup
   */
  initializeSecrets(): void {
    const secrets = SecretsManager.getInstance();

    // Validate production secrets
    const secretValidation = secretsUtils.validateProductionSecrets();
    if (secretValidation.warnings.length > 0) {
      log.warn('Secrets validation warnings:', { warnings: secretValidation.warnings });
    }

    if (!secretValidation.isValid) {
      log.error('Secrets validation failed', new Error(secretValidation.errors.join(', ')));
      throw new Error(`Secrets validation failed: ${secretValidation.errors.join(', ')}`);
    }

    // Validate TLS configuration
    const tlsValidation = secretsUtils.validateTLSConfiguration();
    if (tlsValidation.warnings.length > 0) {
      log.warn('TLS configuration warnings:', { warnings: tlsValidation.warnings });
    }

    if (!tlsValidation.isValid) {
      log.error('TLS configuration validation failed', new Error(tlsValidation.errors.join(', ')));
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`TLS validation failed: ${tlsValidation.errors.join(', ')}`);
      }
    }

    log.info('Secrets management initialized successfully');
  },
};

// Export singleton instance
export const secrets = SecretsManager.getInstance();
export const certificates = CertificateManager;
