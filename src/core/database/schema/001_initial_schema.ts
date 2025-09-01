/**
 * Initial database schema for SeraphC2
 * Creates core tables: operators, implants, commands
 */

import { Migration } from '../migrations';

export const initialSchemaMigration: Migration = {
  id: '001',
  name: 'Initial Schema - Core Tables',

  async up(client) {
    // Create operators table
    await client.query(`
      CREATE TABLE operators (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('read_only', 'operator', 'administrator')),
        permissions JSONB DEFAULT '[]'::jsonb,
        last_login TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true,
        session_token VARCHAR(255),
        totp_secret VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create implants table
    await client.query(`
      CREATE TABLE implants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hostname VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        operating_system VARCHAR(255) NOT NULL,
        architecture VARCHAR(50) NOT NULL,
        privileges VARCHAR(50) NOT NULL CHECK (privileges IN ('user', 'admin', 'system')),
        last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'disconnected', 'compromised')),
        communication_protocol VARCHAR(50) NOT NULL CHECK (communication_protocol IN ('http', 'https', 'dns', 'smb', 'websocket')),
        encryption_key VARCHAR(255) NOT NULL,
        configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
        system_info JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create commands table
    await client.query(`
      CREATE TABLE commands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        implant_id UUID NOT NULL REFERENCES implants(id) ON DELETE CASCADE,
        operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL CHECK (type IN ('shell', 'powershell', 'file_upload', 'file_download', 'system_info', 'process_list', 'screenshot')),
        payload TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'timeout')),
        result JSONB,
        execution_time INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX idx_operators_username ON operators(username);
      CREATE INDEX idx_operators_email ON operators(email);
      CREATE INDEX idx_operators_session_token ON operators(session_token);
      CREATE INDEX idx_operators_is_active ON operators(is_active);
    `);

    await client.query(`
      CREATE INDEX idx_implants_hostname ON implants(hostname);
      CREATE INDEX idx_implants_status ON implants(status);
      CREATE INDEX idx_implants_last_seen ON implants(last_seen);
      CREATE INDEX idx_implants_communication_protocol ON implants(communication_protocol);
    `);

    await client.query(`
      CREATE INDEX idx_commands_implant_id ON commands(implant_id);
      CREATE INDEX idx_commands_operator_id ON commands(operator_id);
      CREATE INDEX idx_commands_status ON commands(status);
      CREATE INDEX idx_commands_timestamp ON commands(timestamp);
      CREATE INDEX idx_commands_type ON commands(type);
    `);

    // Create updated_at trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    await client.query(`
      CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
      CREATE TRIGGER update_implants_updated_at BEFORE UPDATE ON implants
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      
      CREATE TRIGGER update_commands_updated_at BEFORE UPDATE ON commands
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(client) {
    // Drop triggers
    await client.query(`
      DROP TRIGGER IF EXISTS update_operators_updated_at ON operators;
      DROP TRIGGER IF EXISTS update_implants_updated_at ON implants;
      DROP TRIGGER IF EXISTS update_commands_updated_at ON commands;
    `);

    // Drop function
    await client.query(`
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);

    // Drop tables (in reverse order due to foreign keys)
    await client.query('DROP TABLE IF EXISTS commands;');
    await client.query('DROP TABLE IF EXISTS implants;');
    await client.query('DROP TABLE IF EXISTS operators;');
  },
};
