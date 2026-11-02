import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
// Only called inside the suite's disposable local database, before migration 8.
export async function prepareContributionBackfill(db: Client) {
  const owner = randomUUID(),
    other = randomUUID(),
    source = randomUUID(),
    apartment = randomUUID(),
    record = randomUUID(),
    withdrawn = randomUUID();
  await db.query("INSERT INTO abasong.users(id) VALUES($1),($2)", [
    owner,
    other,
  ]);
  await db.query(
    "INSERT INTO abasong.data_sources(id,source_type,license_reference,persistent_use_approved) VALUES($1,'own_field','TEST legacy source migration',true)",
    [source],
  );
  await db.query(
    "INSERT INTO abasong.apartments(id,address_line1,city,source_id,point,status) VALUES($1,'TEST legacy','TEST',$2,'SRID=4326;POINT(-118.25 34.05)'::extensions.geography,'active')",
    [apartment, source],
  );
  for (const [id, status] of [
    [record, "active"],
    [withdrawn, "withdrawn"],
  ])
    await db.query(
      "INSERT INTO abasong.access_records(id,apartment_id,contributor_id,method,scope_key,dedup_hmac,hmac_key_version,status,source_attested_at,contributed_at) VALUES($1,$2,$3,'keypad',$5,decode(repeat('ab',32),'hex'),'TEST legacy',$4,now(),'2026-10-28T10:00:00Z')",
      [id, apartment, owner, status, id],
    );
  await db.query(
    "INSERT INTO abasong.access_contributions(record_id,user_id,event_type,occurred_at) VALUES($1,$2,'created','2026-10-28T10:00:00Z'),($1,$3,'same_value_validation','2026-10-29T10:00:00Z'),($1,$3,'same_value_validation','2026-10-30T10:00:00Z')",
    [record, owner, other],
  );
  return async () => {
    const sources = (
      await db.query(
        "SELECT user_id,status,version,first_contributed_at FROM abasong.access_contribution_sources WHERE record_id=$1 ORDER BY first_contributed_at",
        [record],
      )
    ).rows;
    assert.equal(sources.length, 2);
    assert.equal(sources[0].user_id, owner);
    assert.equal(sources[1].user_id, other);
    assert.equal(
      sources[0].first_contributed_at.toISOString(),
      "2026-10-28T10:00:00.000Z",
    );
    assert.equal(
      sources[1].first_contributed_at.toISOString(),
      "2026-10-29T10:00:00.000Z",
    );
    assert(sources.every((s) => s.status === "active" && s.version === 1));
    assert.equal(
      (
        await db.query(
          "SELECT status FROM abasong.access_contribution_sources WHERE record_id=$1",
          [withdrawn],
        )
      ).rows[0].status,
      "withdrawn",
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM abasong.access_contributions WHERE record_id=$1 AND source_id IS NOT NULL AND source_version=1",
          [record],
        )
      ).rows[0].n,
      3,
    );
    await db.query(
      "DELETE FROM abasong.access_contributions WHERE record_id=ANY($1::uuid[])",
      [[record, withdrawn]],
    );
    await db.query(
      "DELETE FROM abasong.access_records WHERE id=ANY($1::uuid[])",
      [[record, withdrawn]],
    );
    await db.query("DELETE FROM abasong.apartments WHERE id=$1", [apartment]);
    await db.query("DELETE FROM abasong.data_sources WHERE id=$1", [source]);
    await db.query("DELETE FROM abasong.users WHERE id=ANY($1::uuid[])", [
      [owner, other],
    ]);
    console.log(
      "PASS: migration 0008 legacy creator/co-contributor backfill, earliest source time, unique source, withdrawn state and event links",
    );
  };
}
