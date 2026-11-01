-- Arrival areas may cover a verified gate approach outside the building.
-- They are never building footprints and never contain access credentials.
BEGIN;
CREATE TABLE abasong.apartment_arrival_areas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 apartment_id uuid NOT NULL REFERENCES abasong.apartments(id),
 source_id uuid NOT NULL REFERENCES abasong.data_sources(id),
 area extensions.geometry(MultiPolygon,4326) NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','withdrawn')),
 verified_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'active' OR verified_at IS NOT NULL),
 CHECK(expires_at IS NULL OR expires_at > verified_at),
 CHECK(extensions.ST_IsValid(area) AND NOT extensions.ST_IsEmpty(area)),
 CHECK(extensions.ST_XMin(area)>=-180 AND extensions.ST_XMax(area)<=180
   AND extensions.ST_YMin(area)>=-90 AND extensions.ST_YMax(area)<=90),
 CHECK(extensions.ST_Area(area::extensions.geography) <= 10000)
);
CREATE INDEX apartment_arrival_areas_apartment ON abasong.apartment_arrival_areas(apartment_id);
CREATE INDEX apartment_arrival_areas_space ON abasong.apartment_arrival_areas USING gist(area);
ALTER TABLE abasong.apartment_arrival_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.apartment_arrival_areas FORCE ROW LEVEL SECURITY;
CREATE POLICY api_read ON abasong.apartment_arrival_areas FOR SELECT TO abasong_api USING(true);
CREATE POLICY sensitive_read ON abasong.apartment_arrival_areas FOR SELECT TO abasong_sensitive USING(true);
GRANT SELECT ON abasong.apartment_arrival_areas TO abasong_api,abasong_sensitive;
REVOKE ALL ON abasong.apartment_arrival_areas FROM PUBLIC,abasong_worker;
INSERT INTO abasong.schema_version(version) VALUES('V12.0005');
COMMIT;
