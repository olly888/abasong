-- Additive V2 preparation. Never infer new scenes from historical kind values.
BEGIN;
ALTER TABLE abasong.requests
 ADD COLUMN request_schema_version smallint NOT NULL DEFAULT 1 CHECK(request_schema_version IN (1,2)),
 ADD COLUMN scenario text CHECK(scenario IN ('warehouse_shortage','delivery_handoff')),
 ADD COLUMN task_scope text CHECK(task_scope IN ('partial','whole_route')),
 ADD COLUMN quantity_mode text CHECK(quantity_mode IN ('exact','estimate','unknown')),
 ADD COLUMN handoff_mode text CHECK(handoff_mode IN ('asap','scheduled')),
 ADD COLUMN handoff_date date,
 ADD COLUMN completion_mode text CHECK(completion_mode IN ('same_day','next_day','contact')),
 ADD COLUMN pickup_kind text CHECK(pickup_kind IN ('warehouse','contact_handoff')),
 ADD COLUMN pickup_address_version integer CHECK(pickup_address_version>0);

-- Preserve every V1 predicate, but do not force V2 unknown/estimated counts
-- through an exact-count legacy constraint. Fail on an unexpected schema.
DO $$ DECLARE c record; changed integer := 0;
BEGIN
 FOR c IN SELECT conname,pg_get_expr(conbin,conrelid) AS expression
  FROM pg_constraint WHERE conrelid='abasong.requests'::regclass AND contype='c'
  AND cardinality(conkey)>1 AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute
   WHERE attrelid='abasong.requests'::regclass AND attname='parcel_count')]::smallint[]
 LOOP
  EXECUTE format('ALTER TABLE abasong.requests DROP CONSTRAINT %I',c.conname);
  EXECUTE format('ALTER TABLE abasong.requests ADD CONSTRAINT %I CHECK(request_schema_version=2 OR (%s))',c.conname,c.expression);
  changed := changed+1;
 END LOOP;
 IF changed<>4 THEN RAISE EXCEPTION 'Legacy request constraints differ; review required'; END IF;
END $$;
ALTER TABLE abasong.requests ADD CONSTRAINT requests_v1_no_invented_v2
 CHECK(request_schema_version=2 OR (scenario IS NULL AND task_scope IS NULL
  AND quantity_mode IS NULL AND handoff_mode IS NULL AND handoff_date IS NULL
  AND completion_mode IS NULL AND pickup_kind IS NULL AND pickup_address_version IS NULL));
ALTER TABLE abasong.requests ADD CONSTRAINT requests_v2_quantity
 CHECK(request_schema_version=1 OR status='draft' OR (
  (quantity_mode='unknown' AND parcel_count IS NULL AND minimum_parcels IS NULL AND remaining_parcels IS NULL)
  OR (quantity_mode='estimate' AND parcel_count>0 AND remaining_parcels IS NULL)
  OR (quantity_mode='exact' AND parcel_count>0 AND remaining_parcels>=0
      AND remaining_parcels<=parcel_count AND (minimum_parcels IS NULL OR minimum_parcels<=parcel_count))
 ) IS TRUE);
ALTER TABLE abasong.requests ADD CONSTRAINT requests_v2_publication
 CHECK(request_schema_version=1 OR status='draft' OR (
  scenario IS NOT NULL AND task_scope IS NOT NULL AND quantity_mode IS NOT NULL
  AND handoff_mode IS NOT NULL AND handoff_date IS NOT NULL AND completion_mode IS NOT NULL
  AND pickup_kind IS NOT NULL AND region_id IS NOT NULL AND pickup_region_id IS NOT NULL
  AND length(btrim(carrier))>0 AND length(btrim(pickup_area))>0
  AND price_unit IS NOT NULL AND sorted_state IS NOT NULL AND handoff_requirement IS NOT NULL
  AND timezone='America/Los_Angeles' AND starts_at IS NOT NULL AND expires_at IS NOT NULL
  AND handoff_date=(starts_at AT TIME ZONE 'America/Los_Angeles')::date
  AND (pickup_deadline_at IS NULL OR (pickup_deadline_at>=starts_at
   AND (pickup_deadline_at AT TIME ZONE 'America/Los_Angeles')::date=handoff_date
   AND expires_at<=pickup_deadline_at))
  AND ((scenario='warehouse_shortage' AND kind='extra_drivers' AND drivers_needed>0)
   OR (scenario='delivery_handoff' AND kind=CASE WHEN task_scope='whole_route' THEN 'whole_route' ELSE 'partial_route' END))
  AND ((task_scope='partial' AND accepts_partial)
   OR (task_scope='whole_route' AND NOT accepts_partial AND quantity_mode='exact' AND minimum_parcels=parcel_count))
  AND ((pickup_kind='warehouse' AND pickup_address_version IS NOT NULL)
   OR (pickup_kind='contact_handoff' AND pickup_address_version IS NULL))
  AND ((completion_mode='contact' AND delivery_deadline_at IS NULL)
   OR (completion_mode IN ('same_day','next_day') AND delivery_deadline_at>=starts_at
    AND delivery_deadline_at<=(((handoff_date+CASE WHEN completion_mode='same_day' THEN 1 ELSE 2 END)::timestamp
      AT TIME ZONE 'America/Los_Angeles')-interval '1 millisecond')))
 ) IS TRUE);

