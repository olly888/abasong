BEGIN;
CREATE TABLE abasong.apartment_sharing_operations (
  id uuid PRIMARY KEY,
  apartment_id uuid NOT NULL REFERENCES abasong.apartments(id),
  version integer NOT NULL CHECK(version > 0),
  paused boolean NOT NULL,
  actor_id uuid NOT NULL REFERENCES abasong.users(id),
  reason text NOT NULL CHECK(
    (paused AND reason IN ('property_request','authorization_review'))
    OR (NOT paused AND reason='property_confirmed')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(apartment_id,version)
);
ALTER TABLE abasong.apartment_sharing_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.apartment_sharing_operations FORCE ROW LEVEL SECURITY;
GRANT SELECT(apartment_id,version,paused) ON abasong.apartment_sharing_operations TO abasong_sensitive;
CREATE POLICY sensitive_apartment_sharing_state ON abasong.apartment_sharing_operations
  FOR SELECT TO abasong_sensitive USING(true);
INSERT INTO abasong.schema_version(version) VALUES('V12.0023');
COMMIT;
