import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { assessHomeArrival } from "../../apps/mobile/src/apartments/arrival-policy";
import {
  ingestPublicApartments,
  publicApartmentId,
  publicExpansion,
} from "./public-apartment-data";

type S = components["schemas"];
type Request = (
  method: string,
  path: string,
  auth: string | undefined,
  status: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;

// The caller owns an isolated, disposable local database and synthetic users.
// Public building geometry is real; observations and access values are TEST only.
export async function verifyPublicArrival(
  db: Client,
  req: Request,
  contributor: string,
  readerWithoutCapability: string,
) {
  await ingestPublicApartments(db);
  const configuration = {
    radius_m: 150,
    max_age_seconds: 120,
    future_tolerance_seconds: 15,
    max_accuracy_m: 100,
    auto_match: {
      enabled: true,
      evidence_ref: "ISOLATED-PUBLIC-GEOMETRY-TEST-NOT-FIELD",
      max_accuracy_m: 20,
    },
  };
  await db.query(
    "UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve}',$1::jsonb) WHERE version=1",
    [JSON.stringify(configuration)],
  );
  const ids = [publicApartmentId, ...publicExpansion.map((s) => s.id)];
  const samples = (
    await db.query<{ id: string; boundary: boolean; lng: number; lat: number }>(
      `SELECT id,boundary IS NOT NULL AS boundary,extensions.ST_X(point::extensions.geometry) AS lng,
     extensions.ST_Y(point::extensions.geometry) AS lat FROM abasong.apartments WHERE id=ANY($1::uuid[])`,
      [ids],
    )
  ).rows;
  assert.equal(samples.length, 6);
  assert.equal(samples.filter((s) => s.boundary).length, 4);
  const now = Date.now();
  const fix = (s: (typeof samples)[number], at = now) => ({
    point: { lng: s.lng, lat: s.lat },
    observed_at: new Date(at).toISOString(),
    accuracy_m: 2,
    accuracy_permission: "precise",
  });
  for (const sample of samples) {
    const result = (await req(
      "POST",
      "/v1/apartments/resolve",
      contributor,
      200,
      fix(sample),
    )) as S["ResolveResult"];
    assert(result.candidates.some((p) => p.id === sample.id));
    if (!sample.boundary) assert.equal(result.matched_id, null);
    const context = (await req(
      "GET",
      `/v1/apartments/${sample.id}/map-context`,
      contributor,
      200,
    )) as S["ApartmentMapContext"];
    assert.equal(context.apartment_id, sample.id);
    assert.equal(context.buildings.length > 0, sample.boundary);
    const empty = (await req(
      "GET",
      `/v1/apartments/${sample.id}/access-records`,
      contributor,
      200,
    )) as S["AccessList"];
    assert.deepEqual(empty.items, []);
  }
  const sample = samples.find((s) => s.id === publicApartmentId)!;
  const firstResult = (await req(
    "POST",
    "/v1/apartments/resolve",
    contributor,
    200,
    fix(sample, now - 9000),
  )) as S["ResolveResult"];
  assert.equal(firstResult.matched_id, publicApartmentId);
  const first = assessHomeArrival(
    null,
    undefined,
    firstResult,
    now - 9000,
    now - 9000,
    false,
  );
  assert.equal(first.apartment, null);
  const secondResult = (await req(
    "POST",
    "/v1/apartments/resolve",
    contributor,
    200,
    fix(sample),
  )) as S["ResolveResult"];
  const arrived = assessHomeArrival(
    first.state,
    undefined,
    secondResult,
    now,
    now,
    false,
  );
  assert.equal(arrived.apartment?.id, publicApartmentId);
  const context = (await req(
    "GET",
    `/v1/apartments/${publicApartmentId}/map-context`,
    contributor,
    200,
  )) as S["ApartmentMapContext"];
  assert.equal(context.buildings[0]?.street_number, "300");
  const path = `/v1/apartments/${publicApartmentId}/access-records`;
  // A real contribution transaction populates the empty card without operator review.
  const value = "TEST-PUBLIC-ARRIVAL";
  await req(
    "POST",
    path,
    contributor,
    201,
    {
      method: "keypad",
      value,
      scope: { label: "TEST only" },
      source_attested: true,
    },
    randomUUID(),
  );
  const codes = (await req("GET", path, contributor, 200)) as S["AccessList"];
  assert.equal(codes.items.length, 1);
  assert.equal(codes.items[0]?.value, value);
  await req("GET", path, readerWithoutCapability, 403);
  const departureResult = (await req(
    "POST",
    "/v1/apartments/resolve",
    contributor,
    200,
    { ...fix(sample), point: { lng: 0, lat: 0 } },
  )) as S["ResolveResult"];
  assert.equal(
    assessHomeArrival(
      arrived.state,
      sample.id,
      departureResult,
      now + 2000,
      now + 2000,
      false,
    ).clearAutomaticCard,
    true,
  );
  const imprecise = (await req(
    "POST",
    "/v1/apartments/resolve",
    contributor,
    200,
    { ...fix(sample), accuracy_m: 1000 },
  )) as S["ResolveResult"];
  assert.equal(
    assessHomeArrival(
      arrived.state,
      sample.id,
      imprecise,
      now + 2000,
      now + 2000,
      false,
    ).clearAutomaticCard,
    true,
  );
  const stale = (await req(
    "POST",
    "/v1/apartments/resolve",
    contributor,
    200,
    fix(sample, now - 180000),
  )) as S["ResolveResult"];
  assert.equal(stale.status, "stale_location");
  assert.equal(
    assessHomeArrival(arrived.state, sample.id, stale, now - 180000, now, false)
      .clearAutomaticCard,
    true,
  );
}
