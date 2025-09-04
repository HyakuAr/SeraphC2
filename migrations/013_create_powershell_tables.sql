-- Migration: Create PowerShell tables
-- Description: Add tables for PowerShell scripts, favorites, and sessions

-- PowerShell Scripts table
CREATE TABLE IF NOT EXISTS powershell_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    parameters JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    created_by UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PowerShell Favorites table
CREATE TABLE IF NOT EXISTS powershell_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    command TEXT NOT NULL,
    description TEXT,
    category VARCHAR(100),
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PowerShell Sessions table
CREATE TABLE IF NOT EXISTS powershell_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    implant_id UUID NOT NULL REFERENCES implants(id) ON DELETE CASCADE,
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    session_state VARCHAR(20) DEFAULT 'Active' CHECK (session_state IN ('Active', 'Broken', 'Closed')),
    runspace_id VARCHAR(255),
    modules JSONB DEFAULT '[]'::jsonb,
    variables JSONB DEFAULT '{}'::jsonb,
    execution_policy JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_powershell_scripts_created_by ON powershell_scripts(created_by);
CREATE INDEX IF NOT EXISTS idx_powershell_scripts_tags ON powershell_scripts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_powershell_scripts_name ON powershell_scripts(name);

CREATE INDEX IF NOT EXISTS idx_powershell_favorites_operator_id ON powershell_favorites(operator_id);
CREATE INDEX IF NOT EXISTS idx_powershell_favorites_category ON powershell_favorites(category);
CREATE INDEX IF NOT EXISTS idx_powershell_favorites_usage_count ON powershell_favorites(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_powershell_sessions_implant_id ON powershell_sessions(implant_id);
CREATE INDEX IF NOT EXISTS idx_powershell_sessions_operator_id ON powershell_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_powershell_sessions_state ON powershell_sessions(session_state);

-- Update triggers for updated_at (function already exists from migration 001)
CREATE TRIGGER update_powershell_scripts_updated_at 
    BEFORE UPDATE ON powershell_scripts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update trigger for last_activity in sessions
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_powershell_sessions_activity 
    BEFORE UPDATE ON powershell_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_session_activity();