import { readFileSync } from "node:fs";
import type { Client } from "pg";
import assert from "node:assert/strict";
export const publicApartmentId = "a1b23c45-6789-4abc-8def-0123456789ab";
const sourceId = "b1b23c45-6789-4abc-8def-0123456789ab";
const buildingId = "c1b23c45-6789-4abc-8def-0123456789ab";
// Called only after the runner's local-target guard. This public ODbL fixture is
// separate from passwords and from Mapbox temporary query results.
export async function ingestPublicApartment(db: Client) {
  const dataset = JSON.parse(
    readFileSync("data/public-apartments/one-santa-fe.geojson", "utf8"),
  );
  assert.equal(
    dataset.license,
    "https://opendatacommons.org/licenses/odbl/1-0/",
  );
  const f = dataset.features[0],
    p = f.properties,
    g = JSON.stringify(f.geometry);
  assert.equal(
    p.geometry_source,
    "https://www.openstreetmap.org/way/427628872",
  );
  await db.query("BEGIN");
  try {
    await db.query(
      `INSERT INTO abasong.data_sources(id,source_type,provider,product,license_reference,persistent_use_approved,verified_at)
   VALUES($1,'licensed_dataset','OpenStreetMap','osm-api-0.6',$2,true,now()) ON CONFLICT(id) DO NOTHING`,
      [sourceId, "ODbL-1.0; " + p.geometry_source + "; " + p.address_source],
    );
    const shape = `extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1::text),4326)`;
    const eroded = `extensions.ST_Buffer((${shape})::extensions.geography,-10::double precision)::extensions.geometry`;
    const inside = `extensions.ST_PointOnSurface(CASE WHEN extensions.ST_IsEmpty(${eroded}) THEN ${shape} ELSE ${eroded} END)`;
    await db.query(
      `INSERT INTO abasong.apartments(id,name,address_line1,city,state,postal_code,source_id,point,boundary,status,confidence)
   SELECT $2,$3,$4,$5,$6,$7,$8,(${inside})::extensions.geography,${shape},'active','authorized_source' ON CONFLICT(id) DO NOTHING`,
      [
        g,
        publicApartmentId,
        p.name,
        p.address_line1,
        p.city,
        p.state,
        p.postal_code,
        sourceId,
      ],
    );
    const check = (
      await db.query(
        `SELECT address_line1=$2 AND source_id=$3 AND extensions.ST_Equals(boundary,extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($4::text),4326)) AS matches FROM abasong.apartments WHERE id=$1`,
        [publicApartmentId, p.address_line1, sourceId, g],
      )
    ).rows[0];
    assert.equal(
      check?.matches,
      true,
      "Existing public sample differs; review required",
    );
    await db.query(
      `INSERT INTO abasong.apartment_buildings(id,apartment_id,source_id,footprint,label_point,street_number,verified_at)
   SELECT $1,id,source_id,boundary,point::extensions.geometry,$3,now() FROM abasong.apartments WHERE id=$2 ON CONFLICT(id) DO NOTHING`,
      [buildingId, publicApartmentId, p.street_number],
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
