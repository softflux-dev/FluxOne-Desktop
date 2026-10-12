-- Cloud offers (branch BM discounts) + product.offer_id link
-- Bootstrap/delta: data.offers[] + products[].offerId
-- Effective shelf discount = COALESCE(product.discount, offer.percent, 0)

CREATE TABLE IF NOT EXISTS offers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  percent    REAL NOT NULL DEFAULT 0 CHECK (percent >= 0),
  category_id TEXT REFERENCES categories(id),
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_offers_active
  ON offers (is_active, name);

ALTER TABLE products ADD COLUMN offer_id TEXT REFERENCES offers(id);

CREATE INDEX IF NOT EXISTS idx_products_offer
  ON products (offer_id)
  WHERE offer_id IS NOT NULL;
