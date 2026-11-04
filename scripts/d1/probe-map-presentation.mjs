// Bounded public-sample diagnostics: 1 style + 6 tileset queries, no field GPS,
// provider geometry/response storage, password data or credential logging.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const token = parseEnv(
  readFileSync("apps/mobile/.env.local", "utf8"),
).EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (!token?.startsWith("pk.")) throw new Error("Public Mapbox token required");
async function get(url) {
  url.searchParams.set("access_token", token);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return { status: r.status, body: r.ok ? await r.json() : null };
  } catch {
    return { status: "network_unavailable", body: null };
  }
}
const style = await get(
  new URL("https://api.mapbox.com/styles/v1/mapbox/light-v11"),
);
console.log(
  JSON.stringify({
    style: "light-v11",
    http: style.status,
    composite_has_streets_v8:
      style.body?.sources?.composite?.url?.includes("mapbox-streets-v8") ??
      false,
    built_in_house_number_layers:
      style.body?.layers?.filter((l) => l["source-layer"] === "housenum_label")
        .length ?? null,
  }),
);
for (const file of ["one-santa-fe", "la-expansion"]) {
  const dataset = JSON.parse(
    readFileSync(`data/public-apartments/${file}.geojson`, "utf8"),
  );
  for (const [i, f] of dataset.features.entries()) {
    // Public geometry anchor only, not claimed to be the entrance or user's location.
    const [lng, lat] = f.geometry.coordinates[0][0][0];
    const url = new URL(
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json`,
    );
    for (const [k, v] of Object.entries({
      layers: "housenum_label",
      radius: "100",
      limit: "50",
      dedupe: "true",
    }))
      url.searchParams.set(k, v);
    const response = await get(url);
    const labels = response.body?.features ?? [];
    console.log(
      JSON.stringify({
        sample: f.properties.slug ?? `${file}-${i + 1}`,
        http: response.status,
        label_count_within_100m_of_public_anchor: labels.length,
        expected_primary_number_present: labels.some(
          (l) =>
            String(l.properties?.house_num) ===
            String(f.properties.street_number),
        ),
      }),
    );
  }
}
console.log(
  "Coverage diagnostic only; no field verification or building/address association inferred. At most 7 requests.",
);
