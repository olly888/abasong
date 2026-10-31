import { readFileSync } from "node:fs";
import type { Client } from "pg";
import assert from "node:assert/strict";
export const publicApartmentId = "a1b23c45-6789-4abc-8def-0123456789ab";
const sourceId = "b1b23c45-6789-4abc-8def-0123456789ab";
const buildingId = "c1b23c45-6789-4abc-8def-0123456789ab";
// Called only after the runner's local-target guard. This public ODbL fixture is
// separate from passwords and from Mapbox temporary query results.
export const publicExpansion = [
  "del-mar",
  "woodside-village",
  "colony-at-the-lakes",
  "park-la-brea",
  "park-la-brea-tower-48",
].map((slug, i) => ({
  slug,
  id: `a1b23c45-6789-4abc-8def-0123456789b${i + 1}`,
  source: `b1b23c45-6789-4abc-8def-0123456789b${i + 1}`,
  building: `c1b23c45-6789-4abc-8def-0123456789b${i + 1}`,
}));
export async function ingestPublicApartment(db: Client) {
  return ingest(
    db,
    "data/public-apartments/one-santa-fe.geojson",
    0,
    publicApartmentId,
    sourceId,
    buildingId,
  );
}
export async function ingestPublicApartments(db: Client) {
  await ingestPublicApartment(db);
  for (const [i, sample] of publicExpansion.entries())
    await ingest(
      db,
      "data/public-apartments/la-expansion.geojson",
      i,
      sample.id,
      sample.source,
      sample.building,
    );
}
async function ingest(
  db: Client,
  file: string,
  index: number,
  apartmentId: string,
  source: string,
  building: string,
) {
  const dataset = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(
    dataset.license,
    "https://opendatacommons.org/licenses/odbl/1-0/",
  );
  const f = dataset.features[index],
    p = f.properties,
    g = JSON.stringify(f.geometry);
  const refs: string[] = p.geometry_sources ?? [p.geometry_source];
  assert(
    refs.length &&
      refs.every((ref) =>
        /^https:\/\/www\.openstreetmap\.org\/(way|relation)\/\d+$/.test(ref),
      ),
  );
  const hasBuilding = p.geometry_role !== "address_only_area";
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO abasong.data_sources(id,source_type,provider,product,license_reference,persistent_use_approved,verified_at)
   VALUES($1,'licensed_dataset','OpenStreetMap','osm-api-0.6',$2,true,now()) ON CONFLICT(id) DO NOTHING`,
      [source, "ODbL-1.0; " + refs.join("; ") + "; " + p.address_source],
    );
    const shape = `extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1::text),4326)`;
    const validity = (
      await db.query(
        `SELECT extensions.ST_IsValid(${shape}) AND NOT extensions.ST_IsEmpty(${shape}) AND
      ($2::text IS NULL OR extensions.ST_Covers(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($2::text),4326),${shape})) AS valid`,
        [g, p.property_area ? JSON.stringify(p.property_area) : null],
      )
    ).rows[0];
    assert.equal(
      validity?.valid,
      true,
      "Invalid or uncontained public geometry",
    );
    const eroded = `extensions.ST_Buffer((${shape})::extensions.geography,-10::double precision)::extensions.geometry`;
    const inside = `extensions.ST_PointOnSurface(CASE WHEN extensions.ST_IsEmpty(${eroded}) THEN ${shape} ELSE ${eroded} END)`;
    await db.query(
      `INSERT INTO abasong.apartments(id,name,address_line1,city,state,postal_code,source_id,point,boundary,status,confidence)
   SELECT $2,$3,$4,$5,$6,$7,$8,(${inside})::extensions.geography,${hasBuilding ? shape : "NULL"},'active','authorized_source' ON CONFLICT(id) DO NOTHING`,
      [
        g,
        apartmentId,
        p.name,
        p.address_line1,
        p.city,
        p.state,
        p.postal_code,
        source,
      ],
    );
    const check = (
      await db.query(
        `SELECT address_line1=$2 AND source_id=$3 AND name=$5 AND city=$6 AND state=$7 AND postal_code=$8 AND
         ${hasBuilding ? "extensions.ST_Equals(boundary,extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($4::text),4326))" : "boundary IS NULL AND $4::text IS NOT NULL"} AS matches FROM abasong.apartments WHERE id=$1`,
        [
          apartmentId,
          p.address_line1,
          source,
          g,
          p.name,
          p.city,
          p.state,
          p.postal_code,
        ],
      )
    ).rows[0];
    assert.equal(
      check?.matches,
      true,
      "Existing public sample differs; review required",
    );
    if (hasBuilding)
      await db.query(
        `INSERT INTO abasong.apartment_buildings(id,apartment_id,source_id,footprint,label_point,street_number,verified_at)
   SELECT $1,id,source_id,boundary,point::extensions.geometry,$3,now() FROM abasong.apartments WHERE id=$2 ON CONFLICT(id) DO NOTHING`,
        [building, apartmentId, p.street_number],
      );
    if (hasBuilding) {
      const stored = (
        await db.query(
          `SELECT b.source_id=$3 AND b.street_number=$4 AND extensions.ST_Equals(b.footprint,a.boundary) AS matches
        FROM abasong.apartment_buildings b JOIN abasong.apartments a ON a.id=b.apartment_id WHERE b.id=$1 AND a.id=$2`,
          [building, apartmentId, source, p.street_number],
        )
      ).rows[0];
      assert.equal(
        stored?.matches,
        true,
        "Existing building mapping differs; review required",
      );
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
