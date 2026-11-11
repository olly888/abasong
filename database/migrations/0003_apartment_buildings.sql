-- Verified building/address associations only. No temporary provider responses.
BEGIN;
CREATE TABLE abasong.apartment_buildings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 apartment_id uuid NOT NULL REFERENCES abasong.apartments(id),
 source_id uuid NOT NULL REFERENCES abasong.data_sources(id),
 footprint extensions.geometry(MultiPolygon,4326) NOT NULL,
 label_point extensions.geometry(Point,4326) NOT NULL,
 street_number text NOT NULL CHECK(length(street_number) BETWEEN 1 AND 40 AND street_number !~ '[[:cntrl:]]'),
 verified_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(extensions.ST_IsValid(footprint)),
 CHECK(NOT extensions.ST_IsEmpty(footprint)),
 CHECK(extensions.ST_XMin(footprint)>=-180 AND extensions.ST_XMax(footprint)<=180
   AND extensions.ST_YMin(footprint)>=-90 AND extensions.ST_YMax(footprint)<=90),
 CHECK(extensions.ST_Covers(footprint,label_point))
);
CREATE INDEX apartment_buildings_apartment ON abasong.apartment_buildings(apartment_id,id);
ALTER TABLE abasong.apartment_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE abasong.apartment_buildings FORCE ROW LEVEL SECURITY;
CREATE POLICY api_read ON abasong.apartment_buildings FOR SELECT TO abasong_api USING(true);
CREATE POLICY sensitive_read ON abasong.apartment_buildings FOR SELECT TO abasong_sensitive USING(true);
GRANT SELECT ON abasong.apartment_buildings,abasong.data_sources TO abasong_api,abasong_sensitive;
CREATE POLICY sensitive_source_read ON abasong.data_sources FOR SELECT TO abasong_sensitive USING(true);
REVOKE ALL ON abasong.apartment_buildings FROM PUBLIC,abasong_worker;
INSERT INTO abasong.schema_version(version) VALUES('V12.0003');
COMMIT;