CREATE TABLE abasong.request_pickup_addresses (
 request_id uuid NOT NULL REFERENCES abasong.requests(id),
 address_version integer NOT NULL CHECK(address_version>0),
 name text CHECK(length(name)<=160), address_line1 text CHECK(length(address_line1)<=200),
 city text CHECK(length(city)<=100), state text CHECK(length(state)<=2), postal_code text CHECK(length(postal_code)<=12),
 address_confirmed boolean NOT NULL DEFAULT false,
 point extensions.geography(Point,4326), source_id uuid REFERENCES abasong.data_sources(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(request_id,address_version),
 CHECK(NOT address_confirmed OR (length(btrim(address_line1))>0 AND length(btrim(city))>0
  AND state ~ '^[A-Z]{2}$' AND (postal_code IS NULL OR postal_code ~ '^\d{5}(-\d{4})?$')) IS TRUE),
 CHECK((point IS NULL AND source_id IS NULL) OR (point IS NOT NULL AND source_id IS NOT NULL AND address_confirmed))
);
ALTER TABLE abasong.requests ADD CONSTRAINT requests_pickup_same_request
 FOREIGN KEY(id,pickup_address_version) REFERENCES abasong.request_pickup_addresses(request_id,address_version)
 DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX requests_v2_open_handoff_day ON abasong.requests(handoff_date,region_id,expires_at)
 WHERE request_schema_version=2 AND status='open';
ALTER TABLE abasong.request_pickup_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.request_pickup_addresses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON abasong.request_pickup_addresses FROM PUBLIC,abasong_worker,abasong_sensitive;
GRANT SELECT,INSERT ON abasong.request_pickup_addresses TO abasong_api;
CREATE POLICY pickup_authorized_read ON abasong.request_pickup_addresses FOR SELECT TO abasong_api USING (
 EXISTS(SELECT 1 FROM abasong.users viewer WHERE viewer.id::text=current_setting('abasong.actor_id',true) AND viewer.status='active')
 AND EXISTS(SELECT 1 FROM abasong.requests r JOIN abasong.users publisher ON publisher.id=r.publisher_id
  WHERE r.id=request_pickup_addresses.request_id AND r.discarded_at IS NULL AND publisher.status='active'
   AND (r.publisher_id::text=current_setting('abasong.actor_id',true)
    OR (r.status<>'draft' AND r.pickup_kind='warehouse' AND r.pickup_address_version=request_pickup_addresses.address_version
     AND NOT EXISTS(SELECT 1 FROM abasong.blocks b
      WHERE (b.blocker_id::text=current_setting('abasong.actor_id',true) AND b.blocked_id=r.publisher_id)
         OR (b.blocker_id=r.publisher_id AND b.blocked_id::text=current_setting('abasong.actor_id',true))))))
);
CREATE POLICY pickup_owner_insert ON abasong.request_pickup_addresses FOR INSERT TO abasong_api WITH CHECK (
 EXISTS(SELECT 1 FROM abasong.requests r JOIN abasong.users owner ON owner.id=r.publisher_id
  WHERE r.id=request_pickup_addresses.request_id AND r.request_schema_version=2 AND r.discarded_at IS NULL
   AND owner.status='active' AND r.publisher_id::text=current_setting('abasong.actor_id',true))
);
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  EXECUTE format('REVOKE ALL ON abasong.request_pickup_addresses FROM %I',r);
 END LOOP;
END $$;
CREATE FUNCTION abasong.check_pickup_persistent_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.point IS NOT NULL AND NOT EXISTS(SELECT 1 FROM abasong.data_sources s WHERE s.id=NEW.source_id
  AND s.persistent_use_approved AND s.verified_at IS NOT NULL AND s.verified_at<=now()
  AND (s.expires_at IS NULL OR s.expires_at>now())) THEN
  RAISE EXCEPTION 'Persistent pickup source required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION abasong.check_pickup_persistent_source() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abasong.check_pickup_persistent_source() TO abasong_api;
CREATE TRIGGER pickup_persistent_source BEFORE INSERT ON abasong.request_pickup_addresses
 FOR EACH ROW EXECUTE FUNCTION abasong.check_pickup_persistent_source();
CREATE FUNCTION abasong.check_request_pickup_confirmed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r abasong.requests%ROWTYPE;
BEGIN
 IF NEW.request_schema_version=1 OR NEW.status='draft' THEN RETURN NULL; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'draft'
  AND OLD.request_schema_version=NEW.request_schema_version
  AND OLD.pickup_kind IS NOT DISTINCT FROM NEW.pickup_kind
  AND OLD.pickup_address_version IS NOT DISTINCT FROM NEW.pickup_address_version THEN
  RETURN NULL;
 END IF;
 SELECT * INTO r FROM abasong.requests WHERE id=NEW.id;
 IF r.request_schema_version=2 AND r.status<>'draft' AND r.pickup_kind='warehouse' AND NOT EXISTS(
  SELECT 1 FROM abasong.request_pickup_addresses p WHERE p.request_id=r.id
   AND p.address_version=r.pickup_address_version AND p.address_confirmed
 ) THEN RAISE EXCEPTION 'Confirmed pickup address required' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION abasong.check_request_pickup_confirmed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION abasong.check_request_pickup_confirmed() TO abasong_api,abasong_worker;
CREATE CONSTRAINT TRIGGER request_pickup_confirmed AFTER INSERT OR UPDATE ON abasong.requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION abasong.check_request_pickup_confirmed();
INSERT INTO abasong.schema_version(version) VALUES('V12.0015');
COMMIT;
