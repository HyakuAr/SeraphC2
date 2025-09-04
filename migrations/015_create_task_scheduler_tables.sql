-- Migration: Task Scheduler Tables
-- Description: Create tables for the task scheduling system

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
    commands JSONB NOT NULL DEFAULT '[]'::jsonb,
    implant_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    created_by UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_execution TIMESTAMP WITH TIME ZONE,
    next_execution TIMESTAMP WITH TIME ZONE,
    execution_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    average_execution_time INTEGER DEFAULT 0 -- in milliseconds
);

-- Create task executions table
CREATE TABLE IF NOT EXISTS task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
    triggered_by VARCHAR(20) NOT NULL CHECK (triggered_by IN ('cron', 'event', 'conditional', 'manual')),
    trigger_data JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create task command executions table
CREATE TABLE IF NOT EXISTS task_command_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES task_executions(id) ON DELETE CASCADE,
    command_id VARCHAR(255) NOT NULL, -- References the command ID from the task definition
    implant_id UUID NOT NULL REFERENCES implants(id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')),
    result JSONB DEFAULT '{}'::jsonb,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create task execution logs table
CREATE TABLE IF NOT EXISTS task_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES task_executions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb
);

-- Create task scheduler events table for event-driven triggers
CREATE TABLE IF NOT EXISTS task_scheduler_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    implant_id UUID REFERENCES implants(id) ON DELETE CASCADE,
    operator_id UUID REFERENCES operators(id) ON DELETE SET NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_name ON tasks(name);
CREATE INDEX IF NOT EXISTS idx_tasks_is_active ON tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_next_execution ON tasks(next_execution);
CREATE INDEX IF NOT EXISTS idx_tasks_last_execution ON tasks(last_execution);
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_implant_ids ON tasks USING GIN(implant_ids);

CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_triggered_by ON task_executions(triggered_by);
CREATE INDEX IF NOT EXISTS idx_task_executions_start_time ON task_executions(start_time);
CREATE INDEX IF NOT EXISTS idx_task_executions_next_retry_at ON task_executions(next_retry_at);

CREATE INDEX IF NOT EXISTS idx_task_command_executions_execution_id ON task_command_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_task_command_executions_implant_id ON task_command_executions(implant_id);
CREATE INDEX IF NOT EXISTS idx_task_command_executions_status ON task_command_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_command_executions_start_time ON task_command_executions(start_time);

CREATE INDEX IF NOT EXISTS idx_task_execution_logs_execution_id ON task_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_task_execution_logs_level ON task_execution_logs(level);
CREATE INDEX IF NOT EXISTS idx_task_execution_logs_timestamp ON task_execution_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_task_scheduler_events_event_type ON task_scheduler_events(event_type);
CREATE INDEX IF NOT EXISTS idx_task_scheduler_events_processed ON task_scheduler_events(processed);
CREATE INDEX IF NOT EXISTS idx_task_scheduler_events_implant_id ON task_scheduler_events(implant_id);
CREATE INDEX IF NOT EXISTS idx_task_scheduler_events_created_at ON task_scheduler_events(created_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to update task statistics
CREATE OR REPLACE FUNCTION update_task_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update task statistics when execution completes
    IF NEW.status IN ('completed', 'failed') AND OLD.status NOT IN ('completed', 'failed') THEN
        UPDATE tasks 
        SET 
            execution_count = execution_count + 1,
            success_count = CASE WHEN NEW.status = 'completed' THEN success_count + 1 ELSE success_count END,
            failure_count = CASE WHEN NEW.status = 'failed' THEN failure_count + 1 ELSE failure_count END,
            last_execution = NEW.end_time,
            average_execution_time = CASE 
                WHEN NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
                    (COALESCE(average_execution_time, 0) * (execution_count) + 
                     EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) * 1000) / (execution_count + 1)
                ELSE average_execution_time
            END
        WHERE id = NEW.task_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update task statistics
CREATE TRIGGER update_task_statistics_trigger
    AFTER UPDATE ON task_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_task_statistics();