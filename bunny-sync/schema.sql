-- Personal SmartTube phone/TV state, isolated from all other Bunny databases.
-- Apply with `bunny db migrations apply` (or the Bunny SQL editor) before
-- publishing the Edge Script. The app never connects directly to this DB.

CREATE TABLE IF NOT EXISTS sync_accounts (
    id TEXT PRIMARY KEY,
    created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_devices (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES sync_accounts(id),
    device_name TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    last_seen_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_pairings (
    code_hash TEXT PRIMARY KEY,
    pending_token_hash TEXT NOT NULL UNIQUE,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_pairings_expires
    ON sync_pairings(expires_at_ms);

CREATE TABLE IF NOT EXISTS sync_state (
    account_id TEXT PRIMARY KEY REFERENCES sync_accounts(id),
    revision INTEGER NOT NULL DEFAULT 0,
    body_json TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_rate_limits (
    name TEXT PRIMARY KEY,
    bucket INTEGER NOT NULL,
    attempts INTEGER NOT NULL
);

-- Shared cache reduces third-party Rumble lookup credit usage when both
-- Android devices request the same channel/search during the same hour.
CREATE TABLE IF NOT EXISTS rumble_cache (
    cache_key TEXT PRIMARY KEY,
    body_json TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rumble_cache_expiration
    ON rumble_cache(expires_at_ms);
