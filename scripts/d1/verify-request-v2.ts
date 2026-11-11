import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import {
  laDate,
  prepareV2Publication,
} from "../../apps/api/src/requests/request-v2-input";

// Called only inside verify-requests-api's freshly created, disposable local DB.
// Never takes a URL or obtains a connection to the persistent D0/cloud database.
export async function verifyV2Upgrade(db: Client, migration: string) {
  const owner = randomUUID(),
    id = randomUUID();
  await db.query("INSERT INTO abasong.users(id) VALUES($1)", [owner]);
  await db.query(
    "INSERT INTO abasong.requests(id,publisher_id,kind) VALUES($1,$2,'vehicle_help')",
    [id, owner],
  );
  const snapshot = {
    kind: "vehicle_help",
    parcel_count: null,
    marker: "TEST historical unchanged",
  };
  await db.query(
    "INSERT INTO abasong.request_versions(request_id,version,snapshot,actor_id) VALUES($1,1,$2,$3)",
    [id, snapshot, owner],
  );
  const before = (
    await db.query(
      "SELECT to_jsonb(r) AS value FROM abasong.requests r WHERE id=$1",
      [id],
    )
  ).rows[0].value;
  await db.query(migration);
  const after = (
    await db.query(
      "SELECT to_jsonb(r) AS value FROM abasong.requests r WHERE id=$1",
      [id],
    )
  ).rows[0].value;
  for (const [key, value] of Object.entries(before))
    assert.deepEqual(after[key], value);
  assert.equal(after.request_schema_version, 1);
  for (const key of [
    "scenario",
    "quantity_mode",
    "task_scope",
    "handoff_mode",
    "handoff_date",
    "completion_mode",
    "pickup_kind",
    "pickup_address_version",
  ])
    assert.equal(after[key], null);
  assert.deepEqual(
    (
      await db.query(
        "SELECT snapshot FROM abasong.request_versions WHERE request_id=$1",
        [id],
      )
    ).rows[0].snapshot,
    snapshot,
  );
  return 3; // unchanged old columns, explicit legacy/null fields, unchanged snapshot.
}

export async function verifyPickupProvenanceUpgrade(
  db: Client,
  migration: string,
) {
  const owner = randomUUID(),
    id = randomUUID();
  await db.query("INSERT INTO abasong.users(id) VALUES($1)", [owner]);
  await db.query(
    "INSERT INTO abasong.requests(id,publisher_id,kind,request_schema_version,scenario) VALUES($1,$2,'extra_drivers',2,'warehouse_shortage')",
    [id, owner],
  );
  await db.query(
    "INSERT INTO abasong.request_pickup_addresses(request_id,address_version,address_line1,city,state,address_confirmed) VALUES($1,1,'100 TEST Legacy Ave','TEST City','CA',true)",
    [id],
  );
  const before = (
    await db.query(
      "SELECT to_jsonb(p) AS value FROM abasong.request_pickup_addresses p WHERE request_id=$1",
      [id],
    )
  ).rows[0].value;
  await db.query(migration);
  const after = (
    await db.query(
      "SELECT to_jsonb(p) AS value FROM abasong.request_pickup_addresses p WHERE request_id=$1",
      [id],
    )
  ).rows[0].value;
  for (const [key, value] of Object.entries(before))
    assert.deepEqual(after[key], value);
  assert.equal(after.address_source, "legacy_unclassified");
  return 2;
}

