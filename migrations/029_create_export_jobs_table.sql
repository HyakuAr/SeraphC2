-- Migration: Create export jobs table for data export functionality
-- Up migration

CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('implants', 'commands', 'operators', 'audit_logs', 'tasks', 'modules')),
    format VARCHAR(10) NOT NULL CHECK (format IN ('json', 'xml', 'csv')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    total_records INTEGER,
    processed_records INTEGER,
    file_path TEXT,
    file_size BIGINT,
    error_message TEXT,
    operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    filters JSONB NOT NULL DEFAULT '{}',
    fields JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX idx_export_jobs_operator_id ON export_jobs(operator_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_type ON export_jobs(type);
CREATE INDEX idx_export_jobs_created_at ON export_jobs(created_at);
CREATE INDEX idx_export_jobs_completed_at ON export_jobs(completed_at);

-- Add comments
COMMENT ON TABLE export_jobs IS 'Asynchronous data export jobs for various data types';
COMMENT ON COLUMN export_jobs.type IS 'Type of data being exported (implants, commands, etc.)';
COMMENT ON COLUMN export_jobs.format IS 'Export format (json, xml, csv)';
COMMENT ON COLUMN export_jobs.status IS 'Current job status (pending, processing, completed, failed)';
COMMENT ON COLUMN export_jobs.progress IS 'Job completion percentage (0-100)';
COMMENT ON COLUMN export_jobs.total_records IS 'Total number of records to export';
COMMENT ON COLUMN export_jobs.processed_records IS 'Number of records processed so far';
COMMENT ON COLUMN export_jobs.file_path IS 'Path to the generated export file';
COMMENT ON COLUMN export_jobs.file_size IS 'Size of the generated export file in bytes';
COMMENT ON COLUMN export_jobs.filters IS 'JSON object containing export filters';
COMMENT ON COLUMN export_jobs.fields IS 'JSON array of fields to include in export';

-- Down migration (for rollback)
-- DROP TABLE IF EXISTS export_jobs;