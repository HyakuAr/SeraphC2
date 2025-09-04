-- Migration: Add additional audit logs indexes
-- Up migration

-- Create additional indexes for performance (table already exists from migration 014)
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