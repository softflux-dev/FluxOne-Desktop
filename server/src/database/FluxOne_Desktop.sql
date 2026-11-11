-- FluxOne Desktop local SQLite schema (documentation)
-- Runtime applies migrations 001–015 via migrate.js; do not re-run this file on existing DBs
-- PRAGMA foreign_keys = ON; WAL used by app (see config/database.js)
--
-- Purpose: junior-readable FINAL head after migrations 001–015 (cash_drawer_* names, not till_*).
-- Existing installs: ordered .sql files in migrations/ only. This file is learning / greenfield reference.
-- Data: seed.js only migrates; catalog/employees come from cloud bootstrap.
-- Packaging: electron scripts/prepare-dist.mjs builds an empty schema-db (0 employees, 0 products).
--
-- Derived from a TEMP empty DB migrated through 001–015 (never overwrite server/data/fluxone.db with this).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity / sessions / cash drawer
-- ---------------------------------------------------------------------------

-- Singleton store settings (id must be 'store')
CREATE TABLE store_profile (
  id TEXT PRIMARY KEY CHECK (id = 'store'),
  name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  warning_message TEXT,
  return_instructions TEXT,
  shop_open_time TEXT NOT NULL DEFAULT '09:00',
  shop_close_time TEXT NOT NULL DEFAULT '18:00',
  supervisor_pin_hash TEXT,
  currency TEXT NOT NULL DEFAULT 'PKR',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Employees own auth sessions and cash drawers
-- role CHECK: 'admin' | 'cashier' | 'supervisor'
CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'supervisor')),
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  picture_url TEXT,
  email TEXT,
  -- Cashier 24h offline-login window (admin ignores this)
  offline_until TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Singleton: which cashier is assigned to this POS terminal
CREATE TABLE assigned_cashier (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_by TEXT REFERENCES employees(id)
);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_synced_at TEXT,
  sync_ok INTEGER NOT NULL DEFAULT 0 CHECK (sync_ok IN (0, 1)),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_sessions_employee
  ON auth_sessions (employee_id);

-- status CHECK: 'open' | 'closed'
-- Partial unique index: at most one open drawer per employee
CREATE TABLE cash_drawer_sessions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  auth_session_id TEXT REFERENCES auth_sessions(id),
  opening_float REAL NOT NULL DEFAULT 0,
  counted_cash REAL,
  expected_cash REAL,
  variance REAL,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE UNIQUE INDEX idx_cash_drawer_one_open
  ON cash_drawer_sessions (employee_id)
  WHERE status = 'open';

CREATE INDEX idx_cash_drawer_sessions_employee
  ON cash_drawer_sessions (employee_id);

-- type CHECK: 'opening' | 'sale_in' | 'refund_out'
CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  cash_drawer_id TEXT NOT NULL REFERENCES cash_drawer_sessions(id),
  type TEXT NOT NULL CHECK (type IN ('opening', 'sale_in', 'refund_out')),
  amount REAL NOT NULL,
  invoice_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cash_movements_drawer
  ON cash_movements (cash_drawer_id);

CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_logs_created
  ON activity_logs (created_at);

