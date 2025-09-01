-- Migration: Create incident response and recovery tables
-- Description: Tables for incident management, kill switches, and backup metadata

-- Incidents table for tracking incident response events
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    description TEXT NOT NULL,
    affected_implants JSONB DEFAULT '[]',
    operator_id VARCHAR(255),
    response_actions JSONB DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT incidents_type_check CHECK (type IN (
        'detection_suspected',
        'server_compromise', 
        'communication_lost',
        'forensic_analysis',
        'emergency_evacuation',
        'legal_compliance'
    )),
    
    CONSTRAINT incidents_severity_check CHECK (severity IN (
        'low', 'medium', 'high', 'critical'
    )),
    
    CONSTRAINT incidents_status_check CHECK (status IN (
        'active', 'responding', 'contained', 'resolved'
    ))
);

-- Kill switch timers for monitoring implant communication
CREATE TABLE IF NOT EXISTS kill_switch_timers (
    id VARCHAR(255) PRIMARY KEY,
    implant_id VARCHAR(255) NOT NULL,
    timeout BIGINT NOT NULL, -- timeout in milliseconds
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    missed_heartbeats INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    reason TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Kill switch activations for tracking when kill switches are triggered
CREATE TABLE IF NOT EXISTS kill_switch_activations (
    id VARCHAR(255) PRIMARY KEY,
    implant_id VARCHAR(255) NOT NULL,
    timer_id VARCHAR(255) NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT kill_switch_activations_status_check CHECK (status IN (
        'pending', 'activated', 'completed', 'failed', 'cancelled'
    ))
);

-- Backup metadata for tracking system backups
CREATE TABLE IF NOT EXISTS backup_metadata (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    size BIGINT NOT NULL,
    compressed BOOLEAN NOT NULL DEFAULT false,
    encrypted BOOLEAN NOT NULL DEFAULT false,
    checksum VARCHAR(255) NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    CONSTRAINT backup_metadata_type_check CHECK (type IN (
        'full', 'incremental', 'emergency', 'configuration'
    ))
);

-- Recovery operations for tracking restore activities
CREATE TABLE IF NOT EXISTS recovery_operations (
    id VARCHAR(255) PRIMARY KEY,
    backup_id VARCHAR(255) NOT NULL REFERENCES backup_metadata(id),
    operator_id VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    components_restored JSONB DEFAULT '[]',
    components_failed JSONB DEFAULT '[]',
    errors JSONB DEFAULT '[]',
    restored_files JSONB DEFAULT '[]',
    
    CONSTRAINT recovery_operations_status_check CHECK (status IN (
        'in_progress', 'completed', 'failed', 'cancelled'
    ))
);

-- Emergency contacts for incident notifications
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(100),
    notification_types JSONB DEFAULT '[]', -- types of incidents to notify about
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Incident notifications tracking
CREATE TABLE IF NOT EXISTS incident_notifications (
    id SERIAL PRIMARY KEY,
    incident_id VARCHAR(255) NOT NULL REFERENCES incidents(id),
    contact_id INTEGER NOT NULL REFERENCES emergency_contacts(id),
    notification_type VARCHAR(50) NOT NULL, -- email, sms, webhook
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    response_received_at TIMESTAMP WITH TIME ZONE,
    response_content TEXT,
    
    CONSTRAINT incident_notifications_type_check CHECK (notification_type IN (
        'email', 'sms', 'webhook', 'push'
    )),
    
    CONSTRAINT incident_notifications_status_check CHECK (status IN (
        'pending', 'sent', 'delivered', 'failed', 'responded'
    ))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_operator_id ON incidents(operator_id);

CREATE INDEX IF NOT EXISTS idx_kill_switch_timers_implant_id ON kill_switch_timers(implant_id);
CREATE INDEX IF NOT EXISTS idx_kill_switch_timers_is_active ON kill_switch_timers(is_active);
CREATE INDEX IF NOT EXISTS idx_kill_switch_timers_last_heartbeat ON kill_switch_timers(last_heartbeat);

CREATE INDEX IF NOT EXISTS idx_kill_switch_activations_implant_id ON kill_switch_activations(implant_id);
CREATE INDEX IF NOT EXISTS idx_kill_switch_activations_timer_id ON kill_switch_activations(timer_id);
CREATE INDEX IF NOT EXISTS idx_kill_switch_activations_activated_at ON kill_switch_activations(activated_at);

CREATE INDEX IF NOT EXISTS idx_backup_metadata_type ON backup_metadata(type);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_created_at ON backup_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_expires_at ON backup_metadata(expires_at);

CREATE INDEX IF NOT EXISTS idx_recovery_operations_backup_id ON recovery_operations(backup_id);
CREATE INDEX IF NOT EXISTS idx_recovery_operations_operator_id ON recovery_operations(operator_id);
CREATE INDEX IF NOT EXISTS idx_recovery_operations_status ON recovery_operations(status);

CREATE INDEX IF NOT EXISTS idx_incident_notifications_incident_id ON incident_notifications(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_notifications_contact_id ON incident_notifications(contact_id);
CREATE INDEX IF NOT EXISTS idx_incident_notifications_sent_at ON incident_notifications(sent_at);

-- Triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kill_switch_timers_updated_at BEFORE UPDATE ON kill_switch_timers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kill_switch_activations_updated_at BEFORE UPDATE ON kill_switch_activations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_contacts_updated_at BEFORE UPDATE ON emergency_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE incidents IS 'Tracks incident response events and their resolution';
COMMENT ON TABLE kill_switch_timers IS 'Monitors implant communication timeouts for automatic cleanup';
COMMENT ON TABLE kill_switch_activations IS 'Records when kill switches are triggered and their outcomes';
COMMENT ON TABLE backup_metadata IS 'Metadata for system backups used in recovery operations';
COMMENT ON TABLE recovery_operations IS 'Tracks backup restoration activities';
COMMENT ON TABLE emergency_contacts IS 'Contact information for incident response notifications';
COMMENT ON TABLE incident_notifications IS 'Tracks notifications sent during incidents';