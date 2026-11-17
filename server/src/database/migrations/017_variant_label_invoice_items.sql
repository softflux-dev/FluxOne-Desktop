-- Add variant_label column to invoice_items for variant product display
-- Additive only — safe for existing installs.

ALTER TABLE invoice_items ADD COLUMN variant_label TEXT;