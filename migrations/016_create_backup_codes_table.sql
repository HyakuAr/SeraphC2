-- Migration: Create backup codes table for MFA
-- Description: Creates table to store backup codes for multi-factor authentication

-- Create backup_codes table
CREATE TABLE IF NOT EXISTS backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_backup_codes_operator_id ON backup_codes(operator_id);
CREATE INDEX IF NOT EXISTS idx_backup_codes_is_used ON backup_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_backup_codes_created_at ON backup_codes(created_at);

-- Add comment
COMMENT ON TABLE backup_codes IS 'Stores backup codes for multi-factor authentication recovery';
COMMENT ON COLUMN backup_codes.id IS 'Unique identifier for the backup code';
COMMENT ON COLUMN backup_codes.operator_id IS 'Reference to the operator who owns this backup code';
COMMENT ON COLUMN backup_codes.code_hash IS 'Bcrypt hash of the backup code';
COMMENT ON COLUMN backup_codes.is_used IS 'Whether this backup code has been used';
COMMENT ON COLUMN backup_codes.used_at IS 'Timestamp when the backup code was used';
COMMENT ON COLUMN backup_codes.created_at IS 'Timestamp when the backup code was created';