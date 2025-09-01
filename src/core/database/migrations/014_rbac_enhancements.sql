-- Migration: RBAC Enhancements
-- Description: Add tables and enhancements for Role-Based Access Control

-- Create audit log table for tracking operator actions
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create operator sessions table for tracking active sessions
CREATE TABLE IF NOT EXISTS operator_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create role permissions table for custom role definitions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL CHECK (role IN ('read_only', 'operator', 'administrator')),
    resource_type VARCHAR(50) NOT NULL,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    conditions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role, resource_type)
);

-- Create operator permissions table for individual operator permissions
CREATE TABLE IF NOT EXISTS operator_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL,
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    conditions JSONB DEFAULT '[]'::jsonb,
    granted_by UUID REFERENCES operators(id) ON DELETE SET NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(operator_id, resource_type)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator_id ON audit_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_operator_id ON operator_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_token ON operator_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_active ON operator_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_operator_sessions_expires_at ON operator_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_resource_type ON role_permissions(resource_type);

CREATE INDEX IF NOT EXISTS idx_operator_permissions_operator_id ON operator_permissions(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_permissions_resource_type ON operator_permissions(resource_type);
CREATE INDEX IF NOT EXISTS idx_operator_permissions_active ON operator_permissions(is_active);
CREATE INDEX IF NOT EXISTS idx_operator_permissions_expires_at ON operator_permissions(expires_at);

-- Update triggers for updated_at columns
CREATE TRIGGER update_role_permissions_updated_at 
    BEFORE UPDATE ON role_permissions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operator_permissions_updated_at 
    BEFORE UPDATE ON operator_permissions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for operator sessions last_activity
CREATE OR REPLACE FUNCTION update_session_last_activity()
RETURNS TRIGGER AS $
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$ language 'plpgsql';

CREATE TRIGGER update_operator_sessions_activity 
    BEFORE UPDATE ON operator_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_session_last_activity();

-- Insert default role permissions
INSERT INTO role_permissions (role, resource_type, actions) VALUES
-- Read-Only permissions
('read_only', 'implant', '["read", "view"]'),
('read_only', 'command', '["read", "view"]'),
('read_only', 'file', '["read", "view", "download"]'),
('read_only', 'process', '["read", "view"]'),
('read_only', 'service', '["read", "view"]'),
('read_only', 'screen', '["read", "view"]'),
('read_only', 'powershell', '["read", "view"]'),
('read_only', 'audit', '["read", "view"]'),

-- Operator permissions
('operator', 'implant', '["read", "view", "update"]'),
('operator', 'command', '["create", "read", "view", "execute", "delete"]'),
('operator', 'file', '["create", "read", "view", "update", "delete", "upload", "download"]'),
('operator', 'process', '["read", "view", "manage"]'),
('operator', 'service', '["read", "view", "manage"]'),
('operator', 'screen', '["read", "view", "control"]'),
('operator', 'remote_desktop', '["read", "view", "control"]'),
('operator', 'powershell', '["create", "read", "view", "execute", "update", "delete"]'),
('operator', 'audit', '["read", "view"]'),

-- Administrator permissions
('administrator', 'implant', '["create", "read", "view", "update", "delete", "manage"]'),
('administrator', 'command', '["create", "read", "view", "execute", "update", "delete", "manage"]'),
('administrator', 'file', '["create", "read", "view", "update", "delete", "upload", "download", "manage"]'),
('administrator', 'process', '["read", "view", "manage"]'),
('administrator', 'service', '["read", "view", "manage"]'),
('administrator', 'screen', '["read", "view", "control", "manage"]'),
('administrator', 'remote_desktop', '["read", "view", "control", "manage"]'),
('administrator', 'powershell', '["create", "read", "view", "execute", "update", "delete", "manage"]'),
('administrator', 'operator', '["create", "read", "view", "update", "delete", "manage"]'),
('administrator', 'system', '["create", "read", "view", "update", "delete", "manage"]'),
('administrator', 'audit', '["read", "view", "manage"]')
ON CONFLICT (role, resource_type) DO NOTHING;