-- B3 encrypted messaging. Apply with the guarded D0 runner; cloud requires its own reviewed rollout.
BEGIN;
ALTER TABLE abasong.message_secrets
 ADD COLUMN cipher_version text NOT NULL DEFAULT 'legacy-unavailable' CHECK(cipher_version IN ('legacy-unavailable','local-envelope-v1','aws-kms-envelope-v1')),
 ADD COLUMN content_hmac bytea CHECK(content_hmac IS NULL OR octet_length(content_hmac)=32);
-- A trusted secret-service transaction writes metadata and ciphertext atomically.
-- No membership in abasong_api, capability grants, user mutation, or worker secret access.
GRANT SELECT ON abasong.conversations,abasong.conversation_sources,abasong.messages,abasong.conversation_reads,abasong.requests,abasong.request_versions,abasong.blocks TO abasong_sensitive;
GRANT INSERT ON abasong.messages,abasong.conversation_sources,abasong.outbox TO abasong_sensitive;
GRANT UPDATE(created_at) ON abasong.conversations TO abasong_sensitive; -- participant row lock serializes source cards and text commits
GRANT USAGE,SELECT ON SEQUENCE abasong.messages_sequence_seq TO abasong_sensitive;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['conversations','conversation_sources','messages','conversation_reads','requests','request_versions','blocks'] LOOP
  EXECUTE format('CREATE POLICY messaging_metadata_read ON abasong.%I FOR SELECT TO abasong_sensitive USING (true)',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['messages','conversation_sources','outbox'] LOOP
  EXECUTE format('CREATE POLICY messaging_metadata_insert ON abasong.%I FOR INSERT TO abasong_sensitive WITH CHECK (true)',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['conversations'] LOOP
  EXECUTE format('CREATE POLICY messaging_metadata_update ON abasong.%I FOR UPDATE TO abasong_sensitive USING (true) WITH CHECK (true)',n);
 END LOOP;
END $$;
INSERT INTO abasong.schema_version(version) VALUES('V12.0011');
COMMIT;
