-- A confirmed postal address can be shared without an operator approval queue.
-- Only server-obtained permanent coordinates enter a newly registered record.
BEGIN;
ALTER TABLE abasong.apartments ADD COLUMN address_key text;
CREATE UNIQUE INDEX apartments_contributed_address_key ON abasong.apartments(address_key) WHERE address_key IS NOT NULL;
GRANT INSERT ON abasong.data_sources,abasong.apartments TO abasong_sensitive;
CREATE POLICY sensitive_permanent_source_insert ON abasong.data_sources FOR INSERT TO abasong_sensitive WITH CHECK(
 source_type='provider_permanent' AND provider='Mapbox' AND product='geocoding-v6-permanent' AND persistent_use_approved AND verified_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM abasong.capabilities c WHERE c.user_id::text=current_setting('abasong.actor_id',true) AND c.capability='access.contribute' AND c.revoked_at IS NULL AND c.valid_from<=now() AND (c.valid_until IS NULL OR c.valid_until>now())));
CREATE POLICY sensitive_confirmed_apartment_insert ON abasong.apartments FOR INSERT TO abasong_sensitive WITH CHECK(
 status='active' AND confidence='unverified' AND boundary IS NULL AND parent_id IS NULL AND merged_into_id IS NULL AND address_key IS NOT NULL
 AND EXISTS(SELECT 1 FROM abasong.data_sources s WHERE s.id=source_id AND s.source_type='provider_permanent' AND s.provider='Mapbox' AND s.product='geocoding-v6-permanent' AND s.persistent_use_approved)
 AND EXISTS(SELECT 1 FROM abasong.capabilities c WHERE c.user_id::text=current_setting('abasong.actor_id',true) AND c.capability='access.contribute' AND c.revoked_at IS NULL AND c.valid_from<=now() AND (c.valid_until IS NULL OR c.valid_until>now())));
INSERT INTO abasong.schema_version(version) VALUES('V12.0007');
COMMIT;
