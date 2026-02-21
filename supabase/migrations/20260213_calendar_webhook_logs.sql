-- Table for logging all incoming Google Calendar webhook requests and errors
CREATE TABLE IF NOT EXISTS calendar_webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  extra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_webhook_logs_created_at ON calendar_webhook_logs (created_at DESC);