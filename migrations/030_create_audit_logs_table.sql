-- Migration: Create audit logs table
-- Up migration

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator_id ON audit_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success);
CREATE INDEX IF NOT EXISTS idx_audit_logs_composite ON audit_logs(operator_id, created_at, success);

-- Create partial index for failed operations
CREATE INDEX IF NOT EXISTS idx_audit_logs_failures ON audit_logs(created_at, action, resource_type) WHERE success = false;

-- Create GIN index for JSONB details column for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING GIN(details);

-- Down migration (for rollback)
-- DROP INDEX IF EXISTS idx_audit_logs_details_gin;
-- DROP INDEX IF EXISTS idx_audit_logs_failures;
-- DROP INDEX IF EXISTS idx_audit_logs_composite;
-- DROP INDEX IF EXISTS idx_audit_logs_success;
-- DROP INDEX IF EXISTS idx_audit_logs_created_at;
-- DROP INDEX IF EXISTS idx_audit_logs_resource_type;
-- DROP INDEX IF EXISTS idx_audit_logs_action;
-- DROP INDEX IF EXISTS idx_audit_logs_operator_id;
-- DROP TABLE IF EXISTS audit_logs;