-- Additive format compatibility. Does not decrypt, rewrite or migrate local data.
BEGIN;
ALTER TABLE abasong.personal_apartments DROP CONSTRAINT personal_apartments_payload_check;
ALTER TABLE abasong.personal_access_records DROP CONSTRAINT personal_access_records_payload_check;
ALTER TABLE abasong.import_batches DROP CONSTRAINT import_batches_payload_check;
DO $$ DECLARE relation_name text; BEGIN
  FOREACH relation_name IN ARRAY ARRAY['personal_apartments','personal_access_records','import_batches'] LOOP
    EXECUTE format($check$
      ALTER TABLE abasong.%I ADD CONSTRAINT kms_compatible_payload CHECK(COALESCE(
        jsonb_typeof(payload)='object' AND (
          payload->>'format'='local-envelope-v1' OR (
            payload->>'format'='aws-kms-envelope-v1'
            AND payload->>'keyId' ~ '^arn:aws:kms:us-west-1:[0-9]{12}:key/[0-9a-f-]{36}$'
            AND jsonb_typeof(payload->'body')='array' AND jsonb_array_length(payload->'body')=3
            AND jsonb_typeof(payload->'wrapped')='array' AND jsonb_array_length(payload->'wrapped')=1
          )
        ),false))
    $check$,relation_name);
  END LOOP;
END $$;
INSERT INTO abasong.schema_version(version) VALUES('V12.0009');
COMMIT;
