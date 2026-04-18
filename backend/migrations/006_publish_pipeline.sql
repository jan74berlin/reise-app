ALTER TABLE journal_entries ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE journal_entries ADD COLUMN publish_seq INTEGER;
ALTER TABLE journal_entries ADD COLUMN first_published_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX trips_slug_unique ON trips(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX journal_entries_publish_seq_unique ON journal_entries(trip_id, publish_seq) WHERE publish_seq IS NOT NULL;
