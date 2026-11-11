-- B5-01 owner-only preferences/contact envelope. No Auth phone or role grants.
BEGIN;
CREATE TABLE abasong.self_profiles (
 user_id uuid PRIMARY KEY REFERENCES abasong.profiles(user_id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 purposes text[] NOT NULL DEFAULT '{}' CHECK(purposes<@ARRAY['delivery','dsp']::text[] AND cardinality(purposes)<=2),
 familiar_region_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(familiar_region_ids)<=5),
 contact_payload jsonb NOT NULL CHECK(jsonb_typeof(contact_payload)='object' AND contact_payload->>'format' IN ('local-envelope-v1','aws-kms-envelope-v1')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE abasong.self_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.self_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_profile ON abasong.self_profiles TO abasong_sensitive
 USING(user_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON abasong.self_profiles TO abasong_sensitive;
REVOKE ALL ON abasong.self_profiles FROM PUBLIC,abasong_api,abasong_worker;
GRANT UPDATE(display_name,bio,vehicle_type,experience,updated_at) ON abasong.profiles TO abasong_sensitive;
CREATE POLICY owner_profile_edit ON abasong.profiles FOR UPDATE TO abasong_sensitive
 USING(user_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
GRANT SELECT ON abasong.regions TO abasong_sensitive;
CREATE POLICY profile_regions ON abasong.regions FOR SELECT TO abasong_sensitive USING(true);
GRANT SELECT,UPDATE(enabled,version,updated_at) ON abasong.availability TO abasong_sensitive;
CREATE POLICY owner_availability_profile ON abasong.availability TO abasong_sensitive USING(user_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
INSERT INTO abasong.schema_version(version) VALUES('V12.0018');
COMMIT;
