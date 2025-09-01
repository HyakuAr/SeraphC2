import { randomBytes, createCipheriv, createDecipheriv, hkdf } from 'crypto';
import { promisify } from 'util';

const hkdfAsync = promisify(hkdf);

/**
 * Cryptographic utilities for SeraphC2
 * Implements AES-256-GCM encryption with HKDF key derivation
 */

export interface EncryptionResult {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  salt?: Buffer;
}

export interface DecryptionInput {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  key: Buffer;
}

export interface KeyDerivationOptions {
  salt?: Buffer;
  info?: Buffer;
  keyLength?: number;
}

/**
 * Generates cryptographically secure random bytes
 * @param length Number of bytes to generate
 * @returns Buffer containing random bytes
 */
export function generateSecureRandom(length: number): Buffer {
  if (length <= 0) {
    throw new Error('Length must be positive');
  }
  return randomBytes(length);
}

/**
 * Generates a secure random encryption key
 * @param keyLength Key length in bytes (default: 32 for AES-256)
 * @returns Buffer containing the key
 */
export function generateEncryptionKey(keyLength: number = 32): Buffer {
  return generateSecureRandom(keyLength);
}

/**
 * Derives a key using HKDF (HMAC-based Key Derivation Function)
 * @param masterKey The input key material
 * @param options Key derivation options
 * @returns Promise resolving to derived key
 */
export async function deriveKey(
  masterKey: Buffer,
  options: KeyDerivationOptions = {}
): Promise<Buffer> {
  const {
    salt = generateSecureRandom(32),
    info = Buffer.from('SeraphC2-HKDF'),
    keyLength = 32,
  } = options;

  if (masterKey.length === 0) {
    throw new Error('Master key cannot be empty');
  }

  if (keyLength <= 0 || keyLength > 255) {
    throw new Error('Key length must be between 1 and 255 bytes');
  }

  const derivedKey = await hkdfAsync('sha256', masterKey, salt, info, keyLength);
  return Buffer.from(derivedKey);
}
/**
 * Encrypts data using AES-256-GCM
 * @param plaintext Data to encrypt
 * @param key Encryption key (32 bytes for AES-256)
 * @param additionalData Optional additional authenticated data
 * @returns Encryption result containing ciphertext, IV, and authentication tag
 */
export function encryptAES256GCM(
  plaintext: Buffer,
  key: Buffer,
  additionalData?: Buffer
): EncryptionResult {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes for AES-256');
  }

  if (plaintext.length === 0) {
    throw new Error('Plaintext cannot be empty');
  }

  // Generate random IV (12 bytes is recommended for GCM)
  const iv = generateSecureRandom(12);

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  // Set additional authenticated data if provided
  if (additionalData && additionalData.length > 0) {
    cipher.setAAD(additionalData);
  }

  // Encrypt the data
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  // Get the authentication tag
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    tag,
  };
}

/**
 * Decrypts data using AES-256-GCM
 * @param input Decryption input containing ciphertext, IV, tag, and key
 * @param additionalData Optional additional authenticated data
 * @returns Decrypted plaintext
 */
export function decryptAES256GCM(input: DecryptionInput, additionalData?: Buffer): Buffer {
  const { ciphertext, iv, tag, key } = input;

  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes for AES-256');
  }

  if (iv.length !== 12) {
    throw new Error('IV must be 12 bytes for GCM mode');
  }

  if (tag.length !== 16) {
    throw new Error('Authentication tag must be 16 bytes');
  }

  if (ciphertext.length === 0) {
    throw new Error('Ciphertext cannot be empty');
  }

  // Create decipher
  const decipher = createDecipheriv('aes-256-gcm', key, iv);

  // Set the authentication tag
  decipher.setAuthTag(tag);

  // Set additional authenticated data if provided
  if (additionalData && additionalData.length > 0) {
    decipher.setAAD(additionalData);
  }

  try {
    // Decrypt the data
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plaintext;
  } catch (error) {
    throw new Error('Decryption failed: Authentication verification failed');
  }
}
/**
 * Encrypts a message with automatic key derivation
 * @param plaintext Message to encrypt
 * @param masterKey Master key for derivation
 * @param context Context information for key derivation
 * @returns Encryption result with salt included
 */
export async function encryptMessage(
  plaintext: Buffer,
  masterKey: Buffer,
  context: string = 'message'
): Promise<EncryptionResult> {
  // Generate salt for key derivation
  const salt = generateSecureRandom(32);

  // Derive session key using HKDF
  const sessionKey = await deriveKey(masterKey, {
    salt,
    info: Buffer.from(`SeraphC2-${context}`),
    keyLength: 32,
  });

  // Encrypt with derived key
  const result = encryptAES256GCM(plaintext, sessionKey);

  // Include salt in result for key derivation during decryption
  return {
    ...result,
    salt,
  };
}

/**
 * Decrypts a message with automatic key derivation
 * @param encryptedData Encrypted data with salt
 * @param masterKey Master key for derivation
 * @param context Context information for key derivation
 * @returns Decrypted plaintext
 */
export async function decryptMessage(
  encryptedData: EncryptionResult,
  masterKey: Buffer,
  context: string = 'message'
): Promise<Buffer> {
  if (!encryptedData.salt) {
    throw new Error('Salt is required for message decryption');
  }

  // Derive the same session key using provided salt
  const sessionKey = await deriveKey(masterKey, {
    salt: encryptedData.salt,
    info: Buffer.from(`SeraphC2-${context}`),
    keyLength: 32,
  });

  // Decrypt with derived key
  return decryptAES256GCM({
    ciphertext: encryptedData.ciphertext,
    iv: encryptedData.iv,
    tag: encryptedData.tag,
    key: sessionKey,
  });
}

/**
 * Verifies message integrity using authentication tag
 * @param encryptedData Encrypted data with authentication tag
 * @param key Encryption key used
 * @param additionalData Optional additional authenticated data
 * @returns True if integrity is verified, false otherwise
 */
export function verifyMessageIntegrity(
  encryptedData: EncryptionResult,
  key: Buffer,
  additionalData?: Buffer
): boolean {
  try {
    decryptAES256GCM(
      {
        ciphertext: encryptedData.ciphertext,
        iv: encryptedData.iv,
        tag: encryptedData.tag,
        key,
      },
      additionalData
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a session key pair for bidirectional communication
 * @param masterKey Master key for derivation
 * @param sessionId Unique session identifier
 * @returns Object containing client and server keys
 */
export async function generateSessionKeys(
  masterKey: Buffer,
  sessionId: string
): Promise<{ clientKey: Buffer; serverKey: Buffer }> {
  // Use sessionId to generate deterministic salt
  const sessionBuffer = Buffer.from(sessionId, 'utf8');
  const salt = Buffer.alloc(32);
  sessionBuffer.copy(salt, 0, 0, Math.min(sessionBuffer.length, 32));

  const clientKey = await deriveKey(masterKey, {
    salt,
    info: Buffer.from(`SeraphC2-client-${sessionId}`),
    keyLength: 32,
  });

  const serverKey = await deriveKey(masterKey, {
    salt,
    info: Buffer.from(`SeraphC2-server-${sessionId}`),
    keyLength: 32,
  });

  return { clientKey, serverKey };
}
