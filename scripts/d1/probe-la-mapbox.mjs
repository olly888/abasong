// Bounded, temporary provider diagnostics. Never stores coordinates, geometry,
// provider response bodies, access information, URLs or credentials.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const token = parseEnv(
  readFileSync("apps/mobile/.env.local", "utf8"),
).EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
if (!token?.startsWith("pk.")) throw new Error("Public Mapbox token required");
const initialSamples = [
  {
    id: "LA-PUBLIC-01",
    address: "6200 W 3rd St, Los Angeles, CA 90036",
    source: "https://www.parklabrea.com/",
  },
  {
    id: "LA-PUBLIC-02",
    address: "2445 E Del Mar Blvd, Pasadena, CA 91107",
    source: "https://www.delmarpasadena.com/",
  },
  {
    id: "LA-USER-01",
    address: "1212 E Walnut Creek Pkwy, West Covina, CA 91790",
    source: "user_example_not_field_verified",
  },
];
const additionalSamples = [
  {
    id: "LA-PUBLIC-03",
    address: "301 S Glendora Ave, West Covina, CA 91790",
    source: "https://www.colonyatthelakes.com/",
  },
  {
    id: "LA-PUBLIC-04",
    address: "2547 Temple Ave, West Covina, CA 91792",
    source: "https://www.woodsidevillageapartmenthomes.com/contactus",
  },
  {
    id: "LA-PUBLIC-05",
    address: "300 S Santa Fe Ave, Los Angeles, CA 90012",
    source: "https://osfla.com/",
  },
];
const args = process.argv.slice(2);
if (args.some((a) => a !== "--additional") || args.length > 1)
  throw new Error("Use no arguments or --additional");
const samples = args.includes("--additional")
  ? additionalSamples
  : initialSamples;
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
    product: "light-v11",
    http: style.status,
    streets_v8_source: Object.values(style.body?.sources ?? {}).some((s) =>
      s.url?.includes("mapbox-streets-v8"),
    ),
  }),
);
for (const sample of samples) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  Object.entries({
    q: sample.address,
    country: "US",
    types: "address",
    limit: "1",
    autocomplete: "false",
    permanent: "false",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const geocode = await get(url);
  const feature = geocode.body?.features?.[0];
  const coordinate = feature?.geometry?.coordinates;
  const result = {
    sample: sample.id,
    public_input_source: sample.source,
    geocode_http: geocode.status,
    address_found: !!coordinate,
    building_http: null,
    building_count: 0,
    apartment_type_count: 0,
    number_http: null,
    number_count: 0,
    expected_number_present: false,
  };
  if (coordinate?.length === 2) {
    for (const layer of ["building", "housenum_label"]) {
      const tiles = new URL(
        `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${coordinate[0]},${coordinate[1]}.json`,
      );
      Object.entries({
        layers: layer,
        radius: "60",
        limit: "50",
        dedupe: "true",
      }).forEach(([k, v]) => tiles.searchParams.set(k, v));
      const response = await get(tiles);
      const features = response.body?.features ?? [];
      if (layer === "building")
        Object.assign(result, {
          building_http: response.status,
          building_count: features.length,
          apartment_type_count: features.filter(
            (f) => f.properties?.type === "apartments",
          ).length,
        });
      else
        Object.assign(result, {
          number_http: response.status,
          number_count: features.length,
          expected_number_present: features.some(
            (f) => f.properties?.house_num === sample.address.split(" ")[0],
          ),
        });
    }
  }
  console.log(JSON.stringify(result));
}
console.log(
  "Temporary diagnostics only: no field GPS, persistent apartment data, passwords or accuracy claims. At most 10 provider requests.",
);
