import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { Client, Pool } from "pg";
import type { components } from "../../packages/contracts/src/generated";
type S = components["schemas"];
type Actor = { userId: string; issuedAt: number };
interface Service {
  contributeAddress(
    a: Actor,
    b: S["AddressContributionInput"],
    key: string,
    permanent?: { point: S["Point"]; address: S["SearchAddress"] },
  ): Promise<S["AddressContributionResult"]>;
  findConfirmedAddress(
    a: Actor,
    b: S["SearchAddress"],
  ): Promise<S["Apartment"][]>;
  discoverCatalog(a: Actor, p: S["Point"]): Promise<S["NearbyCandidate"][]>;
  readShared(
    a: Actor,
    id: string,
    q: Record<string, unknown>,
  ): Promise<S["AccessList"]>;
}
import { localTarget } from "../d0/database-target";
export async function verifyNearby(db: Client, url: string, issuedAt: number) {
  const target = new URL(url),
    guard = new URL(target);
  guard.pathname = "/abasong_d0";
  localTarget(guard.href);
  assert(
    /^abasong_d1_library_test_[a-f0-9]{16}$/.test(target.pathname.slice(1)),
  );
  const pool = new Pool({ connectionString: target.href, max: 3 }),
    require = createRequire(__filename);
  const { ApartmentsService } =
    require("../../apps/api/dist/apartments/apartments.service.js") as {
      ApartmentsService: new (db: {
        connect: () => ReturnType<Pool["connect"]>;
      }) => Service;
    };
  const before = {
    key: process.env.LOCAL_DATA_KEK,
    provider: process.env.DATA_ENCRYPTION_PROVIDER,
    retention: process.env.IDEMPOTENCY_RETENTION_SECONDS,
  };
  process.env.LOCAL_DATA_KEK = randomBytes(32).toString("hex");
  process.env.DATA_ENCRYPTION_PROVIDER = "local-development";
  process.env.IDEMPOTENCY_RETENTION_SECONDS = "3600";
  const actor = randomUUID();
  await db.query("INSERT INTO abasong.users(id) VALUES($1)", [actor]);
  const service = new ApartmentsService({ connect: () => pool.connect() }),
    identity = { userId: actor, issuedAt };
  try {
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.contribute','TEST nearby')",
      [actor],
    );
    const address = {
        address_line1: "100 TEST Nearby Ave",
        city: "TEST Nearby City",
        state: "CA",
        postal_code: null,
      },
      body = {
        address,
        method: "keypad" as const,
        value: "TEST-NEARBY#",
        scope: { label: "TEST Gate" },
        source_attested: true as const,
        address_confirmed: true as const,
      },
      permanent = { point: { lng: -118.3, lat: 34.2 }, address },
      key = randomUUID();
    const result = await service.contributeAddress(
      identity,
      body,
      key,
      permanent,
    );
    assert.equal(result.contribution.outcome, "created_active");
    assert.equal(result.apartment.confidence, "unverified");
    assert.deepEqual(
      await service.contributeAddress(identity, body, key),
      result,
    );
    const second = await service.contributeAddress(
      identity,
      body,
      randomUUID(),
    );
    assert.equal(second.apartment.id, result.apartment.id);
    assert.equal(second.contribution.outcome, "same_value_validation");
    const pair = await Promise.all([
      service.contributeAddress(
        identity,
        { ...body, value: "TEST-SECOND#" },
        randomUUID(),
      ),
      service.contributeAddress(
        identity,
        { ...body, value: "TEST-SECOND#" },
        randomUUID(),
      ),
    ]);
    assert.equal(
      pair[0].contribution.record_id,
      pair[1].contribution.record_id,
    );
    await assert.rejects(
      service.contributeAddress(
        identity,
        { ...body, value: "TEST-CHANGED#" },
        key,
      ),
    );
    const found = await service.discoverCatalog(identity, {
      lng: -118.3,
      lat: 34.2,
    });
    assert.equal(
      found.filter((c) => c.apartment?.id === result.apartment.id).length,
      1,
    );
    assert.equal(found[0]?.distance_m, 0);
    assert.equal(JSON.stringify(found).includes("TEST-NEARBY#"), false);
    await db.query(
      "UPDATE abasong.apartments SET boundary=extensions.ST_GeomFromText('MULTIPOLYGON(((-118.2921 34.1999,-118.2919 34.1999,-118.2919 34.2001,-118.2921 34.2001,-118.2921 34.1999)))',4326) WHERE id=$1",
      [result.apartment.id],
    );
    const edge = await service.discoverCatalog(identity, {
      lng: -118.292,
      lat: 34.2,
    });
    assert.equal(
      edge.filter((c) => c.apartment?.id === result.apartment.id).length,
      1,
    );
    assert.equal(
      edge.find((c) => c.apartment?.id === result.apartment.id)?.distance_m,
      0,
    );

    const missing = { ...address, address_line1: "101 TEST Nearby Ave" };
    await assert.rejects(
      service.contributeAddress(
        identity,
        { ...body, address: missing },
        randomUUID(),
      ),
    );
    assert.equal(
      (await service.findConfirmedAddress(identity, missing)).length,
      0,
    );
    const reader = randomUUID();
    await db.query("INSERT INTO abasong.users(id) VALUES($1)", [reader]);
    await db.query(
      "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.read','TEST nearby reader')",
      [reader],
    );
    const records = await service.readShared(
      { userId: reader, issuedAt },
      result.apartment.id,
      {},
    );
    assert(records.items.some((r) => r.value === "TEST-NEARBY#"));
    await db.query(
      "UPDATE abasong.capabilities SET revoked_at=now() WHERE user_id=$1 AND capability='access.contribute'",
      [actor],
    );
    await assert.rejects(
      service.contributeAddress(identity, body, randomUUID(), permanent),
    );
    console.log(
      "PASS: nearby compiled service/PostGIS boundary discovery, direct address sharing, concurrency, idempotency, cross-account read and revoked permission",
    );
  } finally {
    await pool.end();
    for (const [key, value] of Object.entries({
      LOCAL_DATA_KEK: before.key,
      DATA_ENCRYPTION_PROVIDER: before.provider,
      IDEMPOTENCY_RETENTION_SECONDS: before.retention,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