CREATE INDEX idx_activity_logs_action
  ON activity_logs (action);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  has_subcategories INTEGER NOT NULL DEFAULT 0 CHECK (has_subcategories IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE subcategories (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (category_id, name)
);

CREATE INDEX idx_subcategories_category
  ON subcategories (category_id);

CREATE TABLE tax_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  rate REAL NOT NULL CHECK (rate >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- Cloud BM discounts; product.offer_id links here when present
CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percent REAL NOT NULL DEFAULT 0 CHECK (percent >= 0),
  category_id TEXT REFERENCES categories(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_offers_active
  ON offers (is_active, name);

-- product_type app values (no DB CHECK): 'single' | 'variant' | 'bundle'
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  subcategory_id TEXT REFERENCES subcategories(id),
  price REAL NOT NULL CHECK (price >= 0),
  discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  stock INTEGER NOT NULL DEFAULT 0,
  is_popular INTEGER NOT NULL DEFAULT 0 CHECK (is_popular IN (0, 1)),
  image_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  product_type TEXT NOT NULL DEFAULT 'single',
  parent_id TEXT REFERENCES products(id),
  variant_label TEXT,
  variant_options TEXT NOT NULL DEFAULT '[]',
  bundle_items TEXT NOT NULL DEFAULT '[]',
  offer_id TEXT REFERENCES offers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_category
  ON products (category_id, subcategory_id);

CREATE INDEX idx_products_sku
  ON products (sku);

CREATE INDEX idx_products_barcode
  ON products (barcode);

CREATE INDEX idx_products_popular
  ON products (is_popular);

CREATE INDEX idx_products_parent
  ON products (parent_id);

CREATE INDEX idx_products_type_active
  ON products (product_type, is_active);

CREATE INDEX idx_products_offer
  ON products (offer_id)
  WHERE offer_id IS NOT NULL;

CREATE TABLE product_taxes (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tax_rule_id TEXT NOT NULL REFERENCES tax_rules(id),
  PRIMARY KEY (product_id, tax_rule_id)
);

-- Local sequences (e.g. name = 'invoice', 'cash_drawer') + POS stations
-- Declared before invoices so counter_id FK resolves in greenfield reads.
CREATE TABLE id_counters (
  name TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL
);

CREATE TABLE pos_counters (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX idx_pos_counters_active
  ON pos_counters (is_active, code);

-- ---------------------------------------------------------------------------
-- Sales / invoices
-- ---------------------------------------------------------------------------

-- status CHECK: 'open' | 'checked_out' | 'void'
-- mode CHECK: 'sale' | 'exchange'
CREATE TABLE sale_tabs (
  id TEXT PRIMARY KEY,
  cash_drawer_id TEXT REFERENCES cash_drawer_sessions(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  auth_session_id TEXT REFERENCES auth_sessions(id),
  tab_index INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checked_out', 'void')),
  mode TEXT NOT NULL DEFAULT 'sale' CHECK (mode IN ('sale', 'exchange')),
  exchange_invoice_id TEXT,
  exchanged_credit REAL NOT NULL DEFAULT 0,
  exchanged_fingerprint TEXT,
  exchanged_item_ids TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sale_tabs_drawer
  ON sale_tabs (cash_drawer_id, status);

CREATE INDEX idx_sale_tabs_employee
  ON sale_tabs (employee_id, status);

CREATE TABLE sale_tab_items (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL REFERENCES sale_tabs(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 0),
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sale_tab_items_tab
  ON sale_tab_items (tab_id);

-- type CHECK: 'Sale' | 'Return' | 'Exchange'
-- payment_status CHECK: 'Paid' | 'Return' | 'Adjust'
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  cash_drawer_id TEXT REFERENCES cash_drawer_sessions(id),
  employee_id TEXT REFERENCES employees(id),
  type TEXT NOT NULL CHECK (type IN ('Sale', 'Return', 'Exchange')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Return', 'Adjust')),
  item_count INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  tendered REAL NOT NULL DEFAULT 0,
  change_due REAL NOT NULL DEFAULT 0,
  net_due REAL NOT NULL DEFAULT 0,
  original_invoice_id TEXT REFERENCES invoices(id),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  counter_id TEXT REFERENCES pos_counters(id),
  cloud_synced_at TEXT,
  cloud_sale_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoices_created
  ON invoices (created_at);

CREATE INDEX idx_invoices_type
  ON invoices (type);

CREATE INDEX idx_invoices_cloud_sync
  ON invoices (cloud_synced_at)
  WHERE cloud_synced_at IS NULL;

CREATE INDEX idx_invoices_cloud_sale
  ON invoices (cloud_sale_id)
  WHERE cloud_sale_id IS NOT NULL;

CREATE TABLE invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  is_returned INTEGER NOT NULL DEFAULT 0 CHECK (is_returned IN (0, 1)),
  original_item_id TEXT
);

CREATE INDEX idx_invoice_items_invoice
  ON invoice_items (invoice_id);

CREATE TABLE invoice_taxes (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_rule_id TEXT REFERENCES tax_rules(id),
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  amount REAL NOT NULL
);

CREATE TABLE invoice_history (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES employees(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoice_history_invoice
  ON invoice_history (invoice_id, created_at);

CREATE TABLE exchange_events (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  tab_id TEXT REFERENCES sale_tabs(id),
  exchanged_fingerprint TEXT,
  replacement_fingerprint TEXT,
  exchanged_credit REAL NOT NULL DEFAULT 0,
  replacement_total REAL NOT NULL DEFAULT 0,
  net_due REAL NOT NULL DEFAULT 0,
  items_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_exchange_events_invoice
  ON exchange_events (invoice_id);

-- reason CHECK: 'sale' | 'return' | 'exchange' | 'seed' | 'adjust'
CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  qty_delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sale', 'return', 'exchange', 'seed', 'adjust')),
  invoice_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_inventory_movements_product
  ON inventory_movements (product_id);

-- ---------------------------------------------------------------------------
-- Notifications / counters
-- ---------------------------------------------------------------------------

-- source CHECK: 'system' | 'admin'
-- audience: app uses 'cashier' | 'admin' | 'all' (no DB CHECK; default 'cashier')
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id),
  source TEXT NOT NULL CHECK (source IN ('system', 'admin')),
  title TEXT NOT NULL,
  body TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  audience TEXT NOT NULL DEFAULT 'cashier',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_employee
  ON notifications (employee_id, is_read, created_at);

-- ---------------------------------------------------------------------------
-- Cloud sync
-- ---------------------------------------------------------------------------

-- Device/cloud tokens + bootstrap flags (singleton id = 1)
CREATE TABLE sync_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tenant_id TEXT,
  branch_id TEXT,
  device_id TEXT,
  cloud_api_url TEXT,
  last_pull_at TEXT,
  last_push_at TEXT,
  bootstrap_done INTEGER NOT NULL DEFAULT 0 CHECK (bootstrap_done IN (0, 1)),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TEXT,
  sync_version TEXT,
  branch_status TEXT NOT NULL DEFAULT 'open'
);

-- Outbound events queue
-- event_type CHECK: 'sale' | 'refund' | 'cashier_log' | 'attendance' | 'product_price_update' | 'price_change'
--   (attendance / price_change kept for legacy rows — do not enqueue; prefer product_price_update)
-- sync_status CHECK: 'pending' | 'accepted' | 'rejected' | 'skipped'
CREATE TABLE sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'sale',
    'refund',
    'cashier_log',
    'attendance',
    'product_price_update',
    'price_change'
  )),
  payload TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'accepted', 'rejected', 'skipped')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_code TEXT,
  last_error_hint TEXT,
  last_error_details TEXT,
  field_paths TEXT,
  http_status INTEGER,
  retryable INTEGER NOT NULL DEFAULT 0 CHECK (retryable IN (0, 1)),
  next_retry_at TEXT
);

CREATE INDEX idx_sync_outbox_pending
  ON sync_outbox (sync_status, created_at)
  WHERE sync_status = 'pending';

CREATE INDEX idx_sync_outbox_rejected_retry
  ON sync_outbox (sync_status, retryable, next_retry_at)
  WHERE sync_status = 'rejected' AND retryable = 1;

-- migrate.js bookkeeping (also created by migrate.js before applying files)
CREATE TABLE schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- DEPRECATED (kept on disk; do not invent DROP scripts here)
-- ---------------------------------------------------------------------------

-- DEPRECATED: legacy sync timestamp singleton; prefer sync_meta.
-- Some paths may still mirror last_synced_at here for backward compat.
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_synced_at TEXT,
  source TEXT NOT NULL DEFAULT 'local'
);

-- DEPRECATED: app no longer reads/writes app_releases (kept for older DBs only).
CREATE TABLE app_releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  notes TEXT,
  file_path TEXT,
  published_at TEXT
);

-- ---------------------------------------------------------------------------
-- Relationships (comments only)
-- ---------------------------------------------------------------------------
-- employees 1—* auth_sessions 1—* cash_drawer_sessions
-- cash_drawer_sessions 1—* sale_tabs / invoices / cash_movements
-- products 1—* invoice_items / sale_tab_items / inventory_movements
-- invoices 1—* invoice_items, invoice_taxes, invoice_history, exchange_events
-- categories 1—* subcategories / products; products *—* tax_rules via product_taxes
-- products N—1 offers (optional offer_id); products N—1 products (parent_id for variants)
-- sync_meta = device/cloud tokens; sync_outbox = outbound events
-- assigned_cashier = singleton pointer employees; id_counters / pos_counters = local sequences / POS stations
-- schema_migrations tracks applied migration filenames (001_…sql … 015_…sql)
