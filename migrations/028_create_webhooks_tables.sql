-- Migration: Create webhooks and related tables
-- Up migration

-- Webhooks configuration table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    headers JSONB NOT NULL DEFAULT '{}',
    secret VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    retry_count INTEGER NOT NULL DEFAULT 3 CHECK (retry_count >= 0 AND retry_count <= 5),
    timeout INTEGER NOT NULL DEFAULT 10000 CHECK (timeout >= 1000 AND timeout <= 30000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Webhook events table
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    source VARCHAR(100) NOT NULL DEFAULT 'seraphc2'
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    http_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_webhooks_is_active ON webhooks(is_active);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);

CREATE INDEX idx_webhook_events_event ON webhook_events(event);
CREATE INDEX idx_webhook_events_timestamp ON webhook_events(timestamp);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event_id ON webhook_deliveries(event_id);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
CREATE INDEX idx_webhook_deliveries_next_retry_at ON webhook_deliveries(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- Add comments
COMMENT ON TABLE webhooks IS 'Webhook configurations for external integrations';
COMMENT ON COLUMN webhooks.events IS 'JSON array of events that trigger this webhook';
COMMENT ON COLUMN webhooks.headers IS 'JSON object of custom headers to send with webhook requests';
COMMENT ON COLUMN webhooks.secret IS 'Secret for HMAC signature generation';
COMMENT ON COLUMN webhooks.retry_count IS 'Number of retry attempts for failed webhooks (0-5)';
COMMENT ON COLUMN webhooks.timeout IS 'Webhook timeout in milliseconds (1000-30000)';

COMMENT ON TABLE webhook_events IS 'Log of all webhook events triggered in the system';
COMMENT ON COLUMN webhook_events.data IS 'JSON payload data for the event';

COMMENT ON TABLE webhook_deliveries IS 'Delivery attempts and results for webhook events';
COMMENT ON COLUMN webhook_deliveries.attempts IS 'Number of delivery attempts made';
COMMENT ON COLUMN webhook_deliveries.next_retry_at IS 'Timestamp for next retry attempt';