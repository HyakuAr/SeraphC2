import {
  generateSecureRandom,
  generateEncryptionKey,
  deriveKey,
  encryptAES256GCM,
  decryptAES256GCM,
  encryptMessage,
  decryptMessage,
  verifyMessageIntegrity,
  generateSessionKeys,
} from '../../../src/core/crypto/crypto.utils';

describe('Crypto Utils', () => {
  describe('generateSecureRandom', () => {
    it('should generate random bytes of specified length', () => {
      const length = 32;
      const randomBytes = generateSecureRandom(length);

      expect(randomBytes).toBeInstanceOf(Buffer);
      expect(randomBytes.length).toBe(length);
    });

    it('should generate different values on subsequent calls', () => {
      const bytes1 = generateSecureRandom(16);
      const bytes2 = generateSecureRandom(16);

      expect(bytes1.equals(bytes2)).toBe(false);
    });

    it('should throw error for invalid length', () => {
      expect(() => generateSecureRandom(0)).toThrow('Length must be positive');
      expect(() => generateSecureRandom(-1)).toThrow('Length must be positive');
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate 32-byte key by default', () => {
      const key = generateEncryptionKey();

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should generate key of specified length', () => {
      const key = generateEncryptionKey(16);

      expect(key.length).toBe(16);
    });

    it('should generate different keys on subsequent calls', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('deriveKey', () => {
    const masterKey = Buffer.from('test-master-key-32-bytes-long!!');

    it('should derive key using HKDF', async () => {
      const derivedKey = await deriveKey(masterKey);

      expect(derivedKey).toBeInstanceOf(Buffer);
      expect(derivedKey.length).toBe(32);
    });

    it('should derive different keys with different salts', async () => {
      const salt1 = generateSecureRandom(32);
      const salt2 = generateSecureRandom(32);

      const key1 = await deriveKey(masterKey, { salt: salt1 });
      const key2 = await deriveKey(masterKey, { salt: salt2 });

      expect(key1.equals(key2)).toBe(false);
    });

    it('should derive same key with same parameters', async () => {
      const salt = generateSecureRandom(32);
      const info = Buffer.from('test-info');

      const key1 = await deriveKey(masterKey, { salt, info });
      const key2 = await deriveKey(masterKey, { salt, info });

      expect(key1.equals(key2)).toBe(true);
    });

    it('should respect custom key length', async () => {
      const derivedKey = await deriveKey(masterKey, { keyLength: 16 });

      expect(derivedKey.length).toBe(16);
    });

    it('should throw error for empty master key', async () => {
      await expect(deriveKey(Buffer.alloc(0))).rejects.toThrow('Master key cannot be empty');
    });

    it('should throw error for invalid key length', async () => {
      await expect(deriveKey(masterKey, { keyLength: 0 })).rejects.toThrow(
        'Key length must be between 1 and 255 bytes'
      );
      await expect(deriveKey(masterKey, { keyLength: 256 })).rejects.toThrow(
        'Key length must be between 1 and 255 bytes'
      );
    });
  });
  describe('encryptAES256GCM', () => {
    const key = generateEncryptionKey(32);
    const plaintext = Buffer.from('Hello, SeraphC2!');

    it('should encrypt data successfully', () => {
      const result = encryptAES256GCM(plaintext, key);

      expect(result.ciphertext).toBeInstanceOf(Buffer);
      expect(result.iv).toBeInstanceOf(Buffer);
      expect(result.tag).toBeInstanceOf(Buffer);
      expect(result.iv.length).toBe(12);
      expect(result.tag.length).toBe(16);
      expect(result.ciphertext.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertext with different IVs', () => {
      const result1 = encryptAES256GCM(plaintext, key);
      const result2 = encryptAES256GCM(plaintext, key);

      expect(result1.ciphertext.equals(result2.ciphertext)).toBe(false);
      expect(result1.iv.equals(result2.iv)).toBe(false);
    });

    it('should throw error for invalid key length', () => {
      const invalidKey = Buffer.alloc(16);

      expect(() => encryptAES256GCM(plaintext, invalidKey)).toThrow(
        'Key must be 32 bytes for AES-256'
      );
    });

    it('should throw error for empty plaintext', () => {
      const emptyPlaintext = Buffer.alloc(0);

      expect(() => encryptAES256GCM(emptyPlaintext, key)).toThrow('Plaintext cannot be empty');
    });

    it('should handle additional authenticated data', () => {
      const aad = Buffer.from('additional-data');
      const result = encryptAES256GCM(plaintext, key, aad);

      expect(result.ciphertext).toBeInstanceOf(Buffer);
      expect(result.iv).toBeInstanceOf(Buffer);
      expect(result.tag).toBeInstanceOf(Buffer);
    });
  });

  describe('decryptAES256GCM', () => {
    const key = generateEncryptionKey(32);
    const plaintext = Buffer.from('Hello, SeraphC2!');

    it('should decrypt data successfully', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const decrypted = decryptAES256GCM({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        key,
      });

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should handle additional authenticated data', () => {
      const aad = Buffer.from('additional-data');
      const encrypted = encryptAES256GCM(plaintext, key, aad);
      const decrypted = decryptAES256GCM(
        {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          key,
        },
        aad
      );

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('should throw error for invalid key length', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const invalidKey = Buffer.alloc(16);

      expect(() =>
        decryptAES256GCM({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          key: invalidKey,
        })
      ).toThrow('Key must be 32 bytes for AES-256');
    });

    it('should throw error for invalid IV length', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const invalidIv = Buffer.alloc(8);

      expect(() =>
        decryptAES256GCM({
          ciphertext: encrypted.ciphertext,
          iv: invalidIv,
          tag: encrypted.tag,
          key,
        })
      ).toThrow('IV must be 12 bytes for GCM mode');
    });

    it('should throw error for invalid tag length', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const invalidTag = Buffer.alloc(8);

      expect(() =>
        decryptAES256GCM({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: invalidTag,
          key,
        })
      ).toThrow('Authentication tag must be 16 bytes');
    });

    it('should throw error for empty ciphertext', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const emptyCiphertext = Buffer.alloc(0);

      expect(() =>
        decryptAES256GCM({
          ciphertext: emptyCiphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          key,
        })
      ).toThrow('Ciphertext cannot be empty');
    });

    it('should throw error for tampered ciphertext', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
      tamperedCiphertext[0] = tamperedCiphertext[0]! ^ 1; // Flip a bit

      expect(() =>
        decryptAES256GCM({
          ciphertext: tamperedCiphertext,
          iv: encrypted.iv,
          tag: encrypted.tag,
          key,
        })
      ).toThrow('Decryption failed: Authentication verification failed');
    });

    it('should throw error for tampered tag', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const tamperedTag = Buffer.from(encrypted.tag);
      tamperedTag[0] = tamperedTag[0]! ^ 1; // Flip a bit

      expect(() =>
        decryptAES256GCM({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          tag: tamperedTag,
          key,
        })
      ).toThrow('Decryption failed: Authentication verification failed');
    });
  });

  describe('encryptMessage and decryptMessage', () => {
    const masterKey = generateEncryptionKey(32);
    const message = Buffer.from('Secret message for SeraphC2');

    it('should encrypt and decrypt message successfully', async () => {
      const encrypted = await encryptMessage(message, masterKey);
      const decrypted = await decryptMessage(encrypted, masterKey);

      expect(decrypted.equals(message)).toBe(true);
    });

    it('should include salt in encrypted result', async () => {
      const encrypted = await encryptMessage(message, masterKey);

      expect(encrypted.salt).toBeInstanceOf(Buffer);
      expect(encrypted.salt!.length).toBe(32);
    });

    it('should use different salts for different encryptions', async () => {
      const encrypted1 = await encryptMessage(message, masterKey);
      const encrypted2 = await encryptMessage(message, masterKey);

      expect(encrypted1.salt!.equals(encrypted2.salt!)).toBe(false);
    });

    it('should use context in key derivation', async () => {
      const context1 = 'context1';
      const context2 = 'context2';

      const encrypted1 = await encryptMessage(message, masterKey, context1);
      const encrypted2 = await encryptMessage(message, masterKey, context2);

      // Same salt but different context should produce different ciphertext
      encrypted2.salt = encrypted1.salt!;

      await expect(decryptMessage(encrypted2, masterKey, context1)).rejects.toThrow();
    });

    it('should throw error when salt is missing for decryption', async () => {
      const encrypted = await encryptMessage(message, masterKey);
      delete encrypted.salt;

      await expect(decryptMessage(encrypted, masterKey)).rejects.toThrow(
        'Salt is required for message decryption'
      );
    });
  });

  describe('verifyMessageIntegrity', () => {
    const key = generateEncryptionKey(32);
    const plaintext = Buffer.from('Test message');

    it('should verify integrity of valid message', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const isValid = verifyMessageIntegrity(encrypted, key);

      expect(isValid).toBe(true);
    });

    it('should detect tampered message', () => {
      const encrypted = encryptAES256GCM(plaintext, key);
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
      tamperedCiphertext[0] = tamperedCiphertext[0]! ^ 1; // Flip a bit

      const tamperedEncrypted = {
        ...encrypted,
        ciphertext: tamperedCiphertext,
      };

      const isValid = verifyMessageIntegrity(tamperedEncrypted, key);
      expect(isValid).toBe(false);
    });

    it('should verify integrity with additional authenticated data', () => {
      const aad = Buffer.from('additional-data');
      const encrypted = encryptAES256GCM(plaintext, key, aad);
      const isValid = verifyMessageIntegrity(encrypted, key, aad);

      expect(isValid).toBe(true);
    });
  });

  describe('generateSessionKeys', () => {
    const masterKey = generateEncryptionKey(32);
    const sessionId = 'test-session-123';

    it('should generate different client and server keys', async () => {
      const keys = await generateSessionKeys(masterKey, sessionId);

      expect(keys.clientKey).toBeInstanceOf(Buffer);
      expect(keys.serverKey).toBeInstanceOf(Buffer);
      expect(keys.clientKey.length).toBe(32);
      expect(keys.serverKey.length).toBe(32);
      expect(keys.clientKey.equals(keys.serverKey)).toBe(false);
    });

    it('should generate same keys for same session ID', async () => {
      const keys1 = await generateSessionKeys(masterKey, sessionId);
      const keys2 = await generateSessionKeys(masterKey, sessionId);

      expect(keys1.clientKey.equals(keys2.clientKey)).toBe(true);
      expect(keys1.serverKey.equals(keys2.serverKey)).toBe(true);
    });

    it('should generate different keys for different session IDs', async () => {
      const keys1 = await generateSessionKeys(masterKey, 'session-1');
      const keys2 = await generateSessionKeys(masterKey, 'session-2');

      expect(keys1.clientKey.equals(keys2.clientKey)).toBe(false);
      expect(keys1.serverKey.equals(keys2.serverKey)).toBe(false);
    });
  });
});
