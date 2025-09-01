import { generateEncryptionKey, deriveKey, generateSecureRandom } from './crypto.utils';

/**
 * Key management utilities for SeraphC2
 * Handles key generation, rotation, and storage
 */

export interface KeyMetadata {
  id: string;
  created: Date;
  lastUsed?: Date;
  rotationInterval?: number; // in milliseconds
  context: string;
}

export interface ManagedKey {
  key: Buffer;
  metadata: KeyMetadata;
}

export class KeyManager {
  private keys: Map<string, ManagedKey> = new Map();
  private masterKey: Buffer;

  constructor(masterKey?: Buffer) {
    this.masterKey = masterKey || generateEncryptionKey(32);
  }

  /**
   * Generates a new key with metadata
   * @param keyId Unique identifier for the key
   * @param context Context for key usage
   * @param rotationInterval Optional rotation interval in milliseconds
   * @returns Generated key
   */
  generateKey(keyId: string, context: string, rotationInterval?: number): Buffer {
    if (this.keys.has(keyId)) {
      throw new Error(`Key with ID ${keyId} already exists`);
    }

    const key = generateEncryptionKey(32);
    const metadata: KeyMetadata = {
      id: keyId,
      created: new Date(),
      context,
      ...(rotationInterval !== undefined && { rotationInterval }),
    };

    this.keys.set(keyId, { key, metadata });
    return key;
  }

  /**
   * Derives a key from the master key
   * @param keyId Unique identifier for the derived key
   * @param context Context for key derivation
   * @param salt Optional salt (generated if not provided)
   * @returns Promise resolving to derived key
   */
  async deriveKeyFromMaster(keyId: string, context: string, salt?: Buffer): Promise<Buffer> {
    if (this.keys.has(keyId)) {
      throw new Error(`Key with ID ${keyId} already exists`);
    }

    const derivedKey = await deriveKey(this.masterKey, {
      salt: salt || generateSecureRandom(32),
      info: Buffer.from(`SeraphC2-${context}-${keyId}`),
      keyLength: 32,
    });

    const metadata: KeyMetadata = {
      id: keyId,
      created: new Date(),
      context,
    };

    this.keys.set(keyId, { key: derivedKey, metadata });
    return derivedKey;
  }

  /**
   * Retrieves a key by ID
   * @param keyId Key identifier
   * @returns Key buffer or undefined if not found
   */
  getKey(keyId: string): Buffer | undefined {
    const managedKey = this.keys.get(keyId);
    if (managedKey) {
      managedKey.metadata.lastUsed = new Date();
      return managedKey.key;
    }
    return undefined;
  }

  /**
   * Rotates a key (generates new key with same ID)
   * @param keyId Key identifier to rotate
   * @returns New key buffer
   */
  rotateKey(keyId: string): Buffer {
    const existingKey = this.keys.get(keyId);
    if (!existingKey) {
      throw new Error(`Key with ID ${keyId} not found`);
    }

    const newKey = generateEncryptionKey(32);
    const newMetadata: KeyMetadata = {
      id: existingKey.metadata.id,
      created: new Date(),
      context: existingKey.metadata.context,
      ...(existingKey.metadata.rotationInterval !== undefined && {
        rotationInterval: existingKey.metadata.rotationInterval,
      }),
    };

    this.keys.set(keyId, { key: newKey, metadata: newMetadata });
    return newKey;
  }

  /**
   * Checks if a key needs rotation based on its rotation interval
   * @param keyId Key identifier
   * @returns True if key needs rotation
   */
  needsRotation(keyId: string): boolean {
    const managedKey = this.keys.get(keyId);
    if (!managedKey || !managedKey.metadata.rotationInterval) {
      return false;
    }

    const now = new Date().getTime();
    const keyAge = now - managedKey.metadata.created.getTime();
    return keyAge >= managedKey.metadata.rotationInterval;
  }

  /**
   * Removes a key from the manager
   * @param keyId Key identifier to remove
   * @returns True if key was removed, false if not found
   */
  removeKey(keyId: string): boolean {
    return this.keys.delete(keyId);
  }

  /**
   * Lists all key metadata (without the actual keys)
   * @returns Array of key metadata
   */
  listKeys(): KeyMetadata[] {
    return Array.from(this.keys.values()).map(mk => mk.metadata);
  }

  /**
   * Clears all keys from the manager
   */
  clearAllKeys(): void {
    this.keys.clear();
  }

  /**
   * Gets the master key (use with caution)
   * @returns Master key buffer
   */
  getMasterKey(): Buffer {
    return this.masterKey;
  }

  /**
   * Sets a new master key
   * @param newMasterKey New master key
   */
  setMasterKey(newMasterKey: Buffer): void {
    if (newMasterKey.length !== 32) {
      throw new Error('Master key must be 32 bytes');
    }
    this.masterKey = newMasterKey;
  }

  /**
   * Export all keys for backup
   */
  exportKeys(): any {
    const exportData: any = {
      masterKey: this.masterKey.toString('hex'),
      keys: {},
    };

    for (const [keyId, managedKey] of this.keys.entries()) {
      exportData.keys[keyId] = {
        key: managedKey.key.toString('hex'),
        metadata: managedKey.metadata,
      };
    }

    return exportData;
  }

  /**
   * Import keys from backup
   */
  importKeys(keyData: any): void {
    if (keyData.masterKey) {
      this.masterKey = Buffer.from(keyData.masterKey, 'hex');
    }

    if (keyData.keys) {
      this.keys.clear();
      for (const [keyId, keyInfo] of Object.entries(keyData.keys)) {
        const managedKey: ManagedKey = {
          key: Buffer.from((keyInfo as any).key, 'hex'),
          metadata: (keyInfo as any).metadata,
        };
        this.keys.set(keyId, managedKey);
      }
    }
  }
}
