ALTER TABLE journal_entries ADD COLUMN route_image_url TEXT;
ALTER TABLE journal_entries ADD COLUMN route_image_path TEXT;
ALTER TABLE journal_entries ADD COLUMN route_meta JSONB;

ALTER TABLE trips ADD COLUMN route_overview_url TEXT;
ALTER TABLE trips ADD COLUMN route_overview_path TEXT;
ALTER TABLE trips ADD COLUMN route_overview_updated_at TIMESTAMPTZ;
