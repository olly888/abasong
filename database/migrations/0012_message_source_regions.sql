-- Historical source labels use the referenced version's region; no provider data or secrets are copied.
BEGIN;
GRANT SELECT ON abasong.regions TO abasong_sensitive;
CREATE POLICY messaging_metadata_read ON abasong.regions FOR SELECT TO abasong_sensitive USING (true);
INSERT INTO abasong.schema_version(version) VALUES('V12.0012');
COMMIT;
