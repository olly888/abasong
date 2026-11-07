-- Atomic, explicitly requested close when removing delivery purpose; public declared regions.
BEGIN;
ALTER TABLE abasong.profiles ADD COLUMN familiar_region_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(familiar_region_ids)<=5);
GRANT UPDATE(familiar_region_ids) ON abasong.profiles TO abasong_sensitive;
INSERT INTO abasong.schema_version(version) VALUES('V12.0019');
COMMIT;
