-- Migration number: 0001 	 spaces / items の初期スキーマ
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  warn_days INTEGER NOT NULL DEFAULT 3 CHECK (warn_days BETWEEN 1 AND 30),
  created_at TEXT NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('best_by', 'use_by')),
  memo TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_items_space_expires ON items(space_id, expires_on);
