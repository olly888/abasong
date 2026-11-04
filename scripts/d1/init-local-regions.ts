import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import assert from "node:assert/strict";
import { localTarget } from "../d0/database-target";
// Product-defined service areas with approximate city display points. These are
// not driver positions, building addresses or copied map-provider results.
const regions = [
  ["d2000001-0000-4000-8000-000000000001", "Los Angeles", -118.24, 34.05],
  ["d2000001-0000-4000-8000-000000000002", "Pasadena", -118.14, 34.15],
  ["d2000001-0000-4000-8000-000000000003", "City of Industry", -117.96, 34.02],
  ["d2000001-0000-4000-8000-000000000004", "West Covina", -117.94, 34.07],
  ["d2000001-0000-4000-8000-000000000005", "El Monte", -118.03, 34.07],
  ["d2000001-0000-4000-8000-000000000006", "Chino", -117.69, 34.01],
] as const;
async function main() {
  const env = parseEnv(readFileSync(".env", "utf8")),
    target = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(target.username, "postgres");
  assert.equal(target.pathname, "/abasong_d0");
  const db = new Client({ connectionString: target.href });
  await db.connect();
  try {
    await db.query("BEGIN");
    for (const [id, label, lng, lat] of regions) {
      await db.query(
        "INSERT INTO abasong.regions(id,label,display_point) VALUES($1,$2,extensions.ST_SetSRID(extensions.ST_MakePoint($3,$4),4326)::extensions.geography) ON CONFLICT(id) DO NOTHING",
        [id, label, lng, lat],
      );
      const row = (
        await db.query(
          "SELECT label=$2 AND timezone='America/Los_Angeles' AND extensions.ST_DWithin(display_point,extensions.ST_SetSRID(extensions.ST_MakePoint($3,$4),4326)::extensions.geography,1) AS matches FROM abasong.regions WHERE id=$1",
          [id, label, lng, lat],
        )
      ).rows[0];
      assert.equal(
        row.matches,
        true,
        "Existing region differs; preserve and review",
      );
    }
    await db.query("COMMIT");
    console.log(
      "Six local D0 service-area labels ready; no cloud, driver position, account grant or request fixture writes.",
    );
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}
void main().catch(() => {
  console.error(
    "Local service area initialization refused; private details omitted.",
  );
  process.exitCode = 1;
});
