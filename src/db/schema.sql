PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  segment TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  token_hash TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK(consent IN (0,1)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('page_view','click','preference','journey_completed')),
  page TEXT NOT NULL,
  target TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_time ON events(occurred_at);
CREATE INDEX IF NOT EXISTS events_session_time ON events(session_id, occurred_at);
CREATE TABLE IF NOT EXISTS actions (
  signal_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('open','planned','done','dismissed')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  signal_id TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_id TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','analyst')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_token ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  segment TEXT NOT NULL CHECK(segment IN ('energia','tecnologia','servicos')),
  channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp','phone','portal')),
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','planned','active','completed','cancelled')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS campaigns_segment_status ON campaigns(segment,status);
CREATE TABLE IF NOT EXISTS campaign_signals (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  signal_id TEXT NOT NULL,
  PRIMARY KEY(campaign_id,signal_id)
);
PRAGMA user_version = 2;
