import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { Client } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";
import { cloudBusinessSql } from "./business-data";
import { pilotAdmissionSql, type PilotAdmission } from "./pilot-admission";
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
    for (const f of readdirSync("database/migrations")
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort())
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
      "PASS: real isolated PostgreSQL business/admission initialization, rollback, replay, expiry bounds, no role escalation and no replay reactivation; simulated local identities only.",
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
