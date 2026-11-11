-- B3 per-conversation location grants and device/provider delivery metadata.
BEGIN;
ALTER TABLE abasong.meeting_shares ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE abasong.meeting_share_secrets (
 request_id uuid NOT NULL, conversation_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 ciphertext bytea NOT NULL, nonce bytea NOT NULL CHECK(octet_length(nonce)=12), auth_tag bytea NOT NULL CHECK(octet_length(auth_tag)=16),
 encrypted_dek bytea NOT NULL, kms_key_id text NOT NULL, cipher_version text NOT NULL CHECK(cipher_version IN ('local-envelope-v1','aws-kms-envelope-v1')),
 PRIMARY KEY(request_id,conversation_id), FOREIGN KEY(request_id,conversation_id) REFERENCES abasong.meeting_shares(request_id,conversation_id)
);
ALTER TABLE abasong.meeting_share_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.meeting_share_secrets FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON abasong.meeting_share_secrets TO abasong_sensitive;
CREATE POLICY secret_service ON abasong.meeting_share_secrets TO abasong_sensitive USING(true) WITH CHECK(true);
REVOKE INSERT,UPDATE,DELETE ON abasong.meeting_shares FROM abasong_api;
GRANT SELECT,INSERT,UPDATE ON abasong.meeting_shares TO abasong_sensitive;
CREATE POLICY meeting_service ON abasong.meeting_shares TO abasong_sensitive USING(true) WITH CHECK(true);
GRANT INSERT ON abasong.notifications TO abasong_sensitive;
CREATE POLICY meeting_notification ON abasong.notifications FOR INSERT TO abasong_sensitive WITH CHECK(true);
ALTER TABLE abasong.devices ADD COLUMN installation_hmac bytea CHECK(installation_hmac IS NULL OR octet_length(installation_hmac)=32),
 ADD COLUMN binding_version integer NOT NULL DEFAULT 1 CHECK(binding_version>0), ADD COLUMN lease_until timestamptz;
-- No legacy device can start receiving before the authenticated proof registration.
UPDATE abasong.devices SET enabled=false,push_token=NULL;
ALTER TABLE abasong.push_deliveries ADD COLUMN binding_version integer NOT NULL DEFAULT 1,
 ADD COLUMN attempts integer NOT NULL DEFAULT 0, ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN lease_until timestamptz, ADD COLUMN target_user_id uuid REFERENCES abasong.users(id), ADD COLUMN accepted_at timestamptz, ADD COLUMN lease_token uuid;
ALTER TABLE abasong.outbox ADD COLUMN lease_token uuid;
CREATE INDEX push_delivery_work ON abasong.push_deliveries(available_at) WHERE status IN ('pending','accepted');
GRANT SELECT ON abasong.notification_preferences,abasong.conversations,abasong.messages,abasong.conversation_reads,abasong.blocks,abasong.applications TO abasong_worker;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['notification_preferences','conversations','messages','conversation_reads','blocks','applications'] LOOP
  EXECUTE format('CREATE POLICY push_metadata ON abasong.%I FOR SELECT TO abasong_worker USING(true)',n);
 END LOOP;
END $$;
INSERT INTO abasong.schema_version(version) VALUES('V12.0013');
COMMIT;
