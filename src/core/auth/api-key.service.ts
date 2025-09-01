/**
 * API Key authentication service for external integrations
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  permissions: string[];
  operatorId: string;
  isActive: boolean;
  lastUsed?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions: string[];
  operatorId: string;
  expiresAt?: Date;
}

export interface ApiKeyWithPlaintext extends Omit<ApiKey, 'keyHash'> {
  key: string;
}

export class ApiKeyService {
  constructor(private pool: Pool) {}

  /**
   * Generate a new API key
   */
  async generateApiKey(request: CreateApiKeyRequest): Promise<ApiKeyWithPlaintext> {
    // Generate a secure random API key
    const keyBytes = randomBytes(32);
    const key = `sk_${keyBytes.toString('hex')}`;
    const keyHash = this.hashApiKey(key);

    const query = `
      INSERT INTO api_keys (name, key_hash, permissions, operator_id, expires_at, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      RETURNING id, name, permissions, operator_id, is_active, expires_at, created_at, updated_at
    `;

    const values = [
      request.name,
      keyHash,
      JSON.stringify(request.permissions),
      request.operatorId,
      request.expiresAt,
    ];

    const result = await this.pool.query(query, values);
    const apiKey = result.rows[0];

    return {
      id: apiKey.id,
      name: apiKey.name,
      key, // Return the plaintext key only once
      permissions: JSON.parse(apiKey.permissions),
      operatorId: apiKey.operator_id,
      isActive: apiKey.is_active,
      expiresAt: apiKey.expires_at,
      createdAt: apiKey.created_at,
      updatedAt: apiKey.updated_at,
    };
  }

  /**
   * Validate an API key and return associated information
   */
  async validateApiKey(key: string): Promise<ApiKey | null> {
    if (!key || !key.startsWith('sk_')) {
      return null;
    }

    const keyHash = this.hashApiKey(key);

    const query = `
      SELECT id, name, key_hash, permissions, operator_id, is_active, last_used, expires_at, created_at, updated_at
      FROM api_keys
      WHERE key_hash = $1 AND is_active = true
    `;

    const result = await this.pool.query(query, [keyHash]);

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = result.rows[0];

    // Check if key is expired
    if (apiKey.expires_at && new Date() > new Date(apiKey.expires_at)) {
      return null;
    }

    // Verify hash using timing-safe comparison
    const storedHash = Buffer.from(apiKey.key_hash, 'hex');
    const providedHash = Buffer.from(keyHash, 'hex');

    if (storedHash.length !== providedHash.length || !timingSafeEqual(storedHash, providedHash)) {
      return null;
    }

    // Update last used timestamp
    await this.updateLastUsed(apiKey.id);

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyHash: apiKey.key_hash,
      permissions: JSON.parse(apiKey.permissions),
      operatorId: apiKey.operator_id,
      isActive: apiKey.is_active,
      lastUsed: apiKey.last_used,
      expiresAt: apiKey.expires_at,
      createdAt: apiKey.created_at,
      updatedAt: apiKey.updated_at,
    };
  }

  /**
   * List API keys for an operator
   */
  async listApiKeys(operatorId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const query = `
      SELECT id, name, permissions, operator_id, is_active, last_used, expires_at, created_at, updated_at
      FROM api_keys
      WHERE operator_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [operatorId]);

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      permissions: JSON.parse(row.permissions),
      operatorId: row.operator_id,
      isActive: row.is_active,
      lastUsed: row.last_used,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string, operatorId: string): Promise<boolean> {
    const query = `
      UPDATE api_keys
      SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND operator_id = $2
    `;

    const result = await this.pool.query(query, [keyId, operatorId]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Update API key permissions
   */
  async updateApiKeyPermissions(
    keyId: string,
    permissions: string[],
    operatorId: string
  ): Promise<boolean> {
    const query = `
      UPDATE api_keys
      SET permissions = $1, updated_at = NOW()
      WHERE id = $1 AND operator_id = $3
    `;

    const result = await this.pool.query(query, [JSON.stringify(permissions), keyId, operatorId]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Check if API key has specific permission
   */
  hasPermission(apiKey: ApiKey, permission: string): boolean {
    return apiKey.permissions.includes(permission) || apiKey.permissions.includes('*');
  }

  /**
   * Hash an API key for secure storage
   */
  private hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Update last used timestamp for an API key
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    const query = `
      UPDATE api_keys
      SET last_used = NOW()
      WHERE id = $1
    `;

    await this.pool.query(query, [keyId]);
  }
}
