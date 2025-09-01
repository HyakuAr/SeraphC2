-- Migration: Create backup codes table for MFA
-- Description: Creates table to store backup codes for multi-factor authentication

-- Create backup_codes table
CREATE TABLE backup_codes (
    id VARCHAR(255) PRIMARY KEY,
    operator_id VARCHAR(255) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_backup_codes_operator
        FOREIGN KEY (operator_id) 
        REFERENCES operators(id) 
        ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_backup_codes_operator_id ON backup_codes(operator_id);
CREATE INDEX idx_backup_codes_is_used ON backup_codes(is_used);
CREATE INDEX idx_backup_codes_created_at ON backup_codes(created_at);

-- Add comment
COMMENT ON TABLE backup_codes IS 'Stores backup codes for multi-factor authentication recovery';
COMMENT ON COLUMN backup_codes.id IS 'Unique identifier for the backup code';
COMMENT ON COLUMN backup_codes.operator_id IS 'Reference to the operator who owns this backup code';
COMMENT ON COLUMN backup_codes.code_hash IS 'Bcrypt hash of the backup code';
COMMENT ON COLUMN backup_codes.is_used IS 'Whether this backup code has been used';
COMMENT ON COLUMN backup_codes.used_at IS 'Timestamp when the backup code was used';
COMMENT ON COLUMN backup_codes.created_at IS 'Timestamp when the backup code was created';