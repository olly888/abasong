-- Keep 0015 immutable after local application. Provider-derived address text,
-- not only coordinates, needs an explicit persistent source before storage.
BEGIN;
ALTER TABLE abasong.request_pickup_addresses ADD COLUMN address_source text NOT NULL DEFAULT 'legacy_unclassified'
 CHECK(address_source IN ('publisher_entered','provider_permanent','legacy_unclassified'));
ALTER TABLE abasong.request_pickup_addresses ALTER COLUMN address_source SET DEFAULT 'publisher_entered';
DO $$ DECLARE c record; changed integer := 0;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='abasong.request_pickup_addresses'::regclass AND contype='c'
 AND cardinality(conkey)=3 AND conkey @> ARRAY[
  (SELECT attnum FROM pg_attribute WHERE attrelid='abasong.request_pickup_addresses'::regclass AND attname='point'),
  (SELECT attnum FROM pg_attribute WHERE attrelid='abasong.request_pickup_addresses'::regclass AND attname='source_id')
 ]::smallint[] LOOP
  EXECUTE format('ALTER TABLE abasong.request_pickup_addresses DROP CONSTRAINT %I',c.conname);
  changed := changed+1;
 END LOOP;
 IF changed<>1 THEN RAISE EXCEPTION 'Pickup source constraint differs; review required'; END IF;
END $$;
ALTER TABLE abasong.request_pickup_addresses ADD CONSTRAINT pickup_persistent_provenance
 CHECK(((point IS NULL AND source_id IS NULL AND address_source<>'provider_permanent')
  OR (source_id IS NOT NULL AND address_confirmed)) IS TRUE);
CREATE POLICY pickup_classified_read ON abasong.request_pickup_addresses AS RESTRICTIVE FOR SELECT TO abasong_api
 USING(address_source<>'legacy_unclassified' OR EXISTS(SELECT 1 FROM abasong.requests r
  WHERE r.id=request_pickup_addresses.request_id AND r.publisher_id::text=current_setting('abasong.actor_id',true)));
CREATE POLICY pickup_classified_insert ON abasong.request_pickup_addresses AS RESTRICTIVE FOR INSERT TO abasong_api
 WITH CHECK(address_source<>'legacy_unclassified');
CREATE OR REPLACE FUNCTION abasong.check_pickup_persistent_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM abasong.data_sources s WHERE s.id=NEW.source_id
  AND s.persistent_use_approved AND s.verified_at IS NOT NULL AND s.verified_at<=now()
  AND (s.expires_at IS NULL OR s.expires_at>now())
  AND (NEW.address_source<>'provider_permanent' OR s.source_type IN ('provider_permanent','licensed_dataset'))) THEN
  RAISE EXCEPTION 'Persistent pickup source required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION abasong.check_request_pickup_confirmed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r abasong.requests%ROWTYPE;
BEGIN
 IF NEW.request_schema_version=1 OR NEW.status='draft' THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'draft'
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
INSERT INTO abasong.schema_version(version) VALUES('V12.0016');
COMMIT;
