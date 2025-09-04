-- Migration: Initialize base schema
-- Description: Create base tables and extensions required by SeraphC2

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create base tables that other migrations depend on
-- This ensures all foreign key references will work

-- Operators table (required by many other tables)
CREATE TABLE IF NOT EXISTS operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('read_only', 'operator', 'administrator')),
    permissions JSONB DEFAULT '[]',
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    session_token VARCHAR(255),
    totp_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Implants table (required by commands and other tables)
CREATE TABLE IF NOT EXISTS implants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    operating_system VARCHAR(255) NOT NULL,
    architecture VARCHAR(50) NOT NULL,
    privileges VARCHAR(50) NOT NULL CHECK (privileges IN ('user', 'admin', 'system')),
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'inactive', 'disconnected', 'compromised')),
    communication_protocol VARCHAR(50) NOT NULL CHECK (communication_protocol IN ('http', 'https', 'dns', 'smb', 'websocket')),
    encryption_key VARCHAR(255) NOT NULL,
    configuration JSONB NOT NULL DEFAULT '{}',
    system_info JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Commands table (core functionality)
CREATE TABLE IF NOT EXISTS commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    implant_id UUID NOT NULL REFERENCES implants(id) ON DELETE CASCADE,
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    payload TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'timeout')),
    result JSONB,
    execution_time INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create essential indexes for performance
CREATE INDEX IF NOT EXISTS idx_operators_username ON operators(username);
CREATE INDEX IF NOT EXISTS idx_operators_email ON operators(email);
CREATE INDEX IF NOT EXISTS idx_operators_session_token ON operators(session_token);
CREATE INDEX IF NOT EXISTS idx_operators_is_active ON operators(is_active);

CREATE INDEX IF NOT EXISTS idx_implants_hostname ON implants(hostname);
CREATE INDEX IF NOT EXISTS idx_implants_status ON implants(status);
CREATE INDEX IF NOT EXISTS idx_implants_last_seen ON implants(last_seen);
CREATE INDEX IF NOT EXISTS idx_implants_communication_protocol ON implants(communication_protocol);

CREATE INDEX IF NOT EXISTS idx_commands_implant_id ON commands(implant_id);
CREATE INDEX IF NOT EXISTS idx_commands_operator_id ON commands(operator_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands(timestamp);
CREATE INDEX IF NOT EXISTS idx_commands_type ON commands(type);

-- Add table comments
COMMENT ON TABLE operators IS 'System operators with authentication and authorization';
COMMENT ON TABLE implants IS 'Deployed implants and their system information';
COMMENT ON TABLE commands IS 'Commands sent to implants and their execution results';

-- Create default admin user (password: admin123 - CHANGE THIS!)
INSERT INTO operators (username, email, password_hash, role, is_active) 
VALUES (
    'admin',
    'admin@seraphc2.local',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uDfG', -- bcrypt hash of 'admin123'
    'administrator',
    true
) ON CONFLICT (username) DO NOTHING;

-- Down migration (for rollback)
-- DROP TABLE IF EXISTS commands;
-- DROP TABLE IF EXISTS implants;
-- DROP TABLE IF EXISTS operators;
-- DROP EXTENSION IF EXISTS "pgcrypto";
-- DROP EXTENSION IF EXISTS "uuid-ossp";