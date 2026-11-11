-- R4-07: explicit publishing identity, without fabricating legacy history.
BEGIN;
ALTER TABLE abasong.requests ADD COLUMN publishing_identity jsonb
 CHECK(publishing_identity IS NULL OR (
  jsonb_typeof(publishing_identity)='object'
  AND publishing_identity ?& ARRAY['publisher_display_name','organization']
  AND publishing_identity-ARRAY['publisher_display_name','organization']='{}'::jsonb
  AND jsonb_typeof(publishing_identity->'publisher_display_name')='string'
  AND length(publishing_identity->>'publisher_display_name') BETWEEN 1 AND 60
  AND (publishing_identity->'organization'='null'::jsonb OR (
   jsonb_typeof(publishing_identity->'organization')='object'
   AND (publishing_identity->'organization') ?& ARRAY['id','name','contact_user_id','verification_status']
   AND (publishing_identity->'organization')-ARRAY['id','name','contact_user_id','verification_status']='{}'::jsonb
   AND jsonb_typeof(publishing_identity->'organization'->'name')='string'
   AND length(publishing_identity->'organization'->>'name') BETWEEN 1 AND 120
   AND publishing_identity->'organization'->>'id'=organization_id::text
   AND publishing_identity->'organization'->>'contact_user_id'=publisher_id::text
   AND publishing_identity->'organization'->>'verification_status' IN ('self_reported','verified')
  ))
 ) IS TRUE);
CREATE FUNCTION abasong.keep_publishing_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.publishing_identity IS NOT NULL AND NEW.publishing_identity IS DISTINCT FROM OLD.publishing_identity THEN
  RAISE EXCEPTION 'Publishing identity is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION abasong.keep_publishing_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abasong.keep_publishing_identity() TO abasong_api,abasong_worker;
CREATE TRIGGER keep_publishing_identity BEFORE UPDATE ON abasong.requests
 FOR EACH ROW EXECUTE FUNCTION abasong.keep_publishing_identity();
-- Expiry/close workers need no private address read. Reopening must recheck it.
CREATE OR REPLACE FUNCTION abasong.check_request_pickup_confirmed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r abasong.requests%ROWTYPE;
BEGIN
 IF NEW.request_schema_version=1 OR NEW.status='draft' THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'draft'
  AND (NEW.status<>'open' OR OLD.status='open')
  AND OLD.request_schema_version=NEW.request_schema_version
  AND OLD.pickup_kind IS NOT DISTINCT FROM NEW.pickup_kind
  AND OLD.pickup_address_version IS NOT DISTINCT FROM NEW.pickup_address_version THEN RETURN NULL; END IF;
 SELECT * INTO r FROM abasong.requests WHERE id=NEW.id;
 IF r.request_schema_version=2 AND r.status<>'draft' AND r.pickup_kind='warehouse' AND NOT EXISTS(
  SELECT 1 FROM abasong.request_pickup_addresses p WHERE p.request_id=r.id
   AND p.address_version=r.pickup_address_version AND p.address_confirmed AND p.address_source<>'legacy_unclassified'
 ) THEN RAISE EXCEPTION 'Confirmed pickup address required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
INSERT INTO abasong.schema_version(version) VALUES('V12.0017');
COMMIT;
