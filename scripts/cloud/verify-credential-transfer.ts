import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { Client, type QueryResult } from "pg";
import { localTarget } from "../d0/database-target";
import { d0CredentialSql } from "./credential-sql";

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8"));
  const adminUrl = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(adminUrl.username, "postgres");
  const admin = new Client({ connectionString: adminUrl.href });
  const suffix = randomBytes(8).toString("hex");
  const name = `abasong_credential_test_${suffix}`;
  const roles = ["api", "sensitive", "worker"].map((k) => `${name}_${k}`);
  const parents = ["abasong_api", "abasong_sensitive", "abasong_worker"];
  const publicKey = readFileSync(
    ".tooling/cloud-runtime/credential-public.asc",
    "utf8",
  ).trim();
  let created = false,
    database: Client | undefined;
  const createdRoles: string[] = [];
  let checks = 0;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    const dbUrl = new URL(adminUrl.href);
    dbUrl.pathname = `/${name}`;
    database = new Client({ connectionString: dbUrl.href });
    await database.connect();
    await database.query(
      "CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE SCHEMA abasong; CREATE TABLE abasong.schema_version(version text PRIMARY KEY); INSERT INTO abasong.schema_version VALUES ('V12.0009');",
    );
    for (const [i, role] of roles.entries()) {
      await admin.query(
        `CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      createdRoles.push(role);
      await admin.query(`GRANT ${parents[i]} TO "${role}"`);
    }
    const initial = await admin.query(
      "SELECT count(*)::int AS n FROM pg_authid WHERE rolname=ANY($1) AND rolpassword IS NULL",
      [roles],
    );
    assert.equal(initial.rows[0].n, 3);
    checks++;
    const broken =
      "-----BEGIN PGP PUBLIC KEY BLOCK-----\nTEST-INVALID\n-----END PGP PUBLIC KEY BLOCK-----";
    let failed = false;
    try {
      await database.query(d0CredentialSql(broken, suffix));
    } catch (error) {
      failed = true;
      assert.match(
        (error as Error).message,
        /^Pilot credential initialization refused \([A-Z0-9]{5}\)$/,
      );
    }
    assert.equal(failed, true);
    const rollback = await admin.query(
      "SELECT count(*)::int AS n FROM pg_authid WHERE rolname=ANY($1) AND rolpassword IS NULL",
      [roles],
    );
    assert.equal(rollback.rows[0].n, 3);
    checks++;
    const result = (await database.query(
      d0CredentialSql(publicKey, suffix),
    )) as unknown as QueryResult[];
    const encrypted = result.at(-1)!.rows[0].encrypted_credentials as string;
    const hashes = await admin.query(
      "SELECT count(*)::int AS n FROM pg_authid WHERE rolname=ANY($1) AND rolpassword LIKE 'SCRAM-SHA-256$%'",
      [roles],
    );
    assert.equal(hashes.rows[0].n, 3);
    checks++;
    assert.match(encrypted, /^[A-Za-z0-9+/=\s]+$/);
    const decrypted = spawnSync(
      "/opt/homebrew/bin/gpg",
      [
        "--no-options",
        "--homedir",
        ".tooling/cloud-runtime/credential-key",
        "--batch",
        "--decrypt",
      ],
      { input: Buffer.from(encrypted, "base64"), encoding: "utf8" },
    );
    assert.equal(decrypted.status, 0);
    const values = JSON.parse(decrypted.stdout) as Record<string, string>;
    assert.deepEqual(Object.keys(values).sort(), [...roles].sort());
    assert.equal(new Set(Object.values(values)).size, 3);
    assert(Object.values(values).every((v) => /^[a-f0-9]{64}$/.test(v)));
    checks++;
    // A second call refuses instead of rotating a previously configured login.
    await assert.rejects(
      database.query(d0CredentialSql(publicKey, suffix)),
      /^error: Pilot credential initialization refused/,
    );
    checks++;
    for (const role of roles) {
      const target = new URL(dbUrl.href);
      target.username = role;
      target.password = values[role]!;
      const login = new Client({ connectionString: target.href });
      try {
        await login.connect();
        const r = await login.query("SELECT current_user AS name");
        assert.equal(r.rows[0].name, role);
        checks++;
      } finally {
        await login.end();
      }
    }
    console.log(
      JSON.stringify({
        suite: "sealed-service-credentials",
        checks,
        failed_encryption_rolled_back: true,
        repeated_setup_refused: true,
        restricted_logins: 3,
        cloud_writes: false,
        credential_output: false,
      }),
    );
  } finally {
    await database?.end();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    for (const role of createdRoles) await admin.query(`DROP ROLE "${role}"`);
    await admin.end();
  }
}
void main().catch(() => {
  console.error(
    "Sealed credential verification failed; private details omitted.",
  );
  process.exitCode = 1;
});
