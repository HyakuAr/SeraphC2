/**
 * SeraphC2 Cryptographic Utilities
 *
 * This module provides comprehensive cryptographic functionality including:
 * - AES-256-GCM encryption/decryption with authenticated encryption
 * - HKDF-based key derivation for per-session keys
 * - Secure random number generation
 * - Message authentication and integrity verification
 * - Key management utilities
 */

export {
  // Core cryptographic functions
  generateSecureRandom,
  generateEncryptionKey,
  deriveKey,
  encryptAES256GCM,
  decryptAES256GCM,

  // High-level message encryption
  encryptMessage,
  decryptMessage,
  verifyMessageIntegrity,
  generateSessionKeys,

  // Types
  EncryptionResult,
  DecryptionInput,
  KeyDerivationOptions,
} from './crypto.utils';

export {
  // Key management
  KeyManager,

  // Types
  KeyMetadata,
  ManagedKey,
} from './key-manager';

export {
  // Crypto service
  CryptoService,
} from './crypto.service';
