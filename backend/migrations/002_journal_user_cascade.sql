-- Fix journal_entries.user_id FK: add ON DELETE SET NULL
-- (previously had no cascade, causing FK violations when deleting users in tests)

ALTER TABLE journal_entries
  DROP CONSTRAINT journal_entries_user_id_fkey;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
