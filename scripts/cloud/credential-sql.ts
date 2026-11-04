const parents = ["abasong_api", "abasong_sensitive", "abasong_worker"];
const pilotRoles = [
  "abasong_api_dev",
  "abasong_sensitive_dev",
  "abasong_worker_dev",
];
function sql(key: string, database: string, roles: string[]) {
  if (
    key.length > 16000 ||
    !/^-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]+-----END PGP PUBLIC KEY BLOCK-----\s*$/.test(
      key,
    ) ||
    /['\\\0]/.test(key)
  )
    throw new Error("Public encryption key refused");
  // Public key only in the request. Fresh credentials never leave PostgreSQL
  // except as a PGP ciphertext addressed to this temporary local key.
  return `CREATE OR REPLACE FUNCTION pg_temp.abasong_initial_service_credentials()
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,extensions AS $body$
DECLARE
  targets text[] := ARRAY[${roles.map((r) => `'${r}'`).join(",")}];
  parent_roles text[] := ARRAY[${parents.map((r) => `'${r}'`).join(",")}];
  payload jsonb := '{}'::jsonb;
  secret_value text;
  i integer;
  valid boolean;
BEGIN
  IF current_database() <> '${database}' OR NOT EXISTS (
    SELECT 1 FROM abasong.schema_version WHERE version='V12.0009'
  ) THEN RAISE EXCEPTION 'Credential environment refused'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('abasong:pilot-dev:initial-service-credentials',0));
  PERFORM set_config('password_encryption','scram-sha-256',true);
  FOR i IN 1..3 LOOP
    SELECT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreaterole
      AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls
      AND r.rolpassword IS NULL
      AND (SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid)=1
      AND pg_has_role(r.oid,parent_roles[i]::name,'MEMBER')
      INTO valid FROM pg_authid r WHERE r.rolname=targets[i];
    IF valid IS DISTINCT FROM true OR EXISTS (
      SELECT 1 FROM pg_stat_activity WHERE usename=targets[i]
    ) THEN RAISE EXCEPTION 'Credential target refused'; END IF;
  END LOOP;
  FOR i IN 1..3 LOOP
    secret_value := encode(extensions.gen_random_bytes(32),'hex');
    EXECUTE format('ALTER ROLE %I PASSWORD %L',targets[i],secret_value);
    payload := payload || jsonb_build_object(targets[i],secret_value);
  END LOOP;
  RETURN encode(extensions.pgp_pub_encrypt(payload::text,
    extensions.dearmor('${key}'),'cipher-algo=aes256,compress-algo=0'),'base64');
EXCEPTION WHEN query_canceled THEN
  RAISE EXCEPTION 'Pilot credential initialization refused (interrupted)' USING ERRCODE='P0001';
WHEN others THEN
  -- Hide nested EXECUTE/provider errors; the exception block rolls back all
  -- role changes and never returns a generated credential in error context.
  RAISE EXCEPTION 'Pilot credential initialization refused (%)', SQLSTATE USING ERRCODE='P0001';
END;
$body$;
SELECT pg_temp.abasong_initial_service_credentials() AS encrypted_credentials;`;
}

export function pilotCredentialSql(publicKey: string) {
  return sql(publicKey, "postgres", pilotRoles);
}

/** Only randomly named isolated D0 test targets; cannot name cloud roles. */
export function d0CredentialSql(publicKey: string, suffix: string) {
  if (!/^[a-f0-9]{16}$/.test(suffix))
    throw new Error("Isolated credential test refused");
  return sql(
    publicKey,
    `abasong_credential_test_${suffix}`,
    ["api", "sensitive", "worker"].map(
      (k) => `abasong_credential_test_${suffix}_${k}`,
    ),
  );
}
