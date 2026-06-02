CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  write_token_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  current_round_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
