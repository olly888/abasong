import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
  reader: string,
) {
  await ingestPublicApartments(db);
  const delMar = publicExpansion.find((s) => s.slug === "del-mar")!.id;
  for (const query of [
    "2445 E Del Mar Blvd, Pasadena",
    "2445 E Del Mar Blvd，Pasadena",
    "  2445   E Del Mar Blvd ,  Pasadena  ",
    "2445 E Del Mar Blvd, Pasadena, CA",
    "2445",
    "2445 E Del",
    "Del Mar Apart",
    "Del Mar Apartments",
    "Pasadena 2445",
  ]) {
    const result = (await req(
      "GET",
      "/v1/apartments?query=" + encodeURIComponent(query),
      readerWithoutCapability,
      200,
    )) as S["ApartmentPage"];
    assert(result.items.some((p) => p.id === delMar));
    assert(!JSON.stringify(result).includes("access_records"));
  }
  for (const query of [
    "2444 E Del Mar Blvd, Pasadena",
    "%%",
    "2445' OR true --",
  ]) {
    const result = (await req(
      "GET",
      "/v1/apartments?query=" + encodeURIComponent(query),
      contributor,
      200,
    )) as S["ApartmentPage"];
    assert.deepEqual(result.items, []);
  }
  // Inactive addresses must not reappear through broader token matching.
  await db.query(
    "UPDATE abasong.apartments SET status='withdrawn' WHERE id=$1",
    [delMar],
  );
  const hidden = (await req(
    "GET",
    "/v1/apartments?query=2445",
    contributor,
    200,
  )) as S["ApartmentPage"];
  assert(!hidden.items.some((p) => p.id === delMar));
  await db.query("UPDATE abasong.apartments SET status='active' WHERE id=$1", [
    delMar,
  ]);
  await req("GET", "/v1/apartments?query=2445", undefined, 401);
  const ids = [publicApartmentId, ...publicExpansion.map((s) => s.id)];
  const configuration = {
    radius_m: 150,
    max_age_seconds: 120,
    future_tolerance_seconds: 15,
    max_accuracy_m: 100,
    auto_match: {
      enabled: true,
      evidence_ref: "ISOLATED-PUBLIC-GEOMETRY-TEST-NOT-FIELD",
      max_accuracy_m: 20,
      scopes: ids.map((apartment_id) => ({
        apartment_id,
        match_bases: ["boundary"],
        evidence_ref: "ISOLATED-PUBLIC-GEOMETRY-TEST-NOT-FIELD",
        verified_at: new Date(Date.now() - 60_000).toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })),
    },
  };
  await db.query(
    "UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve}',$1::jsonb) WHERE version=1",
    [JSON.stringify(configuration)],
  );
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
  // Real public outlines include courtyards and gaps between buildings. Those
  // are not verified arrival areas. Test synthetic observations there through
  // the real service; buffering a whole property would create false matches.
  const holes = (
    await db.query<{ lng: number; lat: number }>(
      `WITH rings AS (
      SELECT (extensions.ST_DumpRings((extensions.ST_Dump(boundary)).geom)).*
      FROM abasong.apartments WHERE id=$1
    ), points AS (
      SELECT extensions.ST_PointOnSurface(geom) AS p FROM rings WHERE path[1]>0
    ) SELECT extensions.ST_X(p) AS lng,extensions.ST_Y(p) AS lat FROM points`,
      [delMar],
    )
  ).rows;
  assert.equal(
    holes.length,
    3,
    "Del Mar's three courtyard holes must survive ingestion",
  );
  const woodside = publicExpansion.find((s) => s.slug === "woodside-village")!;
  const dataset = JSON.parse(
    readFileSync("data/public-apartments/la-expansion.geojson", "utf8"),
  );
  const property = dataset.features[1].properties.property_area;
  const gap = (
    await db.query<{ lng: number; lat: number; clear: boolean }>(
      `WITH spaces AS (
      SELECT boundary,extensions.ST_PointOnSurface(extensions.ST_Difference(
        extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($2::text),4326),
        extensions.ST_Buffer(boundary::extensions.geography,5)::extensions.geometry
      )) AS p FROM abasong.apartments WHERE id=$1
    ) SELECT extensions.ST_X(p) AS lng,extensions.ST_Y(p) AS lat,
      NOT extensions.ST_DWithin(boundary::extensions.geography,p::extensions.geography,2) AS clear
      FROM spaces`,
      [woodside.id, JSON.stringify(property)],
    )
  ).rows[0]!;
  assert.equal(gap.clear, true);
  for (const point of [...holes, gap]) {
    const result = (await req("POST", "/v1/apartments/resolve", reader, 200, {
      point: { lng: point.lng, lat: point.lat },
      observed_at: new Date().toISOString(),
      accuracy_m: 2,
      accuracy_permission: "precise",
    })) as S["ResolveResult"];
    assert.equal(result.matched_id, null);
    assert.equal(
      assessHomeArrival(null, undefined, result, now, now, false, point)
        .apartment,
      null,
    );
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
    fix(sample).point,
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
    fix(sample).point,
  );
  assert.equal(arrived.apartment?.id, publicApartmentId);
  const updatePolicy = (auto: unknown) =>
    db.query(
      "UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve,auto_match}',$1::jsonb) WHERE version=1",
      [JSON.stringify(auto)],
    );
  const scoped = configuration.auto_match.scopes.find(
    (s) => s.apartment_id === sample.id,
  )!;
  for (const scopes of [
    undefined, // Legacy global enable is no longer enough.
    [],
    configuration.auto_match.scopes.filter((s) => s.apartment_id !== sample.id),
    [{ ...scoped, match_bases: ["entrance"] }], // Boundary evidence is separate.
    [
      {
        ...scoped,
        verified_at: new Date(now - 120_000).toISOString(),
        expires_at: new Date(now - 60_000).toISOString(),
      },
    ],
    [{ ...scoped, verified_at: new Date(now + 60_000).toISOString() }],
    [{ ...scoped, apartment_id: "*" }],
  ]) {
    await updatePolicy({ ...configuration.auto_match, scopes });
    const restricted = (await req(
      "POST",
      "/v1/apartments/resolve",
      reader,
      200,
      fix(sample),
    )) as S["ResolveResult"];
    assert.equal(restricted.matched_id, null);
    assert.equal(restricted.reason, "policy_disabled");
    assert(restricted.candidates.some((p) => p.id === sample.id));
    assert.equal(
      assessHomeArrival(
        arrived.state,
        sample.id,
        restricted,
        now + 1000,
        now + 1000,
        false,
        fix(sample).point,
      ).clearAutomaticCard,
      true,
    );
    assert.equal(
      assessHomeArrival(
        arrived.state,
        sample.id,
        restricted,
        now + 1000,
        now + 1000,
        true,
        fix(sample).point,
      ).clearAutomaticCard,
      false,
    );
    assert(!JSON.stringify(restricted).includes("evidence_ref"));
  }
  await updatePolicy(configuration.auto_match);
  await req("POST", "/v1/apartments/resolve", reader, 400, {
    ...fix(sample),
    auto_match: configuration.auto_match,
  });
  // A different authorized reader obtains the same real match; read eligibility
  // remains a separate endpoint permission rather than part of map recognition.
  const independentMatch = (await req(
    "POST",
    "/v1/apartments/resolve",
    reader,
    200,
    fix(sample),
  )) as S["ResolveResult"];
  assert.equal(independentMatch.matched_id, sample.id);
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
  // An independently authorized synthetic reader sees the contribution at the
  // matched apartment through the real encrypted-data endpoint, without review.
  const read = () => req("GET", path, reader, 200) as Promise<S["AccessList"]>;
  const firstRead = await read();
  const originalId = firstRead.items[0]?.id;
  assert.equal(firstRead.items[0]?.value, value);
  assert.equal(firstRead.items[0]?.effective_useful, false);
  assert.equal(firstRead.items[0]?.my_feedback, null);
  const originalTime = firstRead.items[0]?.contributed_at;
  await req(
    "POST",
    path,
    contributor,
    201,
    {
      method: "keypad",
      value: "TEST-PUBLIC-NEWER",
      scope: { label: "TEST only" },
      source_attested: true,
    },
    randomUUID(),
  );
  const newer = await read();
  assert.equal(newer.items[0]?.value, "TEST-PUBLIC-NEWER");
  const event = { client_event_id: randomUUID(), value: "useful" };
  const feedbackPath = `/v1/access-records/${originalId}/feedback`;
  await req("PUT", feedbackPath, readerWithoutCapability, 403, event);
  const accepted = await req("PUT", feedbackPath, reader, 200, event);
  assert.deepEqual(
    await req("PUT", feedbackPath, reader, 200, event),
    accepted,
  );
  const useful = await read();
  assert.equal(useful.items[0]?.id, originalId);
  assert.equal(useful.items[0]?.effective_useful, true);
  assert.equal(useful.items[0]?.my_feedback, "useful");
  assert.equal(useful.items[0]?.contributed_at, originalTime);
  const ownerView = (await req(
    "GET",
    path,
    contributor,
    200,
  )) as S["AccessList"];
  assert.equal(ownerView.items[0]?.id, originalId);
  assert.equal(ownerView.items[0]?.my_feedback, null);
  // Changing the same reader's verdict must not leave an obsolete useful rank.
  await req("PUT", feedbackPath, reader, 200, {
    client_event_id: randomUUID(),
    value: "not_useful",
  });
  const rejected = await read();
  assert.equal(rejected.items[0]?.value, "TEST-PUBLIC-NEWER");
  assert.equal(
    rejected.items.find((r) => r.id === originalId)?.my_feedback,
    "not_useful",
  );
  assert.equal(
    rejected.items.find((r) => r.id === originalId)?.contributed_at,
    originalTime,
  );
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
      { lng: 0, lat: 0 },
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
      fix(sample).point,
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
    assessHomeArrival(
      arrived.state,
      sample.id,
      stale,
      now - 180000,
      now,
      false,
      fix(sample).point,
    ).clearAutomaticCard,
    true,
  );
}
