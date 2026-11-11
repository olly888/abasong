// Preserve ODbL provenance. No network/driver GPS; never turn a public gate into
// a verified arrival area while generating the field-review artifact.
import { readFileSync, writeFileSync } from "node:fs";
const source = JSON.parse(
  readFileSync("data/public-apartments/la-expansion.geojson", "utf8"),
);
const candidate = JSON.parse(
  readFileSync(
    "data/public-apartments/woodside-entrance-candidates.geojson",
    "utf8",
  ),
);
const w = source.features.find((f) => f.properties.slug === "woodside-village");
if (
  !w ||
  w.geometry.type !== "MultiPolygon" ||
  candidate.purpose !== "public_gate_candidates_not_arrival_areas" ||
  candidate.features.length !== 2
)
  throw new Error("Unexpected public field source");
const gates = candidate.features.map((f) => {
  if (
    f.geometry.type !== "Point" ||
    f.properties.status !== "candidate" ||
    f.properties.field_verified !== false ||
    f.properties.property_slug !== "woodside-village"
  )
    throw new Error("Field-review source must remain unverified");
  return {
    id: f.properties.sample_id.split("-").at(-1),
    point: { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] },
    status: f.properties.status,
    field_verified: false,
    source: f.properties.osm_node.reference,
  };
});
const p = w.properties;
const value = {
  version: "woodside-review-v1",
  status: "candidate_only",
  checked_on: candidate.features[0].properties.checked_on,
  name: p.name,
  address: p.address_line1,
  city: p.city,
  state: p.state,
  postal_code: p.postal_code,
  attribution: "© OpenStreetMap contributors · ODbL1.0",
  license: "https://opendatacommons.org/licenses/odbl/1-0/",
  buildings: w.geometry,
  gates,
};
const output = "apps/mobile/src/field/woodside.public.json",
  text = JSON.stringify(value) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== text)
    throw new Error("Review fixture drift; regenerate from public source");
  console.log("Public review fixture matches source");
} else writeFileSync(output, text);
