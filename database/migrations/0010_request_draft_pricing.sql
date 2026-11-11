-- Incomplete quotes remain private drafts. Publication still requires an
-- amount or explicit negotiable choice; no historical request is rewritten.
BEGIN;
DO $$ DECLARE prior_name text; matches integer;
BEGIN
 SELECT count(*),min(c.conname::text) INTO matches,prior_name FROM pg_constraint c
 WHERE c.conrelid='abasong.requests'::regclass AND c.contype='c'
 AND c.conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='price_unit'),(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='price_cents')]::smallint[];
 IF matches<>1 THEN RAISE EXCEPTION 'Request quote constraint differs; review required'; END IF;
 EXECUTE format('ALTER TABLE abasong.requests DROP CONSTRAINT %I',prior_name);
END $$;
ALTER TABLE abasong.requests ADD CONSTRAINT requests_published_quote
 CHECK(status='draft' OR price_unit IS NULL OR price_unit='negotiable' OR price_cents IS NOT NULL);
INSERT INTO abasong.schema_version(version) VALUES('V12.0010');
COMMIT;
