-- Google Calendar watch channel tracking for automatic inbound sync
CREATE TABLE IF NOT EXISTS calendar_watch_channels (
  id INTEGER PRIMARY KEY DEFAULT 1,
  mode TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  expiration TIMESTAMPTZ,
  webhook_address TEXT NOT NULL,
  token_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_watch_channels_single_row CHECK (id = 1),
  CONSTRAINT calendar_watch_channels_mode_check CHECK (mode IN ('test', 'live'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_watch_channels_expiration ON calendar_watch_channels (expiration);
