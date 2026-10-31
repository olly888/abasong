-- On-device OCR draft metadata and encrypted candidate/commit state. No images.
BEGIN;
CREATE TABLE abasong.import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES abasong.users(id),
 client_batch_id uuid NOT NULL, create_hmac bytea NOT NULL,
 policy_version integer NOT NULL CHECK(policy_version>0),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 state text NOT NULL CHECK(state IN ('created','needs_review','submitting','completed','partial_failed','cancelled','expired')),
 mode text NOT NULL CHECK(mode IN ('private_only','private_and_share')), mode_locked boolean NOT NULL DEFAULT false,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload->>'format'='local-envelope-v1'),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,client_batch_id), UNIQUE(owner_id,id)
);
CREATE INDEX import_batches_owner ON abasong.import_batches(owner_id,id);
CREATE INDEX import_batches_expiry ON abasong.import_batches(expires_at);
ALTER TABLE abasong.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.import_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_draft ON abasong.import_batches TO abasong_sensitive
 USING(owner_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(owner_id::text=current_setting('abasong.actor_id',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON abasong.import_batches TO abasong_sensitive;
REVOKE ALL ON abasong.import_batches FROM PUBLIC,abasong_api,abasong_worker;
CREATE TABLE abasong.import_source_usage (
 owner_id uuid NOT NULL REFERENCES abasong.users(id), usage_day date NOT NULL,
 source_count integer NOT NULL CHECK(source_count>0), PRIMARY KEY(owner_id,usage_day)
);
ALTER TABLE abasong.import_source_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.import_source_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_usage ON abasong.import_source_usage TO abasong_sensitive
 USING(owner_id::text=current_setting('abasong.actor_id',true)) WITH CHECK(owner_id::text=current_setting('abasong.actor_id',true));
GRANT SELECT,INSERT,UPDATE ON abasong.import_source_usage TO abasong_sensitive;
REVOKE ALL ON abasong.import_source_usage FROM PUBLIC,abasong_api,abasong_worker;
-- Worker receives only a narrow expiry operation, never candidate read access.
CREATE FUNCTION abasong.purge_expired_import_drafts(max_rows integer) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer;
BEGIN
 IF max_rows IS NULL OR max_rows<1 OR max_rows>500 THEN RAISE EXCEPTION 'invalid cleanup bound'; END IF;
 WITH expired AS (SELECT id FROM abasong.import_batches WHERE expires_at<=now() ORDER BY expires_at LIMIT max_rows FOR UPDATE SKIP LOCKED)
 DELETE FROM abasong.import_batches b USING expired e WHERE b.id=e.id;
 GET DIAGNOSTICS removed = ROW_COUNT;
 WITH stale AS (SELECT owner_id,usage_day FROM abasong.import_source_usage WHERE usage_day<(now() AT TIME ZONE 'UTC')::date-2 ORDER BY usage_day LIMIT max_rows FOR UPDATE SKIP LOCKED)
 DELETE FROM abasong.import_source_usage u USING stale s WHERE u.owner_id=s.owner_id AND u.usage_day=s.usage_day;
 RETURN removed;
END $$;
REVOKE ALL ON FUNCTION abasong.purge_expired_import_drafts(integer) FROM PUBLIC,abasong_api,abasong_sensitive;
GRANT EXECUTE ON FUNCTION abasong.purge_expired_import_drafts(integer) TO abasong_worker;
INSERT INTO abasong.schema_version(version) VALUES('V12.0004');
COMMIT;
