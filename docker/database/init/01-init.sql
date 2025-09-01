-- SeraphC2 Database Initialization Script
-- This script sets up the initial database structure

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS seraphc2;

-- Set default search path
ALTER DATABASE seraphc2 SET search_path TO seraphc2, public;

-- Create initial tables (basic structure for development)
-- Full schema will be created by migrations

-- Operators table
CREATE TABLE IF NOT EXISTS seraphc2.operators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'operator',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Implants table
CREATE TABLE IF NOT EXISTS seraphc2.implants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hostname VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    operating_system VARCHAR(255) NOT NULL,
    architecture VARCHAR(50) NOT NULL,
    privileges VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    communication_protocol VARCHAR(50) NOT NULL,
    encryption_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE
);

-- Commands table
CREATE TABLE IF NOT EXISTS seraphc2.commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    implant_id UUID NOT NULL REFERENCES seraphc2.implants(id) ON DELETE CASCADE,
    operator_id UUID NOT NULL REFERENCES seraphc2.operators(id) ON DELETE CASCADE,
    command_type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    executed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS seraphc2.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operator_id UUID REFERENCES seraphc2.operators(id) ON DELETE SET NULL,
    implant_id UUID REFERENCES seraphc2.implants(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_implants_status ON seraphc2.implants(status);
CREATE INDEX IF NOT EXISTS idx_implants_last_seen ON seraphc2.implants(last_seen);
CREATE INDEX IF NOT EXISTS idx_commands_implant_id ON seraphc2.commands(implant_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON seraphc2.commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_created_at ON seraphc2.commands(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator_id ON seraphc2.audit_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON seraphc2.audit_logs(created_at);

-- Create default admin user (password: admin123 - change in production!)
INSERT INTO seraphc2.operators (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@seraphc2.local',
    crypt('admin123', gen_salt('bf')),
    'administrator'
) ON CONFLICT (username) DO NOTHING;

-- Grant permissions
GRANT USAGE ON SCHEMA seraphc2 TO seraphc2;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA seraphc2 TO seraphc2;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA seraphc2 TO seraphc2;