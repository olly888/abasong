-- ADD-11: new confirmed contributions publish directly, without an operator queue.
-- Preserve the original outcome of each append-only creation event for retries.
-- Existing pending records are NOT bulk-published by this migration.
BEGIN;
ALTER TABLE abasong.access_contributions
  ADD COLUMN published_on_creation boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT contribution_publication_event
    CHECK (NOT published_on_creation OR event_type='created');
COMMENT ON COLUMN abasong.access_contributions.published_on_creation IS
  'Immutable creation result; true means published immediately, not verified effective.';
INSERT INTO abasong.schema_version(version) VALUES('V12.0006');
COMMIT;
