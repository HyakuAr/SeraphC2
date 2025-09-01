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

-- Create function to clean up old task executions
CREATE OR REPLACE FUNCTION cleanup_old_task_executions(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete old task executions and related data
    WITH deleted_executions AS (
        DELETE FROM task_executions 
        WHERE created_at < NOW() - INTERVAL '1 day' * retention_days
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted_executions;
    
    -- Delete old scheduler events
    DELETE FROM task_scheduler_events 
    WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get next scheduled tasks
CREATE OR REPLACE FUNCTION get_next_scheduled_tasks(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
    task_id UUID,
    task_name VARCHAR(255),
    next_execution TIMESTAMP WITH TIME ZONE,
    triggers JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.name,
        t.next_execution,
        t.triggers
    FROM tasks t
    WHERE t.is_active = true
      AND t.next_execution IS NOT NULL
      AND t.next_execution <= NOW()
    ORDER BY t.next_execution ASC, t.priority DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate next execution time for cron expressions
CREATE OR REPLACE FUNCTION calculate_next_cron_execution(
    cron_expression TEXT,
    from_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    next_time TIMESTAMP WITH TIME ZONE;
    parts TEXT[];
    minute_part TEXT;
    hour_part TEXT;
    day_part TEXT;
    month_part TEXT;
    dow_part TEXT;
    current_time TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Parse cron expression (minute hour day month dayOfWeek)
    parts := string_to_array(cron_expression, ' ');
    
    IF array_length(parts, 1) != 5 THEN
        RAISE EXCEPTION 'Invalid cron expression: %', cron_expression;
    END IF;
    
    minute_part := parts[1];
    hour_part := parts[2];
    day_part := parts[3];
    month_part := parts[4];
    dow_part := parts[5];
    
    current_time := from_time;
    
    -- Simple implementation for basic cron expressions
    -- This is a simplified version - a full implementation would handle all cron features
    
    -- Handle */n patterns and specific values
    IF minute_part = '*' THEN
        next_time := date_trunc('hour', current_time) + INTERVAL '1 hour';
    ELSIF minute_part ~ '^\d+$' THEN
        next_time := date_trunc('hour', current_time) + (minute_part::INTEGER || ' minutes')::INTERVAL;
        IF next_time <= current_time THEN
            next_time := next_time + INTERVAL '1 hour';
        END IF;
    ELSIF minute_part ~ '^\*/\d+$' THEN
        -- Handle */n pattern (every n minutes)
        DECLARE
            interval_minutes INTEGER := substring(minute_part from 3)::INTEGER;
            current_minute INTEGER := EXTRACT(MINUTE FROM current_time)::INTEGER;
            next_minute INTEGER;
        BEGIN
            next_minute := ((current_minute / interval_minutes) + 1) * interval_minutes;
            IF next_minute >= 60 THEN
                next_time := date_trunc('hour', current_time) + INTERVAL '1 hour';
            ELSE
                next_time := date_trunc('hour', current_time) + (next_minute || ' minutes')::INTERVAL;
            END IF;
        END;
    ELSE
        -- Default to next hour for complex expressions
        next_time := date_trunc('hour', current_time) + INTERVAL '1 hour';
    END IF;
    
    -- Apply hour constraints if specified
    IF hour_part != '*' AND hour_part ~ '^\d+$' THEN
        next_time := date_trunc('day', next_time) + (hour_part::INTEGER || ' hours')::INTERVAL + 
                    (EXTRACT(MINUTE FROM next_time)::INTEGER || ' minutes')::INTERVAL;
        IF next_time <= current_time THEN
            next_time := next_time + INTERVAL '1 day';
        END IF;
    END IF;
    
    RETURN next_time;
END;
$$ LANGUAGE plpgsql;