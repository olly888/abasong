import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { Client, escapeLiteral } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    admin = localTarget(env.DATABASE_ADMIN_URL),
    runtime = localTarget(env.DATABASE_URL);
  assert.equal(admin.username, "postgres");
  assert.equal(admin.pathname, "/abasong_d0");
  const db = new Client({ connectionString: admin.href });
  await db.connect();
  try {
    if (
      !(
        await db.query(
          "SELECT 1 FROM abasong.schema_version WHERE version='V12.0002'",
        )
      ).rowCount
    )
      await db.query(
        readFileSync(
          "database/migrations/0002_personal_apartments.sql",
          "utf8",
        ),
      );
    if (
      !(
        await db.query(
          "SELECT 1 FROM abasong.schema_version WHERE version='V12.0003'",
        )
      ).rowCount
    )
      await db.query(
        readFileSync(
          "database/migrations/0003_apartment_buildings.sql",
          "utf8",
        ),
      );
    if (
      !(
        await db.query(
          "SELECT 1 FROM abasong.schema_version WHERE version='V12.0004'",
        )
      ).rowCount
    )
      await db.query(
        readFileSync("database/migrations/0004_import_batches.sql", "utf8"),
      );
    const secret = env.DATABASE_SENSITIVE_URL
      ? localTarget(env.DATABASE_SENSITIVE_URL)
      : new URL(runtime);
    if (!env.DATABASE_SENSITIVE_URL) {
      secret.username = "abasong_secret_local";
      secret.password = randomBytes(24).toString("hex");
    }
    assert.equal(secret.username, "abasong_secret_local");
    assert.equal(secret.pathname, "/abasong_d0");
    if (
      !(
        await db.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
          secret.username,
        ])
      ).rowCount
    )
      await db.query(
        `CREATE ROLE abasong_secret_local LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${escapeLiteral(decodeURIComponent(secret.password))}`,
      );
    await db.query("GRANT abasong_sensitive TO abasong_secret_local");
    const flags = (
      await db.query(
        "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname='abasong_secret_local'",
      )
    ).rows[0];
    assert(Object.values(flags).every((v) => v === false));
    env.DATABASE_SENSITIVE_URL = secret.href;
    env.DATA_ENCRYPTION_PROVIDER = "local-development";
    env.LOCAL_DATA_KEK ??= randomBytes(32).toString("hex");
    writeFileSync(
      ".env",
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    chmodSync(".env", 0o600);
    console.log(
      "Local D1 migration and isolated secret-role configuration ready; existing keys preserved; no cloud target",
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Local data initialization failed (configuration/permissions); no secrets emitted",
  );
  process.exitCode = 1;
});
