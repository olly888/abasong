-- Incremental D1 migration. Apply only via guarded local runner until an environment is authorized.
BEGIN;
CREATE TABLE abasong.personal_apartments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES abasong.users(id),
 apartment_id uuid REFERENCES abasong.apartments(id), favorite boolean NOT NULL DEFAULT true,
 payload jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id), UNIQUE(owner_id,apartment_id),
 CHECK(jsonb_typeof(payload)='object' AND payload->>'format'='local-envelope-v1')
);
CREATE TABLE abasong.personal_access_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES abasong.users(id),
 entry_id uuid NOT NULL, payload jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,entry_id) REFERENCES abasong.personal_apartments(owner_id,id) ON DELETE CASCADE,
 CHECK(jsonb_typeof(payload)='object' AND payload->>'format'='local-envelope-v1')
);
CREATE INDEX personal_library_owner ON abasong.personal_apartments(owner_id,id);
CREATE INDEX personal_records_owner ON abasong.personal_access_records(owner_id,entry_id,id);
-- The ordinary API and worker never receive direct ciphertext-table privileges.
ALTER TABLE abasong.personal_apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.personal_apartments FORCE ROW LEVEL SECURITY;
ALTER TABLE abasong.personal_access_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.personal_access_records FORCE ROW LEVEL SECURITY;
CREATE POLICY private_owner ON abasong.personal_apartments TO abasong_sensitive
 USING(owner_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(owner_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY private_owner ON abasong.personal_access_records TO abasong_sensitive
 USING(owner_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(owner_id::text=current_setting('abasong.actor_id',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON abasong.personal_apartments,abasong.personal_access_records TO abasong_sensitive;
-- Narrow metadata privileges for guarded secret-service transactions. Cannot grant capabilities or edit users.
GRANT SELECT ON abasong.users,abasong.profiles,abasong.capabilities,abasong.apartments,abasong.access_records,abasong.access_contributions,abasong.access_feedback,abasong.config_versions TO abasong_sensitive;
GRANT INSERT ON abasong.access_records,abasong.access_contributions,abasong.audit_events TO abasong_sensitive;
GRANT SELECT,INSERT,UPDATE,DELETE ON abasong.idempotency_keys TO abasong_sensitive;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['users','profiles','capabilities','apartments','access_records','access_contributions','access_feedback','config_versions'] LOOP
  EXECUTE format('CREATE POLICY secret_metadata_read ON abasong.%I FOR SELECT TO abasong_sensitive USING(true)',n);
 END LOOP;
END $$;
CREATE POLICY secret_record_insert ON abasong.access_records FOR INSERT TO abasong_sensitive WITH CHECK(contributor_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY secret_contribution_insert ON abasong.access_contributions FOR INSERT TO abasong_sensitive WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY secret_audit_insert ON abasong.audit_events FOR INSERT TO abasong_sensitive WITH CHECK(actor_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY secret_idempotency ON abasong.idempotency_keys TO abasong_sensitive USING(actor_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(actor_id::text=current_setting('abasong.actor_id',true));
REVOKE ALL ON abasong.personal_apartments,abasong.personal_access_records FROM PUBLIC,abasong_api,abasong_worker;
GRANT INSERT,UPDATE ON abasong.access_feedback TO abasong_sensitive;
GRANT SELECT,INSERT ON abasong.feedback_events TO abasong_sensitive;
CREATE POLICY secret_feedback_write ON abasong.access_feedback TO abasong_sensitive
 USING(user_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
CREATE POLICY secret_feedback_event ON abasong.feedback_events TO abasong_sensitive
 USING(user_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(user_id::text=current_setting('abasong.actor_id',true));
INSERT INTO abasong.schema_version(version) VALUES('V12.0002');
COMMIT;
