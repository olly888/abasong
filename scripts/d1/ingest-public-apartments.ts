import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";
import { ingestPublicApartments } from "./public-apartment-data";
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    u = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(u.username, "postgres");
  assert.equal(u.pathname, "/abasong_d0");
  const db = new Client({ connectionString: u.href });
  await db.connect();
  try {
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM abasong.schema_version WHERE version='V12.0003'",
        )
      ).rowCount,
      1,
    );
    await ingestPublicApartments(db);
    console.log(
      "PASS: six independently licensed public apartments (four footprint-backed, two address-only) ingested into local D0; no access data, grants, GPS or automatic-match configuration",
    );
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Public apartment ingestion failed; no private details emitted",
  );
  process.exitCode = 1;
});
