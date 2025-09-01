import { KeyManager } from '../../../src/core/crypto/key-manager';
import { generateEncryptionKey } from '../../../src/core/crypto/crypto.utils';

describe('KeyManager', () => {
  let keyManager: KeyManager;
  const testMasterKey = generateEncryptionKey(32);

  beforeEach(() => {
    keyManager = new KeyManager(testMasterKey);
  });

  describe('constructor', () => {
    it('should create instance with provided master key', () => {
      const manager = new KeyManager(testMasterKey);
      expect(manager.getMasterKey().equals(testMasterKey)).toBe(true);
    });

    it('should generate master key if not provided', () => {
      const manager = new KeyManager();
      expect(manager.getMasterKey()).toBeInstanceOf(Buffer);
      expect(manager.getMasterKey().length).toBe(32);
    });
  });

  describe('generateKey', () => {
    it('should generate new key with metadata', () => {
      const keyId = 'test-key-1';
      const context = 'test-context';

      const key = keyManager.generateKey(keyId, context);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);

      const retrievedKey = keyManager.getKey(keyId);
      expect(retrievedKey?.equals(key)).toBe(true);
    });

    it('should throw error for duplicate key ID', () => {
      const keyId = 'duplicate-key';
      const context = 'test-context';

      keyManager.generateKey(keyId, context);

      expect(() => keyManager.generateKey(keyId, context)).toThrow(
        `Key with ID ${keyId} already exists`
      );
    });

    it('should store key with rotation interval', () => {
      const keyId = 'rotation-key';
      const context = 'test-context';
      const rotationInterval = 3600000; // 1 hour

      keyManager.generateKey(keyId, context, rotationInterval);

      const metadata = keyManager.listKeys().find(k => k.id === keyId);
      expect(metadata?.rotationInterval).toBe(rotationInterval);
    });
  });

  describe('deriveKeyFromMaster', () => {
    it('should derive key from master key', async () => {
      const keyId = 'derived-key-1';
      const context = 'test-context';

      const key = await keyManager.deriveKeyFromMaster(keyId, context);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);

      const retrievedKey = keyManager.getKey(keyId);
      expect(retrievedKey?.equals(key)).toBe(true);
    });

    it('should derive deterministic keys with same parameters', async () => {
      const keyId = 'test-key';
      const context = 'test-context';
      const salt = generateEncryptionKey(32);

      // Test that derivation is deterministic by using the crypto utils directly
      const { deriveKey } = await import('../../../src/core/crypto/crypto.utils');

      const derivedKey1 = await deriveKey(testMasterKey, {
        salt,
        info: Buffer.from(`SeraphC2-${context}-${keyId}`),
        keyLength: 32,
      });

      const derivedKey2 = await deriveKey(testMasterKey, {
        salt,
        info: Buffer.from(`SeraphC2-${context}-${keyId}`),
        keyLength: 32,
      });

      expect(derivedKey1.equals(derivedKey2)).toBe(true);

      // Now test through the key manager
      const testManager = new KeyManager(testMasterKey);
      const managerKey = await testManager.deriveKeyFromMaster(keyId, context, salt);

      expect(managerKey.equals(derivedKey1)).toBe(true);
    });

    it('should throw error for duplicate key ID', async () => {
      const keyId = 'duplicate-derived-key';
      const context = 'test-context';

      await keyManager.deriveKeyFromMaster(keyId, context);

      await expect(keyManager.deriveKeyFromMaster(keyId, context)).rejects.toThrow(
        `Key with ID ${keyId} already exists`
      );
    });
  });

  describe('getKey', () => {
    it('should retrieve existing key', () => {
      const keyId = 'test-key';
      const context = 'test-context';

      const originalKey = keyManager.generateKey(keyId, context);
      const retrievedKey = keyManager.getKey(keyId);

      expect(retrievedKey?.equals(originalKey)).toBe(true);
    });

    it('should return undefined for non-existent key', () => {
      const retrievedKey = keyManager.getKey('non-existent-key');
      expect(retrievedKey).toBeUndefined();
    });

    it('should update lastUsed timestamp', () => {
      const keyId = 'test-key';
      const context = 'test-context';

      keyManager.generateKey(keyId, context);

      const metadataBefore = keyManager.listKeys().find(k => k.id === keyId);
      expect(metadataBefore?.lastUsed).toBeUndefined();

      keyManager.getKey(keyId);

      const metadataAfter = keyManager.listKeys().find(k => k.id === keyId);
      expect(metadataAfter?.lastUsed).toBeInstanceOf(Date);
    });
  });

  describe('rotateKey', () => {
    it('should generate new key with same ID', () => {
      const keyId = 'rotation-test-key';
      const context = 'test-context';

      const originalKey = keyManager.generateKey(keyId, context);
      const rotatedKey = keyManager.rotateKey(keyId);

      expect(rotatedKey).toBeInstanceOf(Buffer);
      expect(rotatedKey.length).toBe(32);
      expect(rotatedKey.equals(originalKey)).toBe(false);

      const retrievedKey = keyManager.getKey(keyId);
      expect(retrievedKey?.equals(rotatedKey)).toBe(true);
    });

    it('should throw error for non-existent key', () => {
      expect(() => keyManager.rotateKey('non-existent-key')).toThrow(
        'Key with ID non-existent-key not found'
      );
    });

    it('should preserve metadata except timestamps', async () => {
      const keyId = 'rotation-test-key';
      const context = 'test-context';
      const rotationInterval = 3600000;

      keyManager.generateKey(keyId, context, rotationInterval);
      const originalMetadata = keyManager.listKeys().find(k => k.id === keyId);

      // Wait a small amount to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      keyManager.rotateKey(keyId);
      const newMetadata = keyManager.listKeys().find(k => k.id === keyId);

      expect(newMetadata?.id).toBe(originalMetadata?.id);
      expect(newMetadata?.context).toBe(originalMetadata?.context);
      expect(newMetadata?.rotationInterval).toBe(originalMetadata?.rotationInterval);
      expect(newMetadata?.created.getTime()).toBeGreaterThan(
        originalMetadata?.created.getTime() || 0
      );
      expect(newMetadata?.lastUsed).toBeUndefined();
    });
  });

  describe('needsRotation', () => {
    it('should return false for key without rotation interval', () => {
      const keyId = 'no-rotation-key';
      const context = 'test-context';

      keyManager.generateKey(keyId, context);

      expect(keyManager.needsRotation(keyId)).toBe(false);
    });

    it('should return false for non-existent key', () => {
      expect(keyManager.needsRotation('non-existent-key')).toBe(false);
    });

    it('should return false for recently created key', () => {
      const keyId = 'recent-key';
      const context = 'test-context';
      const rotationInterval = 3600000; // 1 hour

      keyManager.generateKey(keyId, context, rotationInterval);

      expect(keyManager.needsRotation(keyId)).toBe(false);
    });

    it('should return true for old key', () => {
      const keyId = 'old-key';
      const context = 'test-context';
      const rotationInterval = 1; // 1 millisecond

      keyManager.generateKey(keyId, context, rotationInterval);

      // Wait a bit to ensure the key is older than rotation interval
      return new Promise(resolve => {
        setTimeout(() => {
          expect(keyManager.needsRotation(keyId)).toBe(true);
          resolve(undefined);
        }, 10);
      });
    });
  });

  describe('removeKey', () => {
    it('should remove existing key', () => {
      const keyId = 'remove-test-key';
      const context = 'test-context';

      keyManager.generateKey(keyId, context);
      expect(keyManager.getKey(keyId)).toBeDefined();

      const removed = keyManager.removeKey(keyId);
      expect(removed).toBe(true);
      expect(keyManager.getKey(keyId)).toBeUndefined();
    });

    it('should return false for non-existent key', () => {
      const removed = keyManager.removeKey('non-existent-key');
      expect(removed).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('should return empty array for new manager', () => {
      const keys = keyManager.listKeys();
      expect(keys).toEqual([]);
    });

    it('should return metadata for all keys', () => {
      const keyId1 = 'key-1';
      const keyId2 = 'key-2';
      const context = 'test-context';

      keyManager.generateKey(keyId1, context);
      keyManager.generateKey(keyId2, context);

      const keys = keyManager.listKeys();
      expect(keys).toHaveLength(2);
      expect(keys.map(k => k.id)).toContain(keyId1);
      expect(keys.map(k => k.id)).toContain(keyId2);
    });

    it('should not expose actual key values', () => {
      const keyId = 'secure-key';
      const context = 'test-context';

      keyManager.generateKey(keyId, context);
      const keys = keyManager.listKeys();

      expect(keys[0]).not.toHaveProperty('key');
    });
  });

  describe('clearAllKeys', () => {
    it('should remove all keys', () => {
      keyManager.generateKey('key-1', 'context');
      keyManager.generateKey('key-2', 'context');

      expect(keyManager.listKeys()).toHaveLength(2);

      keyManager.clearAllKeys();

      expect(keyManager.listKeys()).toHaveLength(0);
      expect(keyManager.getKey('key-1')).toBeUndefined();
      expect(keyManager.getKey('key-2')).toBeUndefined();
    });
  });

  describe('setMasterKey', () => {
    it('should update master key', () => {
      const newMasterKey = generateEncryptionKey(32);

      keyManager.setMasterKey(newMasterKey);

      expect(keyManager.getMasterKey().equals(newMasterKey)).toBe(true);
    });

    it('should throw error for invalid key length', () => {
      const invalidKey = generateEncryptionKey(16);

      expect(() => keyManager.setMasterKey(invalidKey)).toThrow('Master key must be 32 bytes');
    });
  });
});
