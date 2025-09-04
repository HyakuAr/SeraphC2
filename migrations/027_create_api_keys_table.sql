-- Migration: Create API keys table for external integrations
-- Up migration

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    permissions JSONB NOT NULL DEFAULT '[]',
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_operator_id ON api_keys(operator_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at);

-- Add comments
COMMENT ON TABLE api_keys IS 'API keys for external integrations and programmatic access';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key for secure storage';
COMMENT ON COLUMN api_keys.permissions IS 'JSON array of permissions granted to this API key';
COMMENT ON COLUMN api_keys.last_used IS 'Timestamp of last API key usage';
COMMENT ON COLUMN api_keys.expires_at IS 'Optional expiration timestamp for the API key';

-- Down migration (for rollback)
-- DROP TABLE IF EXISTS api_keys;