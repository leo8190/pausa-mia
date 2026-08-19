PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  display_name TEXT,
  locale TEXT NOT NULL DEFAULT 'es-AR',
  status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT,
  login_secret_hash TEXT NOT NULL,
  login_secret_salt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS linked_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_ref TEXT,
  status TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  token_ciphertext TEXT,
  token_kid TEXT,
  connected_at TEXT NOT NULL,
  revoked_at TEXT,
  error_message TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_linked_accounts_user_provider
  ON linked_accounts(user_id, provider, connected_at DESC);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  linked_account_id TEXT,
  provider TEXT,
  purpose TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  expires_at TEXT,
  evidence TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_account_id) REFERENCES linked_accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consents_user_provider
  ON consents(user_id, provider, granted_at DESC);

CREATE TABLE IF NOT EXISTS context_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  source_type TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL,
  discard_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_context_items_user_id ON context_items(user_id, created_at DESC);
