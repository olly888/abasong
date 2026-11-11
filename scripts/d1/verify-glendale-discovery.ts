import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { mergeNearby } from "../../apps/mobile/src/apartments/nearby-policy";
import { exactApartment } from "../../apps/mobile/src/imports/match";
import type { components } from "../../packages/contracts/src/generated";

type S = components["schemas"];
type Request = (
  method: string,
  path: string,
  auth: string | undefined,
  status: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;

// Public leasing addresses and public CAMS/Census address points. Observation
// points are synthetic street-side probes, never measured GPS or verified gates.
const properties = [
  {
    name: "AMLI Lex on Orange",
    street: "321 N Orange St",
    point: { lng: -118.2567234, lat: 34.1510927 },
    approach: { lng: -118.25648, lat: 34.1511 },
  },
  {
    name: "Next on Lex",
    street: "275 W Lexington Dr",
    point: { lng: -118.2574956, lat: 34.1517689 },
    approach: { lng: -118.25752, lat: 34.15175 },
  },
  {
    name: "Altana",
    street: "633 N Central Ave",
    point: { lng: -118.2580063, lat: 34.1550017 },
    approach: { lng: -118.25804, lat: 34.15487 },
  },
];

export async function verifyGlendaleDiscovery(
  db: Client,
  req: Request,
  contributor: string,
  reader: string,
) {
  assert.match(
    (await db.query("SELECT current_database() AS name")).rows[0].name,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  const source = randomUUID();
  await db.query(
    "INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved) VALUES($1,'own_field','synthetic','isolated Glendale address fixtures',true)",
    [source],
  );
  const samples = properties.map((property) => ({
    ...property,
    id: randomUUID(),
  }));
  for (const sample of samples) {
    await db.query(
      `INSERT INTO abasong.apartments(id,name,address_line1,city,state,postal_code,source_id,point,status)
       VALUES($1,$2,$3,'Glendale','CA','91203',$4,extensions.ST_SetSRID(extensions.ST_MakePoint($5,$6),4326)::extensions.geography,'active')`,
      [
        sample.id,
        sample.name,
        sample.street,
        source,
        sample.point.lng,
        sample.point.lat,
      ],
    );
  }
  const observation = (point: S["Point"]) => ({
    point,
    observed_at: new Date().toISOString(),
    accuracy_m: 6,
    accuracy_permission: "precise",
  });
  for (const [index, sample] of samples.entries()) {
    const input = observation(sample.approach);
    const nearby = (await req(
      "POST",
      "/v1/apartments/discover",
      reader,
      200,
      input,
    )) as S["NearbyDiscovery"];
    assert.equal(nearby.radius_m, 200);
    const ordered = mergeNearby(nearby.items, []);
    assert.equal(ordered[0]?.apartment?.id, sample.id);
    assert.equal(ordered[0]?.distance_basis, "address_point");
    assert(ordered.every((entry) => entry.distance_m <= 200));
    if (index < 2) {
      assert.deepEqual(
        ordered.map((entry) => entry.apartment?.id),
        [sample.id, samples[1 - index]?.id],
      );
    } else {
      assert.equal(ordered.length, 1);
    }
    const apartments = ordered.flatMap(({ apartment }) =>
      apartment ? [apartment] : [],
    );
    const address = `${sample.street} Apt 901, Glendale, CA 91203`;
    assert.equal(exactApartment(address, apartments)?.id, sample.id);
    assert.equal(
      exactApartment(address.replace(/^\d+/, "9999"), apartments),
      null,
    );
    assert.equal(
      exactApartment(address.replace("Glendale", "Pasadena"), apartments),
      null,
    );
    const resolved = (await req(
      "POST",
      "/v1/apartments/resolve",
      reader,
      200,
      input,
    )) as S["ResolveResult"];
    assert.equal(resolved.matched_id, null);
    assert(!JSON.stringify(nearby).includes("access_records"));
  }
  await req("POST", "/v1/apartments/discover", reader, 409, {
    ...observation(samples[0]!.approach),
    accuracy_permission: "approximate",
  });

  const records = samples.map(
    ({ id }) => `/v1/apartments/${id}/access-records`,
  );
  const shared = (await req(
    "POST",
    records[0]!,
    contributor,
    201,
    {
      method: "keypad",
      value: "*00148#",
      scope: { label: "TEST" },
      source_attested: true,
    },
    randomUUID(),
  )) as S["ContributionResult"];
  const root = "/v1/me/contributions";
  const list = (await req(
    "GET",
    root,
    contributor,
    200,
  )) as S["ContributionSummaryPage"];
  const sourceRecord = list.items.find(
    (item) => item.record_id === shared.record_id,
  );
  assert(sourceRecord);
  const path = `${root}/${sourceRecord.id}`;
  const read = async (index: number) =>
    (await req("GET", records[index]!, reader, 200)) as S["AccessList"];
  assert.equal((await read(0)).items[0]?.value, "*00148#");
  assert.deepEqual((await read(1)).items, []);
  await req(
    "POST",
    `${path}/corrections`,
    contributor,
    200,
    {
      expected_version: sourceRecord.version,
      value: "#00259*",
      scope: { label: "TEST" },
      source_attested: true,
    },
    randomUUID(),
  );
  const corrected = await read(0);
  assert.deepEqual(
    corrected.items.map(({ value }) => value),
    ["#00259*"],
  );
  const old = (await req(
    "GET",
    path,
    contributor,
    200,
  )) as S["ContributionDetail"];
  assert.equal(old.value, null);
  assert.deepEqual((await read(1)).items, []);
  assert.deepEqual((await read(2)).items, []);
  console.log(
    "PASS Glendale: three public address-point probes, nearby order, wrong-address isolation, literal correction",
  );
}