export async function verifyV2Storage(
  db: Client,
  actor: { owner: string; reader: string; region: string; pickup: string },
) {
  let checks = 0;
  const equal = (actual: unknown, expected: unknown) => {
    assert.deepEqual(actual, expected);
    checks++;
  };
  async function fail(
    sql: string,
    values: unknown[],
    expected: string,
    constraint?: string,
  ) {
    await db.query("SAVEPOINT v2_denied");
    let code: unknown;
    try {
      await db.query(sql, values);
      if (constraint)
        await db.query(`SET CONSTRAINTS abasong.${constraint} IMMEDIATE`);
    } catch (e) {
      code = (e as { code?: string }).code;
    }
    await db.query("ROLLBACK TO SAVEPOINT v2_denied");
    await db.query("RELEASE SAVEPOINT v2_denied");
    if (code !== expected)
      console.error(
        "V2 SQLSTATE mismatch",
        expected,
        /^[A-Z0-9]{5}$/.test(String(code)) ? code : "none",
      );
    equal(code, expected);
  }
  async function asRole(
    role: "abasong_api" | "abasong_worker" | "abasong_sensitive",
    user: string | null,
    run: () => Promise<void>,
  ) {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('abasong.actor_id',$1,true)", [
      user ?? "",
    ]);
    try {
      await run();
    } finally {
      await db.query("RESET ROLE");
    }
  }
  const now = Date.now(),
    start = new Date(now + 86400000).toISOString();
  const p = prepareV2Publication(
    {
      request_schema_version: 2,
      scenario: "warehouse_shortage",
      task_scope: "partial",
      region_id: actor.region,
      pickup_region_id: actor.pickup,
      carrier: "TEST V2",
      quantity_mode: "unknown",
      parcel_count: null,
      drivers_needed: 2,
      handoff_mode: "scheduled",
      handoff_date: laDate(Date.parse(start)),
      starts_at: start,
      completion_mode: "contact",
      pickup: { kind: "contact_handoff" },
      price_unit: "negotiable",
      sorted_state: "unknown",
      handoff_requirement: "contact_confirm",
    },
    now,
  );
  const requestId = randomUUID();
  const row = {
    id: requestId,
    publisher_id: actor.owner,
    kind: p.kind,
    status: "draft",
    request_schema_version: 2,
    scenario: p.scenario,
    task_scope: p.task_scope,
    quantity_mode: p.quantity_mode,
    handoff_mode: p.handoff_mode,
    handoff_date: p.handoff_date,
    completion_mode: p.completion_mode,
    region_id: actor.region,
    pickup_region_id: actor.pickup,
    pickup_area: "TEST pickup region",
    carrier: p.carrier,
    starts_at: p.starts_at,
    expires_at: p.expires_at,
    drivers_needed: p.drivers_needed,
    remaining_drivers: p.remaining_drivers,
    price_unit: p.price_unit,
    sorted_state: p.sorted_state,
    handoff_requirement: p.handoff_requirement,
    pickup_kind: "warehouse",
    pickup_address_version: 1,
  };
  const fields = Object.keys(row),
    values = Object.values(row);
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO abasong.requests(${fields.join(",")}) VALUES(${fields.map((_, i) => "$" + (i + 1)).join(",")})`,
      values,
    );
    const privateRead = async (
      user: string | null,
      expected: number,
      version?: number,
    ) =>
      asRole("abasong_api", user, async () => {
        const r = await db.query(
          "SELECT address_line1 FROM abasong.request_pickup_addresses WHERE request_id=$1 AND ($2::integer IS NULL OR address_version=$2)",
          [requestId, version ?? null],
        );
        equal(r.rowCount, expected);
      });
    const insertAddress =
      "INSERT INTO abasong.request_pickup_addresses(request_id,address_version,address_line1,city,state,address_confirmed) VALUES($1,$2,'100 TEST Warehouse Ave','TEST City','CA',$3)";
    await asRole("abasong_api", actor.reader, async () =>
      fail(insertAddress, [requestId, 1, false], "42501"),
    );
    await asRole("abasong_api", actor.owner, async () => {
      await db.query(insertAddress, [requestId, 1, false]);
      await fail(
        "UPDATE abasong.request_pickup_addresses SET city='TEST forged' WHERE request_id=$1",
        [requestId],
        "42501",
      );
      await fail(
        "DELETE FROM abasong.request_pickup_addresses WHERE request_id=$1",
        [requestId],
        "42501",
      );
      await fail(
        "UPDATE abasong.requests SET status='open' WHERE id=$1",
        [requestId],
        "23514",
        "request_pickup_confirmed",
      );
      await db.query(insertAddress, [requestId, 2, true]);
      await db.query(
        "UPDATE abasong.requests SET pickup_address_version=2,status='open' WHERE id=$1",
        [requestId],
      );
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");
      equal(
        (
          await db.query(
            "SELECT parcel_count,remaining_parcels FROM abasong.requests WHERE id=$1",
            [requestId],
          )
        ).rows[0],
        { parcel_count: null, remaining_parcels: null },
      );
    });
    await privateRead(null, 0);
    await privateRead(randomUUID(), 0);
    await privateRead(actor.owner, 2);
    await privateRead(actor.reader, 1);
    await privateRead(actor.reader, 0, 1);
    for (const role of ["abasong_worker", "abasong_sensitive"] as const)
      await asRole(role, actor.owner, async () =>
        fail(
          "SELECT * FROM abasong.request_pickup_addresses WHERE request_id=$1",
          [requestId],
          "42501",
        ),
      );
    const grants = (
      await db.query(
        "SELECT has_table_privilege('abasong_api','abasong.request_pickup_addresses','UPDATE') AS update, has_table_privilege('abasong_api','abasong.request_pickup_addresses','DELETE') AS delete",
      )
    ).rows[0];
    equal(grants, { update: false, delete: false });
    equal(
      (
        await db.query(
          "SELECT relrowsecurity AND relforcerowsecurity AS protected FROM pg_class WHERE oid='abasong.request_pickup_addresses'::regclass",
        )
      ).rows[0].protected,
      true,
    );
    for (const role of ["anon", "authenticated"]) {
      if (
        (await db.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]))
          .rowCount
      )
        equal(
          (
            await db.query(
              "SELECT has_table_privilege($1,'abasong.request_pickup_addresses','SELECT') AS granted",
              [role],
            )
          ).rows[0].granted,
          false,
        );
    }
    for (const sql of [
      "UPDATE abasong.requests SET parcel_count=0 WHERE id=$1",
      "UPDATE abasong.requests SET parcel_count=10 WHERE id=$1",
      "UPDATE abasong.requests SET minimum_parcels=1 WHERE id=$1",
      "UPDATE abasong.requests SET quantity_mode='estimate',parcel_count=10,remaining_parcels=2 WHERE id=$1",
      "UPDATE abasong.requests SET quantity_mode='exact',parcel_count=10,remaining_parcels=11 WHERE id=$1",
      "UPDATE abasong.requests SET task_scope='whole_route',accepts_partial=false WHERE id=$1",
      "UPDATE abasong.requests SET scenario=NULL WHERE id=$1",
      "UPDATE abasong.requests SET drivers_needed=NULL WHERE id=$1",
      "UPDATE abasong.requests SET pickup_kind='contact_handoff' WHERE id=$1",
      "UPDATE abasong.requests SET handoff_date=handoff_date+1 WHERE id=$1",
      "UPDATE abasong.requests SET delivery_deadline_at=starts_at WHERE id=$1",
    ])
      await fail(sql, [requestId], "23514");
    await db.query("SAVEPOINT estimate_is_not_cap");
    await db.query(
      "UPDATE abasong.requests SET quantity_mode='estimate',parcel_count=10,minimum_parcels=20 WHERE id=$1",
      [requestId],
    );
    equal(
      (
        await db.query(
          "SELECT remaining_parcels FROM abasong.requests WHERE id=$1",
          [requestId],
        )
      ).rows[0].remaining_parcels,
      null,
    );
    await db.query("ROLLBACK TO SAVEPOINT estimate_is_not_cap");
    const other = randomUUID();
    await db.query("SAVEPOINT cross_request");
    await db.query("SET CONSTRAINTS ALL DEFERRED");
    await db.query(
      "INSERT INTO abasong.requests(id,publisher_id,kind,request_schema_version,scenario,pickup_kind,pickup_address_version) VALUES($1,$2,'extra_drivers',2,'warehouse_shortage','warehouse',2)",
      [other, actor.owner],
    );
    await fail(
      "SET CONSTRAINTS abasong.requests_pickup_same_request IMMEDIATE",
      [],
      "23503",
    );
    await db.query("ROLLBACK TO SAVEPOINT cross_request");
    await db.query("RELEASE SAVEPOINT cross_request");
    for (const sql of [
      "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
      "UPDATE abasong.users SET status='suspended' WHERE id=$1",
    ]) {
      await db.query("SAVEPOINT visibility");
      await db.query(
        sql,
        sql.startsWith("INSERT") ? [actor.reader, actor.owner] : [actor.reader],
      );
      await privateRead(actor.reader, 0);
      await db.query("ROLLBACK TO SAVEPOINT visibility");
    }
    await db.query("SAVEPOINT draft_visibility");
    await db.query("UPDATE abasong.requests SET status='draft' WHERE id=$1", [
      requestId,
    ]);
    await privateRead(actor.reader, 0);
    await db.query("ROLLBACK TO SAVEPOINT draft_visibility");
    await db.query("SAVEPOINT worker_expiry");
    await asRole("abasong_worker", null, async () => {
      await db.query(
        "UPDATE abasong.requests SET status='expired' WHERE id=$1",
        [requestId],
      );
      await db.query("SET CONSTRAINTS ALL IMMEDIATE");
      equal(
        (
          await db.query("SELECT status FROM abasong.requests WHERE id=$1", [
            requestId,
          ])
        ).rows[0].status,
        "expired",
      );
    });
    await db.query("ROLLBACK TO SAVEPOINT worker_expiry");
    const source = randomUUID();
    await db.query(
      "INSERT INTO abasong.data_sources(id,source_type,license_reference,persistent_use_approved) VALUES($1,'provider_permanent','TEST permission fixture',true)",
      [source],
    );
    const locatedAddress =
      "INSERT INTO abasong.request_pickup_addresses(request_id,address_version,address_line1,city,state,address_confirmed,point,source_id) VALUES($1,$2,'100 TEST Warehouse Ave','TEST City','CA',true,'SRID=4326;POINT(-118.2437 34.0522)'::extensions.geography,$3)";
    await asRole("abasong_api", actor.owner, async () =>
      fail(locatedAddress, [requestId, 3, source], "23514"),
    );
    await db.query(
      "UPDATE abasong.data_sources SET verified_at=now() WHERE id=$1",
      [source],
    );
    await asRole("abasong_api", actor.owner, async () => {
      await db.query(locatedAddress, [requestId, 3, source]);
      equal(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM abasong.request_pickup_addresses WHERE request_id=$1",
            [requestId],
          )
        ).rows[0].n,
        3,
      );
    });
    await db.query(
      "UPDATE abasong.data_sources SET expires_at=now()-interval '1 hour' WHERE id=$1",
      [source],
    );
    await asRole("abasong_api", actor.owner, async () =>
      fail(locatedAddress, [requestId, 4, source], "23514"),
    );
    const providerText =
      "INSERT INTO abasong.request_pickup_addresses(request_id,address_version,address_line1,city,state,address_confirmed,address_source,source_id) VALUES($1,4,'100 TEST Provider Ave','TEST City','CA',true,'provider_permanent',$2)";
    await asRole("abasong_api", actor.owner, async () => {
      await fail(providerText, [requestId, null], "23514");
      await fail(providerText, [requestId, source], "23514");
      await fail(
        "INSERT INTO abasong.request_pickup_addresses(request_id,address_version,address_source) VALUES($1,4,'legacy_unclassified')",
        [requestId],
        "42501",
      );
    });
    await db.query(
      "UPDATE abasong.data_sources SET expires_at=NULL,source_type='own_field' WHERE id=$1",
      [source],
    );
    await asRole("abasong_api", actor.owner, async () =>
      fail(providerText, [requestId, source], "23514"),
    );
    await db.query(
      "UPDATE abasong.data_sources SET source_type='provider_permanent' WHERE id=$1",
      [source],
    );
    await asRole("abasong_api", actor.owner, async () => {
      await db.query(providerText, [requestId, source]);
      equal(
        (
          await db.query(
            "SELECT point IS NULL AS no_point,address_source FROM abasong.request_pickup_addresses WHERE request_id=$1 AND address_version=4",
            [requestId],
          )
        ).rows[0],
        { no_point: true, address_source: "provider_permanent" },
      );
    });
    // Unknown pre-0016 origin is auditable by its owner but cannot be newly published.
    await db.query(
      "INSERT INTO abasong.request_pickup_addresses(request_id,address_version,address_line1,city,state,address_confirmed,address_source) VALUES($1,5,'100 TEST Legacy Ave','TEST City','CA',true,'legacy_unclassified')",
      [requestId],
    );
    await privateRead(actor.owner, 1, 5);
    await fail(
      "UPDATE abasong.requests SET pickup_address_version=5 WHERE id=$1",
      [requestId],
      "23514",
      "request_pickup_confirmed",
    );
    await db.query("SAVEPOINT historical_origin");
    await db.query(
      "ALTER TABLE abasong.requests DISABLE TRIGGER request_pickup_confirmed",
    );
    await db.query(
      "UPDATE abasong.requests SET pickup_address_version=5 WHERE id=$1",
      [requestId],
    );
    await privateRead(actor.reader, 0, 5);
    await db.query("ROLLBACK TO SAVEPOINT historical_origin");
    await db.query("COMMIT");
    return { checks, requestId };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
