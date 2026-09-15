CREATE TABLE IF NOT EXISTS free_check_costs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','complete','failed')),
  actual_usd REAL,
  known_usd REAL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  execution_id TEXT
);
CREATE INDEX IF NOT EXISTS free_check_costs_created ON free_check_costs(created_at);
