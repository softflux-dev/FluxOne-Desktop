-- Cloud sync error-handling contract:
-- statuses: pending | accepted | rejected | skipped
-- persist code / hint / fieldPaths / retryable for diagnosis + retry policy
-- SQLite cannot ALTER CHECK; rebuild sync_outbox.

CREATE TABLE sync_outbox_new (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id    TEXT NOT NULL UNIQUE,
  event_type         TEXT NOT NULL CHECK (event_type IN (
    'sale',
    'refund',
    'cashier_log',
    'attendance',
    'product_price_update',
    'price_change'
  )),
  payload            TEXT NOT NULL,
  device_id          TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at          TEXT,
  sync_status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'accepted', 'rejected', 'skipped')),
  retry_count        INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT,
  last_error_code    TEXT,
  last_error_hint    TEXT,
  last_error_details TEXT,
  field_paths        TEXT,
  http_status        INTEGER,
  retryable          INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  next_retry_at      TEXT
);

INSERT INTO sync_outbox_new (
  id, client_event_id, event_type, payload, device_id,
  created_at, synced_at, sync_status, retry_count, last_error,
  last_error_code, last_error_hint, last_error_details, field_paths,
  http_status, retryable, next_retry_at
)
SELECT
  id,
  client_event_id,
  event_type,
  payload,
  device_id,
  created_at,
  synced_at,
  CASE sync_status
    WHEN 'sent' THEN 'accepted'
    WHEN 'failed' THEN 'rejected'
    ELSE sync_status
  END,
  retry_count,
  last_error,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END,
  NULL
FROM sync_outbox;

DROP TABLE sync_outbox;

ALTER TABLE sync_outbox_new RENAME TO sync_outbox;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
  ON sync_outbox (sync_status, created_at)
  WHERE sync_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_outbox_rejected_retry
  ON sync_outbox (sync_status, retryable, next_retry_at)
  WHERE sync_status = 'rejected' AND retryable = 1;
