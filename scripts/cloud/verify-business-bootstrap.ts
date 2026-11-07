import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { Client } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";
import { cloudBusinessSql } from "./business-data";
import { pilotAdmissionSql, type PilotAdmission } from "./pilot-admission";
import { REQUIRED_SCHEMA_VERSIONS } from "../../packages/contracts/src/schema-versions";

const pilotBaseline = "V12.0009";

async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    target = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(target.username, "postgres");
  assert.equal(target.pathname, "/abasong_d0");
  const name = "abasong_cloud_bootstrap_test_" + randomBytes(8).toString("hex"),
    admin = new Client({ connectionString: target.href });
  await admin.connect();
  let created = false;
  let db: Client | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    target.pathname = "/" + name;
    db = new Client({ connectionString: target.href });
    await db.connect();
    const migrations = readdirSync("database/migrations")
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    const versions = migrations.map((f) => `V12.${f.slice(0, 4)}`);
    assert.deepEqual(versions, [...REQUIRED_SCHEMA_VERSIONS]);
    const baseline = versions.indexOf(pilotBaseline) + 1;
    assert(baseline > 0 && baseline < migrations.length);
    for (const f of migrations.slice(0, baseline))
      await db.query(readFileSync("database/migrations/" + f, "utf8"));
    // Simulated auth metadata only inside this disposable local database.
    await db.query(
      "CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,phone_confirmed_at timestamptz)",
    );
    const m = {
      operation: randomUUID(),
      source: randomUUID(),
      apartment: randomUUID(),
      building: randomUUID(),
    };
    const business = cloudBusinessSql(m);
    await db.query(business);
    await db.query(business);
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM abasong.apartments"))
        .rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(cloudBusinessSql({ ...m, operation: randomUUID() })),
    );
    const fixture = async () =>
      (
        await db!.query(
          `SELECT
             (SELECT to_jsonb(a) FROM abasong.apartments a WHERE id=$1) AS apartment,
             (SELECT to_jsonb(b) FROM abasong.apartment_buildings b WHERE id=$2) AS building,
             (SELECT config FROM abasong.config_versions WHERE version=1) AS config`,
          [m.apartment, m.building],
        )
      ).rows[0];
    const before = await fixture();
    assert(before.apartment && before.building && before.config);
    for (const f of migrations.slice(baseline))
      await db.query(readFileSync("database/migrations/" + f, "utf8"));
    const { rows: installed } = await db.query<{ version: string }>(
      "SELECT version FROM abasong.schema_version ORDER BY version",
    );
    assert.deepEqual(
      installed.map((r) => r.version),
      versions,
    );
    await db.query(business);
    assert.deepEqual(await fixture(), before);
    const { rows: protection } = await db.query(`
      SELECT
        count(*)::int AS tables,
        count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)::int AS forced,
        has_table_privilege('abasong_api','abasong.access_secrets','SELECT') AS api_read,
        has_table_privilege('abasong_worker','abasong.access_secrets','SELECT') AS worker_read,
        has_table_privilege('abasong_sensitive','abasong.access_secrets','SELECT') AS sensitive_read
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='abasong' AND c.relkind='r'
    `);
    assert(protection[0].tables > 0);
    assert.equal(protection[0].forced, protection[0].tables);
    assert.equal(protection[0].api_read, false);
    assert.equal(protection[0].worker_read, false);
    assert.equal(protection[0].sensitive_read, true);
    const p: PilotAdmission = {
      operation_id: randomUUID(),
      users: [randomUUID(), randomUUID()],
      valid_until: new Date(Date.now() + 3600000).toISOString(),
      operator_sha256: "a".repeat(64),
      project: "mxlmemaunzoramgemiju",
      environment: "pilot-dev",
    };
    await assert.rejects(db.query(pilotAdmissionSql(p)));
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM abasong.capabilities"))
        .rows[0].n,
      0,
    );
    await db.query(
      "INSERT INTO auth.users SELECT u,now() FROM unnest($1::uuid[]) u",
      [p.users],
    );
    await db.query("INSERT INTO abasong.users(id) SELECT unnest($1::uuid[])", [
      p.users,
    ]);
    await db.query(
      "INSERT INTO abasong.profiles(user_id,display_name) SELECT u,'TEST local admission' FROM unnest($1::uuid[]) u",
      [p.users],
    );
    await assert.rejects(
      db.query(
        pilotAdmissionSql({
          ...p,
          valid_until: new Date(Date.now() + 3 * 3600000).toISOString(),
        }),
      ),
    );
    await db.query(pilotAdmissionSql(p));
    await db.query(pilotAdmissionSql(p));
    const capabilities = (
      await db.query(
        "SELECT capability,count(*)::int AS n FROM abasong.capabilities GROUP BY capability ORDER BY capability",
      )
    ).rows;
    assert.deepEqual(capabilities, [
      { capability: "access.contribute", n: 2 },
      { capability: "access.read", n: 2 },
    ]);
    await assert.rejects(
      db.query(pilotAdmissionSql({ ...p, operator_sha256: "b".repeat(64) })),
    );
    await assert.rejects(
      db.query(pilotAdmissionSql({ ...p, operation_id: randomUUID() })),
    );
    await db.query("UPDATE abasong.capabilities SET revoked_at=now()");
    await db.query(pilotAdmissionSql(p));
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM abasong.capabilities WHERE revoked_at IS NULL",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM abasong.access_records"))
        .rows[0].n,
      0,
    );
    console.log(
      `PASS: isolated PostgreSQL upgraded ${pilotBaseline} to ${versions.at(-1)} (${migrations.length - baseline} migrations). Pilot public fixture and policy preserved, ${protection[0].forced} tables force RLS, restricted secret grants and admission replay/revocation checks passed.`,
    );
  } finally {
    await db?.end();
    if (created) {
      assert(/^abasong_cloud_bootstrap_test_[a-f0-9]{16}$/.test(name));
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
    await admin.end();
  }
}
void main().catch(() => {
  console.error(
    "Isolated bootstrap verification failed; no private details printed.",
  );
  process.exitCode = 1;
});
