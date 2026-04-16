CREATE TABLE families (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     UUID REFERENCES families(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT CHECK (role IN ('owner','member')) DEFAULT 'member',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       UUID REFERENCES families(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  start_date      DATE,
  end_date        DATE,
  vehicle_height  NUMERIC(4,2),
  vehicle_length  NUMERIC(4,2),
  vehicle_weight  INTEGER,
  vehicle_fuel    TEXT CHECK (vehicle_fuel IN ('diesel','petrol','electric','hybrid')),
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE nights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID REFERENCES trips(id) ON DELETE CASCADE,
  night_number INTEGER NOT NULL,
  date         DATE,
  lat_center   NUMERIC(9,6),
  lng_center   NUMERIC(9,6),
  notes        TEXT,
  UNIQUE (trip_id, night_number)
);

CREATE TABLE spots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pn_id       INTEGER UNIQUE,
  lat         NUMERIC(9,6) NOT NULL,
  lng         NUMERIC(9,6) NOT NULL,
  title       TEXT,
  type_code   TEXT,
  rating      NUMERIC(3,2),
  reviews     INTEGER,
  description TEXT,
  cached_at   TIMESTAMPTZ
);

CREATE TABLE night_spots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id     UUID REFERENCES nights(id) ON DELETE CASCADE,
  spot_id      UUID REFERENCES spots(id),
  role         TEXT CHECK (role IN ('primary','alt1','alt2','altpick')),
  is_selected  BOOLEAN DEFAULT false,
  notes        TEXT,
  UNIQUE (night_id, role)
);

CREATE TABLE sights (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id    UUID REFERENCES nights(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  url         TEXT
);

CREATE TABLE checklist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID REFERENCES trips(id) ON DELETE CASCADE,
  category   TEXT,
  text       TEXT NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  checked_by UUID REFERENCES users(id),
  checked_at TIMESTAMPTZ
);

CREATE TABLE journal_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID REFERENCES trips(id) ON DELETE CASCADE,
  night_id   UUID REFERENCES nights(id),
  user_id    UUID REFERENCES users(id),
  text       TEXT,
  source     TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE media (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  drive_file_id    TEXT NOT NULL,
  drive_view_url   TEXT NOT NULL,
  filename         TEXT NOT NULL,
  caption          TEXT,
  taken_at         TIMESTAMPTZ
);

CREATE TABLE sync_log (
  id          BIGSERIAL PRIMARY KEY,
  family_id   UUID REFERENCES families(id) ON DELETE CASCADE,
  table_name  TEXT NOT NULL,
  row_id      UUID NOT NULL,
  action      TEXT CHECK (action IN ('insert','update','delete')),
  changed_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trips           ENABLE ROW LEVEL SECURITY;
ALTER TABLE nights          ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_spots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sights          ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE media           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log        ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_trips      ON trips           USING (family_id = current_setting('app.family_id', true)::UUID);
CREATE POLICY p_nights     ON nights          USING (trip_id IN (SELECT id FROM trips));
CREATE POLICY p_nightspots ON night_spots     USING (night_id IN (SELECT id FROM nights));
CREATE POLICY p_sights     ON sights          USING (night_id IN (SELECT id FROM nights));
CREATE POLICY p_checklist  ON checklist_items USING (trip_id IN (SELECT id FROM trips));
CREATE POLICY p_journal    ON journal_entries USING (trip_id IN (SELECT id FROM trips));
CREATE POLICY p_media      ON media           USING (journal_entry_id IN (SELECT id FROM journal_entries));
CREATE POLICY p_synclog    ON sync_log        USING (family_id = current_setting('app.family_id', true)::UUID);

GRANT SET ON PARAMETER "app.family_id" TO reise;
