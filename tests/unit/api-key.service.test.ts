/**
 * Unit tests for API Key Service
 */

import { Pool } from 'pg';
import { ApiKeyService } from '../../src/core/auth/api-key.service';

// Mock pg Pool
const mockPool = {
  query: jest.fn(),
} as unknown as Pool;

describe('ApiKeyService', () => {
  let apiKeyService: ApiKeyService;

  beforeEach(() => {
    apiKeyService = new ApiKeyService(mockPool);
    jest.clearAllMocks();
  });

  describe('generateApiKey', () => {
    it('should generate a new API key', async () => {
      const mockResult = {
        rows: [
          {
            id: 'test-id',
            name: 'Test Key',
            permissions: '["implants:read"]',
            operator_id: 'operator-id',
            is_active: true,
            expires_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.generateApiKey({
        name: 'Test Key',
        permissions: ['implants:read'],
        operatorId: 'operator-id',
      });

      expect(result).toMatchObject({
        id: 'test-id',
        name: 'Test Key',
        permissions: ['implants:read'],
        operatorId: 'operator-id',
        isActive: true,
      });

      expect(result.key).toMatch(/^sk_[a-f0-9]{64}$/);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining(['Test Key', expect.any(String), '["implants:read"]', 'operator-id'])
      );
    });

    it('should handle expiration date', async () => {
      const expiresAt = new Date('2024-12-31');
      const mockResult = {
        rows: [
          {
            id: 'test-id',
            name: 'Test Key',
            permissions: '["implants:read"]',
            operator_id: 'operator-id',
            is_active: true,
            expires_at: expiresAt,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.generateApiKey({
        name: 'Test Key',
        permissions: ['implants:read'],
        operatorId: 'operator-id',
        expiresAt,
      });

      expect(result.expiresAt).toEqual(expiresAt);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid API key', async () => {
      const testKey = 'sk_' + 'a'.repeat(64);
      const testKeyHash = require('crypto').createHash('sha256').update(testKey).digest('hex');

      const mockResult = {
        rows: [
          {
            id: 'test-id',
            name: 'Test Key',
            key_hash: testKeyHash,
            permissions: '["implants:read"]',
            operator_id: 'operator-id',
            is_active: true,
            last_used: null,
            expires_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };

      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce(mockResult) // First call for validation
        .mockResolvedValueOnce({ rows: [] }); // Second call for updating last_used

      const result = await apiKeyService.validateApiKey(testKey);

      expect(result).toMatchObject({
        id: 'test-id',
        name: 'Test Key',
        permissions: ['implants:read'],
        operatorId: 'operator-id',
        isActive: true,
      });
    });

    it('should reject invalid API key format', async () => {
      const result = await apiKeyService.validateApiKey('invalid-key');
      expect(result).toBeNull();
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should reject expired API key', async () => {
      const expiredDate = new Date('2020-01-01');
      const mockResult = {
        rows: [
          {
            id: 'test-id',
            name: 'Test Key',
            key_hash: 'hash-value',
            permissions: '["implants:read"]',
            operator_id: 'operator-id',
            is_active: true,
            last_used: null,
            expires_at: expiredDate,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.validateApiKey('sk_' + 'a'.repeat(64));
      expect(result).toBeNull();
    });

    it('should reject inactive API key', async () => {
      const mockResult = {
        rows: [
          {
            id: 'test-id',
            name: 'Test Key',
            key_hash: 'hash-value',
            permissions: '["implants:read"]',
            operator_id: 'operator-id',
            is_active: false,
            last_used: null,
            expires_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.validateApiKey('sk_' + 'a'.repeat(64));
      expect(result).toBeNull();
    });
  });

  describe('listApiKeys', () => {
    it('should list API keys for an operator', async () => {
      const mockResult = {
        rows: [
          {
            id: 'key-1',
            name: 'Key 1',
            permissions: '["implants:read"]',
            operator_id: 'operator-id',
            is_active: true,
            last_used: null,
            expires_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'key-2',
            name: 'Key 2',
            permissions: '["commands:execute"]',
            operator_id: 'operator-id',
            is_active: false,
            last_used: new Date(),
            expires_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.listApiKeys('operator-id');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'key-1',
        name: 'Key 1',
        permissions: ['implants:read'],
        isActive: true,
      });
      expect(result[1]).toMatchObject({
        id: 'key-2',
        name: 'Key 2',
        permissions: ['commands:execute'],
        isActive: false,
      });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [
        'operator-id',
      ]);
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an API key', async () => {
      const mockResult = { rowCount: 1 };
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.revokeApiKey('key-id', 'operator-id');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE api_keys'), [
        'key-id',
        'operator-id',
      ]);
    });

    it('should return false if API key not found', async () => {
      const mockResult = { rowCount: 0 };
      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await apiKeyService.revokeApiKey('non-existent-key', 'operator-id');

      expect(result).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should check specific permission', () => {
      const apiKey = {
        id: 'test-id',
        name: 'Test Key',
        keyHash: 'hash',
        permissions: ['implants:read', 'commands:execute'],
        operatorId: 'operator-id',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(apiKeyService.hasPermission(apiKey, 'implants:read')).toBe(true);
      expect(apiKeyService.hasPermission(apiKey, 'files:write')).toBe(false);
    });

    it('should allow wildcard permission', () => {
      const apiKey = {
        id: 'test-id',
        name: 'Test Key',
        keyHash: 'hash',
        permissions: ['*'],
        operatorId: 'operator-id',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(apiKeyService.hasPermission(apiKey, 'implants:read')).toBe(true);
      expect(apiKeyService.hasPermission(apiKey, 'any:permission')).toBe(true);
    });
  });
});
