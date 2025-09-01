/**
 * CryptoService - High-level cryptographic service for SeraphC2
 * Provides encryption, decryption, and hashing functionality
 */

import {
  encryptAES256GCM,
  decryptAES256GCM,
  generateSecureRandom,
  EncryptionResult,
} from './crypto.utils';
import { KeyManager } from './key-manager';
import { createHash } from 'crypto';

export class CryptoService {
  /**
   * Generate a secure random token
   */
  static generateToken(length: number = 32): string {
    return generateSecureRandom(length).toString('hex');
  }
  private keyManager: KeyManager;

  constructor() {
    this.keyManager = new KeyManager();
  }

  /**
   * Encrypt data for specific implant
   */
  encrypt(data: string, implantId: string): string {
    try {
      // Get or generate key for implant
      let key = this.keyManager.getKey(implantId);
      if (!key) {
        key = this.keyManager.generateKey(implantId, 'message_encryption');
      }

      // Use synchronous AES-256-GCM encryption for simplicity in protocol handlers
      const result = this.encryptSync(Buffer.from(data, 'utf8'), key);
      return JSON.stringify(result);
    } catch (error) {
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decrypt data for specific implant
   */
  decrypt(encryptedData: string, implantId: string): string {
    try {
      const key = this.keyManager.getKey(implantId);
      if (!key) {
        throw new Error(`No encryption key found for implant: ${implantId}`);
      }

      const encryptionResult = JSON.parse(encryptedData);
      const decryptedBuffer = this.decryptSync(encryptionResult, key);
      return decryptedBuffer.toString('utf8');
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Encrypt buffer data (for backup service)
   */
  encryptBuffer(data: Buffer): Buffer {
    const key = generateSecureRandom(32);
    const result = this.encryptSync(data, key);

    // Prepend key to encrypted data (in real implementation, key should be stored separately)
    const combined = Buffer.concat([key, Buffer.from(JSON.stringify(result))]);

    return combined;
  }

  /**
   * Decrypt buffer data (for backup service)
   */
  decryptBuffer(encryptedData: Buffer): Buffer {
    // Extract key and encrypted data
    const key = encryptedData.slice(0, 32);
    const encryptedJson = encryptedData.slice(32).toString();
    const encryptionResult = JSON.parse(encryptedJson);

    return this.decryptSync(encryptionResult, key);
  }

  /**
   * Generate hash of data
   */
  hash(data: string | Buffer, algorithm: string = 'sha256'): string {
    return createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate secure random bytes
   */
  generateRandom(length: number): Buffer {
    return generateSecureRandom(length);
  }

  /**
   * Generate new encryption key for implant
   */
  generateImplantKey(implantId: string): string {
    this.keyManager.generateKey(implantId, 'message_encryption');
    return implantId;
  }

  /**
   * Remove key for implant
   */
  removeImplantKey(implantId: string): boolean {
    return this.keyManager.removeKey(implantId);
  }

  /**
   * Check if key exists for implant
   */
  hasImplantKey(implantId: string): boolean {
    return this.keyManager.getKey(implantId) !== undefined;
  }

  /**
   * Synchronous encryption using AES-256-GCM
   */
  private encryptSync(plaintext: Buffer, key: Buffer): EncryptionResult {
    return encryptAES256GCM(plaintext, key);
  }

  /**
   * Synchronous decryption using AES-256-GCM
   */
  private decryptSync(encryptionResult: EncryptionResult, key: Buffer): Buffer {
    return decryptAES256GCM({
      ciphertext: encryptionResult.ciphertext,
      iv: encryptionResult.iv,
      tag: encryptionResult.tag,
      key,
    });
  }

  /**
   * Generate a new encryption key
   */
  async generateKey(): Promise<string> {
    const key = generateSecureRandom(32); // 256-bit key
    return key.toString('hex');
  }

  /**
   * Clear all encryption keys (for emergency shutdown)
   */
  async clearAllKeys(): Promise<void> {
    this.keyManager.clearAllKeys();
  }

  /**
   * Export all keys for backup
   */
  async exportKeys(): Promise<any> {
    return this.keyManager.exportKeys();
  }

  /**
   * Import keys from backup
   */
  async importKeys(keyData: any): Promise<void> {
    this.keyManager.importKeys(keyData);
  }
}
