ALTER TABLE service_catalog
ADD COLUMN IF NOT EXISTS qb_item_id VARCHAR(64);

ALTER TABLE service_catalog
ADD COLUMN IF NOT EXISTS sku VARCHAR(128);

ALTER TABLE service_catalog
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE service_catalog
ADD COLUMN IF NOT EXISTS qb_type VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_qb_item_id_uq
ON service_catalog (qb_item_id)
WHERE qb_item_id IS NOT NULL;

ALTER TABLE invoice_line_items
ADD COLUMN IF NOT EXISTS qb_item_id VARCHAR(64);
