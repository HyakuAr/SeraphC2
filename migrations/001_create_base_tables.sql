-- Migration: Create additional base table triggers and functions
-- Up migration

-- Create function for updating updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_operators_updated_at 
    BEFORE UPDATE ON operators 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_implants_updated_at 
    BEFORE UPDATE ON implants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commands_updated_at 
    BEFORE UPDATE ON commands 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Down migration (for rollback)
-- DROP TRIGGER IF EXISTS update_commands_updated_at ON commands;
-- DROP TRIGGER IF EXISTS update_implants_updated_at ON implants;
-- DROP TRIGGER IF EXISTS update_operators_updated_at ON operators;
-- DROP FUNCTION IF EXISTS update_updated_at_column();