import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { publicApartmentId, publicExpansion } from "./public-apartment-data";
type S = components["schemas"];
type Actor = { userId: string; issuedAt: number };
interface SpatialService {
  discoverCatalog(a: Actor, p: S["Point"]): Promise<S["NearbyCandidate"][]>;
  matchSearchAddress(
    a: Actor,
    address: S["SearchAddress"] | null,
    p: S["Point"],
  ): Promise<S["Apartment"][]>;
}
// Only called inside verifyNearby's guarded disposable database. Public
// footprints are licensed fixtures; all observations are synthetic, not GPS.
export async function verifyNearbyCoverage(
  db: Client,
  service: SpatialService,
  actor: Actor,
) {
  assert.match(
    (await db.query("SELECT current_database() AS name")).rows[0].name,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  let checks = 0;
  const failures: string[] = [];
  async function check(id: string, run: () => Promise<void>) {
    checks++;
    try {
      await run();
    } catch {
      failures.push(id);
    }
  }
  const ids = [publicApartmentId, ...publicExpansion.map((s) => s.id)];
  const samples = (
    await db.query<{
      id: string;
      address_line1: string;
      city: string;
      state: string;
      postal_code: string | null;
      lng: number;
      lat: number;
    }>(
      `SELECT id,address_line1,city,state,postal_code,
    extensions.ST_X(point::extensions.geometry) AS lng,
    extensions.ST_Y(point::extensions.geometry) AS lat
    FROM abasong.apartments WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [ids],
    )
  ).rows;
  assert.equal(samples.length, 6);
  for (const [i, sample] of samples.entries())
    await check(`PUBLIC-${i + 1}-POINT`, async () => {
      const found = await service.discoverCatalog(actor, sample);
      assert.equal(
        found.filter((c) => c.apartment?.id === sample.id).length,
        1,
      );
      assert(found.every((c) => c.distance_m >= 0 && c.distance_m <= 200));
    });
  // Ring points outside real roofs are nearby recommendations, not gates.
  const outside = (
    await db.query<{ id: string; lng: number; lat: number; distance: number }>(
      `
    WITH rings AS (
      SELECT id,boundary,extensions.ST_PointOnSurface(extensions.ST_Difference(
        extensions.ST_Buffer(boundary::extensions.geography,150)::extensions.geometry,
        extensions.ST_Buffer(boundary::extensions.geography,140)::extensions.geometry)) AS p
      FROM abasong.apartments WHERE id=ANY($1::uuid[]) AND boundary IS NOT NULL
    ) SELECT id,extensions.ST_X(p) AS lng,extensions.ST_Y(p) AS lat,
      extensions.ST_Distance(boundary::extensions.geography,p::extensions.geography) AS distance FROM rings`,
      [ids],
    )
  ).rows;
  assert.equal(outside.length, 4);
  for (const [i, point] of outside.entries())
    await check(`PUBLIC-${i + 1}-OUTSIDE`, async () => {
      assert(point.distance > 130 && point.distance < 155);
      assert.equal(
        (await service.discoverCatalog(actor, point)).filter(
          (c) => c.apartment?.id === point.id,
        ).length,
        1,
      );
    });
  const woodside = publicExpansion.find((s) => s.slug === "woodside-village")!;
  const roofs = (
    await db.query<{ lng: number; lat: number; center_distance: number }>(
      `
    WITH roofs AS (SELECT point,(extensions.ST_Dump(boundary)).geom AS roof
      FROM abasong.apartments WHERE id=$1), points AS (
      SELECT point,extensions.ST_PointOnSurface(roof) AS p FROM roofs)
    SELECT extensions.ST_X(p) AS lng,extensions.ST_Y(p) AS lat,
      extensions.ST_Distance(point,p::extensions.geography) AS center_distance
      FROM points ORDER BY center_distance DESC`,
      [woodside.id],
    )
  ).rows;
  assert.equal(roofs.length, 54);
  for (const [i, roof] of roofs.entries())
    await check(`WOODSIDE-ROOF-${i + 1}`, async () => {
      const found = await service.discoverCatalog(actor, roof);
      assert.equal(
        found.filter((c) => c.apartment?.id === woodside.id).length,
        1,
      );
      assert.equal(new Set(found.map((c) => c.key)).size, found.length);
    });
  const farRoof = roofs[0]!;
  const community = samples.find((s) => s.id === woodside.id)!;
  await check("WOODSIDE-SEARCH-LAST-ROOF", async () => {
    assert.deepEqual(
      (await service.matchSearchAddress(actor, community, farRoof)).map(
        (p) => p.id,
      ),
      [woodside.id],
    );
  });
  await check("WOODSIDE-SEARCH-WRONG-ADDRESS", async () => {
    assert.deepEqual(
      await service.matchSearchAddress(
        actor,
        { ...community, address_line1: "2549 Temple Ave" },
        farRoof,
      ),
      [],
    );
  });
  await check("RESEARCH-ONLY-NOT-INGESTED", async () => {
    const n = await db.query(
      "SELECT count(*)::int AS n FROM abasong.apartments WHERE name=ANY($1::text[])",
      [
        [
          "Acappella Pasadena",
          "AVA Pasadena",
          "Avalon Glendora",
          "Avalon Monrovia",
          "eaves Old Town Pasadena",
          "Avalon Pasadena",
        ],
      ],
    );
    assert.equal(n.rows[0].n, 0);
  });
  const origin = { lng: -118.01, lat: 34.42 };
  const source = randomUUID(),
    near = randomUUID(),
    far = randomUUID(),
    sibling = randomUUID();
  await db.query(
    `INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved,verified_at)
    VALUES($1,'own_field','synthetic','TEST coverage fixture',true,now()-interval '1 hour')`,
    [source],
  );
  for (const [id, number, distance] of [
    [near, "100", 199.8],
    [far, "102", 200.2],
    [sibling, "104", 20],
  ] as const)
    await db.query(
      `INSERT INTO abasong.apartments(id,name,address_line1,city,state,source_id,point,status)
      VALUES($1,'TEST coverage',$2,'TEST Coverage City','CA',$3,
      extensions.ST_Project(extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326)::extensions.geography,$6::double precision,0::double precision),'active')`,
      [
        id,
        number + " TEST Coverage Ave",
        source,
        origin.lng,
        origin.lat,
        distance,
      ],
    );
  await check("RADIUS-AND-ADJACENT", async () => {
    const found = await service.discoverCatalog(actor, origin);
    assert(found.some((c) => c.apartment?.id === near));
    assert(!found.some((c) => c.apartment?.id === far));
    assert(
      found.findIndex((c) => c.apartment?.id === sibling) <
        found.findIndex((c) => c.apartment?.id === near),
    );
  });
  await db.query(
    "UPDATE abasong.apartments SET status='withdrawn' WHERE id=$1",
    [sibling],
  );
  await check("INACTIVE-ADJACENT", async () => {
    assert(
      !(await service.discoverCatalog(actor, origin)).some(
        (c) => c.apartment?.id === sibling,
      ),
    );
  });
  const boundaryId = randomUUID(),
    footprintId = randomUUID(),
    buildingSource = randomUUID();
  await db.query(
    `INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved,verified_at)
    VALUES($1,'own_field','synthetic','TEST footprint source',true,now()-interval '1 hour')`,
    [buildingSource],
  );
  const shape = `extensions.ST_Multi(extensions.ST_Buffer(extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326)::extensions.geography,10)::extensions.geometry)`;
  for (const [id, boundary] of [
    [boundaryId, true],
    [footprintId, false],
  ] as const)
    await db.query(
      `INSERT INTO abasong.apartments(id,address_line1,city,state,source_id,point,boundary,status)
      VALUES($1,$2,'TEST Coverage City','CA',$3,
        extensions.ST_Project(extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326)::extensions.geography,600,0),${boundary ? shape : "NULL"},'active')`,
      [
        id,
        boundary ? "200 TEST Coverage Ave" : "202 TEST Coverage Ave",
        source,
        origin.lng,
        origin.lat,
      ],
    );
  const buildingId = randomUUID();
  await db.query(
    `INSERT INTO abasong.apartment_buildings(id,apartment_id,source_id,footprint,label_point,street_number,verified_at)
    VALUES($1,$2,$3,${shape},extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326),'202',now()-interval '1 hour')`,
    [buildingId, footprintId, buildingSource, origin.lng, origin.lat],
  );
  const has = async (id: string) =>
    (await service.discoverCatalog(actor, origin)).some(
      (c) => c.apartment?.id === id,
    );
  await check("VALID-GEOMETRY-FAR-CENTER", async () => {
    assert(await has(boundaryId));
    assert(await has(footprintId));
  });
  const childId = randomUUID();
  await db.query(
    `INSERT INTO abasong.apartments(id,parent_id,address_line1,city,state,source_id,point,status)
    VALUES($1,$2,'204 TEST Coverage Ave','TEST Coverage City','CA',$3,
      extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326)::extensions.geography,'active')`,
    [childId, boundaryId, source, origin.lng, origin.lat],
  );
  await check("INDEPENDENT-CHILD-ADDRESS", async () => {
    const found = await service.discoverCatalog(actor, origin);
    assert.equal(
      found.filter((c) => c.apartment?.id === boundaryId || c.apartment?.id === childId)
        .length,
      2,
    );
    assert.deepEqual(
      (
        await service.matchSearchAddress(
          actor,
          {
            address_line1: "204 TEST Coverage Ave",
            city: "TEST Coverage City",
            state: "CA",
            postal_code: null,
          },
          origin,
        )
      ).map((p) => p.id),
      [childId],
    );
  });
  for (const [id, number] of [
    [boundaryId, "200"],
    [footprintId, "202"],
  ] as const)
    await check(`LARGE-COMMUNITY-SEARCH-${number}`, async () => {
      assert.deepEqual(
        (
          await service.matchSearchAddress(
            actor,
            {
              address_line1: number + " TEST Coverage Ave",
              city: "TEST Coverage City",
              state: "CA",
              postal_code: null,
            },
            origin,
          )
        ).map((p) => p.id),
        [id],
      );
    });
  await db.query(
    "UPDATE abasong.data_sources SET expires_at=now()-interval '1 second' WHERE id=ANY($1::uuid[])",
    [[source, buildingSource]],
  );
  await check("EXPIRED-GEOMETRY-NOT-COVERAGE", async () => {
    assert(!(await has(boundaryId)));
    assert(!(await has(footprintId)));
  });
  await db.query(
    "UPDATE abasong.data_sources SET expires_at=NULL,verified_at=now()+interval '1 hour' WHERE id=ANY($1::uuid[])",
    [[source, buildingSource]],
  );
  await check("FUTURE-GEOMETRY-NOT-COVERAGE", async () => {
    assert(!(await has(boundaryId)));
    assert(!(await has(footprintId)));
  });
  await db.query(
    "UPDATE abasong.data_sources SET verified_at=now()-interval '1 hour' WHERE id=ANY($1::uuid[])",
    [[source, buildingSource]],
  );
  await db.query(
    "UPDATE abasong.apartment_buildings SET verified_at=now()+interval '1 hour' WHERE id=$1",
    [buildingId],
  );
  await check("FUTURE-BUILDING-NOT-COVERAGE", async () => {
    assert(!(await has(footprintId)));
  });
  await db.query(
    "UPDATE abasong.apartment_buildings SET verified_at=now()-interval '1 hour' WHERE id=$1",
    [buildingId],
  );
  await db.query(
    "UPDATE abasong.data_sources SET verified_at=NULL WHERE id=ANY($1::uuid[])",
    [[source, buildingSource]],
  );
  await check("UNVERIFIED-GEOMETRY-NOT-COVERAGE", async () => {
    assert(!(await has(boundaryId)));
    assert(!(await has(footprintId)));
  });
  await db.query(
    "UPDATE abasong.data_sources SET verified_at=now()-interval '1 hour' WHERE id=ANY($1::uuid[])",
    [[source, buildingSource]],
  );
  await db.query(
    `UPDATE abasong.apartments SET boundary=extensions.ST_GeomFromText(
    'MULTIPOLYGON(((-118.0101 34.4199,-118.0099 34.4201,-118.0101 34.4201,-118.0099 34.4199,-118.0101 34.4199)))',4326) WHERE id=$1`,
    [boundaryId],
  );
  await check("INVALID-BOUNDARY-NOT-COVERAGE", async () => {
    assert(!(await has(boundaryId)));
    assert(await has(footprintId));
  });
  await check("HOUSE-POINT-NO-CATALOG", async () => {
    assert.deepEqual(
      await service.discoverCatalog(actor, { lng: -118.02, lat: 34.43 }),
      [],
    );
  });
  console.log(
    JSON.stringify({ suite: "nearby-coverage", checks, failed: failures }),
  );
  assert.equal(
    failures.length,
    0,
    "Nearby coverage/matching failures; safe case IDs above",
  );
}
