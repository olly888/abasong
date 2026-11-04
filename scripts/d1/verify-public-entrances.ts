import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { assessHomeArrival } from "../../apps/mobile/src/apartments/arrival-policy";
import { publicExpansion } from "./public-apartment-data";
type S = components["schemas"];
type Request = (
  method: string,
  path: string,
  auth: string | undefined,
  status: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;

// Public gate points are real, but the 8m envelopes, observations, scopes and
// access values below are SYNTHETIC and exist only in the disposable test DB.
// They are not field evidence or a production/public sample activation tool.
export async function verifyPublicEntrances(
  db: Client,
  req: Request,
  reader: string,
) {
  assert.match(
    (await db.query("SELECT current_database() AS name")).rows[0].name,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  const dataset = JSON.parse(
    readFileSync(
      "data/public-apartments/woodside-entrance-candidates.geojson",
      "utf8",
    ),
  );
  assert.equal(
    dataset.license,
    "https://opendatacommons.org/licenses/odbl/1-0/",
  );
  assert.equal(dataset.purpose, "public_gate_candidates_not_arrival_areas");
  assert.equal(dataset.features.length, 2);
  const apartmentId = publicExpansion.find(
    (s) => s.slug === "woodside-village",
  )!.id;
  const previous = (
    await db.query("SELECT config FROM abasong.config_versions WHERE version=1")
  ).rows[0].config;
  const source = randomUUID(),
    area = randomUUID(),
    competitor = randomUUID(),
    competingArea = randomUUID();
  await db.query(
    "INSERT INTO abasong.data_sources(id,source_type,provider,license_reference,persistent_use_approved,verified_at) VALUES($1,'licensed_dataset','TEST-PUBLIC-GATE','SYNTHETIC-AREA-NOT-FIELD',true,now())",
    [source],
  );
  const policy = {
    enabled: true,
    max_accuracy_m: 20,
    scopes: [
      {
        apartment_id: apartmentId,
        match_bases: ["entrance"],
        evidence_ref: "DISPOSABLE-SYNTHETIC-ENVELOPE-NOT-FIELD",
        verified_at: new Date(Date.now() - 60000).toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
    ],
  };
  const setPolicy = (value: unknown) =>
    db.query(
      "UPDATE abasong.config_versions SET config=jsonb_set(config,'{apartment_resolve,auto_match}',$1::jsonb) WHERE version=1",
      [JSON.stringify(value)],
    );
  const path = "/v1/apartments/resolve";
  let firstGate: { point: S["Point"]; result: S["ResolveResult"] } | undefined;
  try {
    await setPolicy(policy);
    for (const feature of dataset.features) {
      assert.equal(feature.properties.status, "candidate");
      assert.equal(feature.properties.field_verified, false);
      assert.equal(feature.geometry.type, "Point");
      const [lng, lat] = feature.geometry.coordinates as [number, number];
      assert(Number.isFinite(lng) && Number.isFinite(lat));
      const containment = (
        await db.query(
          `SELECT
        extensions.ST_Covers(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($2::text),4326),extensions.ST_SetSRID(extensions.ST_MakePoint($3,$4),4326)) AS in_property,
        extensions.ST_Covers(boundary,extensions.ST_SetSRID(extensions.ST_MakePoint($3,$4),4326)) AS in_building
        FROM abasong.apartments WHERE id=$1`,
          [
            apartmentId,
            JSON.stringify(
              JSON.parse(
                readFileSync(
                  "data/public-apartments/la-expansion.geojson",
                  "utf8",
                ),
              ).features[1].properties.property_area,
            ),
            lng,
            lat,
          ],
        )
      ).rows[0];
      assert.equal(containment.in_property, true);
      assert.equal(containment.in_building, false);
      const fix = (accuracy_m = 2) => ({
        point: { lng, lat },
        observed_at: new Date().toISOString(),
        accuracy_m,
        accuracy_permission: "precise",
      });
      const resolve = (body = fix()) =>
        req("POST", path, reader, 200, body) as Promise<S["ResolveResult"]>;
      // A mapped public gate point is NOT an active arrival area.
      assert.equal((await resolve()).matched_id, null);
      await db.query(
        `INSERT INTO abasong.apartment_arrival_areas(id,apartment_id,source_id,area,status,verified_at)
        VALUES($1,$2,$3,extensions.ST_Multi(extensions.ST_Buffer(extensions.ST_SetSRID(extensions.ST_MakePoint($4,$5),4326)::extensions.geography,8)::extensions.geometry),'pending',now())`,
        [area, apartmentId, source, lng, lat],
      );
      assert.equal((await resolve()).matched_id, null);
      await db.query(
        "UPDATE abasong.apartment_arrival_areas SET status='active' WHERE id=$1",
        [area],
      );
      const first = await resolve();
      assert.equal(first.matched_id, apartmentId);
      assert.equal(first.match_basis, "entrance");
      assert(!JSON.stringify(first).includes("SYNTHETIC-AREA"));
      assert(!JSON.stringify(first).includes("unresolved"));
      const now = Date.now(),
        start = assessHomeArrival(
          null,
          undefined,
          first,
          now - 9000,
          now - 9000,
          false,
          { lng, lat },
        );
      assert.equal(start.apartment, null);
      const arrived = assessHomeArrival(
        start.state,
        undefined,
        await resolve(),
        now,
        now,
        false,
        { lng, lat },
      );
      assert.equal(arrived.apartment?.id, apartmentId);
      if (firstGate) {
        const earlier = assessHomeArrival(
          null,
          undefined,
          firstGate.result,
          now - 9000,
          now - 9000,
          false,
          firstGate.point,
        );
        const moving = assessHomeArrival(
          earlier.state,
          undefined,
          first,
          now,
          now,
          false,
          { lng, lat },
        );
        assert.equal(moving.apartment, null);
        assert.equal(moving.state?.since, now);
      } else firstGate = { point: { lng, lat }, result: first };

      for (const body of [
        fix(9),
        { ...fix(), accuracy_permission: "approximate" },
      ]) {
        const uncertain = (await req(
          "POST",
          path,
          reader,
          200,
          body,
        )) as S["ResolveResult"];
        assert.equal(uncertain.matched_id, null);
        assert.equal(
          assessHomeArrival(
            arrived.state,
            apartmentId,
            uncertain,
            now + 1000,
            now + 1000,
            false,
            { lng, lat },
          ).clearAutomaticCard,
          true,
        );
        assert.equal(
          assessHomeArrival(
            arrived.state,
            apartmentId,
            uncertain,
            now + 1000,
            now + 1000,
            true,
            { lng, lat },
          ).clearAutomaticCard,
          false,
        );
      }
      // A second apartment outside the pilot allowlist still vetoes ambiguity.
      await db.query(
        "INSERT INTO abasong.apartments(id,address_line1,city,source_id,point,status,confidence) VALUES($1,'TEST competing apartment','TEST',$2,extensions.ST_SetSRID(extensions.ST_MakePoint($3,$4),4326)::extensions.geography,'active','authorized_source')",
        [competitor, source, lng, lat],
      );
      await db.query(
        "INSERT INTO abasong.apartment_arrival_areas(id,apartment_id,source_id,area,status,verified_at) SELECT $1,$2,source_id,area,'active',now() FROM abasong.apartment_arrival_areas WHERE id=$3",
        [competingArea, competitor, area],
      );
      const ambiguous = await resolve();
      assert.equal(ambiguous.matched_id, null);
      assert.equal(ambiguous.reason, "ambiguous");
      await db.query(
        "DELETE FROM abasong.apartment_arrival_areas WHERE id=$1",
        [competingArea],
      );
      await db.query("DELETE FROM abasong.apartments WHERE id=$1", [
        competitor,
      ]);
      // Entrance-source eligibility is independent of the building data source.
      await assert.rejects(
        db.query(
          "UPDATE abasong.data_sources SET persistent_use_approved=false WHERE id=$1",
          [source],
        ),
        { code: "23514" },
      );
      for (const update of [
        "verified_at=NULL",
        "verified_at=now()+interval '1 day'",
        "expires_at=now()-interval '1 minute'",
      ]) {
        await db.query(
          "UPDATE abasong.data_sources SET " + update + " WHERE id=$1",
          [source],
        );
        const unsupported = await resolve();
        assert.equal(unsupported.matched_id, null);
        assert.equal(
          assessHomeArrival(
            arrived.state,
            apartmentId,
            unsupported,
            now + 1000,
            now + 1000,
            false,
            { lng, lat },
          ).clearAutomaticCard,
          true,
        );
        await db.query(
          "UPDATE abasong.data_sources SET persistent_use_approved=true,verified_at=now(),expires_at=NULL WHERE id=$1",
          [source],
        );
      }
      for (const update of [
        "expires_at=now()-interval '1 second',verified_at=now()-interval '1 minute'",
        "status='withdrawn'",
      ]) {
        await db.query(
          "UPDATE abasong.apartment_arrival_areas SET " +
            update +
            " WHERE id=$1",
          [area],
        );
        assert.equal((await resolve()).matched_id, null);
        await db.query(
          "UPDATE abasong.apartment_arrival_areas SET status='active',verified_at=now(),expires_at=NULL WHERE id=$1",
          [area],
        );
      }
      await setPolicy({ ...policy, scopes: [] });
      assert.equal((await resolve()).matched_id, null);
      await setPolicy(policy);
      await db.query(
        "DELETE FROM abasong.apartment_arrival_areas WHERE id=$1",
        [area],
      );
      const departed = await resolve();
      assert.equal(departed.matched_id, null);
      assert.equal(
        assessHomeArrival(
          arrived.state,
          apartmentId,
          departed,
          now + 1000,
          now + 1000,
          false,
          { lng, lat },
        ).clearAutomaticCard,
        true,
      );
    }
  } finally {
    await db.query(
      "UPDATE abasong.config_versions SET config=$1 WHERE version=1",
      [JSON.stringify(previous)],
    );
    await db.query(
      "DELETE FROM abasong.apartment_arrival_areas WHERE id=ANY($1::uuid[])",
      [[area, competingArea]],
    );
    await db.query("DELETE FROM abasong.apartments WHERE id=$1", [competitor]);
    await db.query("DELETE FROM abasong.data_sources WHERE id=$1", [source]);
  }
}
