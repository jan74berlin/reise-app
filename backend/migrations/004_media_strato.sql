-- Rename media columns to be storage-agnostic
ALTER TABLE media RENAME COLUMN drive_file_id TO file_path;
ALTER TABLE media RENAME COLUMN drive_view_url TO url;
