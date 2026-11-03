import { afterEach, expect, it, vi } from "vitest";
import { MapboxNearbyProvider } from "./mapbox-nearby.provider";
import { distanceM, offsetPoint } from "./nearby-spatial";
afterEach(() => vi.unstubAllEnvs());
const p = { lng: -118.01, lat: 34.42 };
const feature = (id: number, type: string, point = p, distance = 10) => ({
  id,
  geometry: { coordinates: [point.lng, point.lat] },
  properties: { type, tilequery: { distance } },
});
it("performs no supplement for an uncapped result", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  const fetcher = vi.fn(async () =>
    Response.json({ features: [feature(1, "apartments")] }),
  );
  expect(
    (await new MapboxNearbyProvider(fetcher as typeof fetch).buildings(p))
      .items[0]?.feature_id,
  ).toBe("1");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("recovers classified apartments behind a capped house result with four bounded supplements", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  const calls: URL[] = [];
  const fetcher = vi.fn(async (input: unknown) => {
    calls.push(new URL(String(input)));
    return Response.json({
      features:
        calls.length === 1
          ? Array.from({ length: 50 }, (_, i) => feature(i, "house"))
          : [
              feature(100, "apartments", offsetPoint(p, 120, 0), 5),
              feature(101, "apartments", offsetPoint(p, 250, 0), 1),
            ],
    });
  });
  const result = await new MapboxNearbyProvider(
    fetcher as typeof fetch,
  ).buildings(p);
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(calls.map((c) => c.searchParams.get("radius"))).toEqual([
    "200",
    "150",
    "150",
    "150",
    "150",
  ]);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.feature_id).toBe("100");
  expect(result.items[0]?.distance_m).toBeCloseTo(120, 4);
  expect(result.truncated).toBe(true);
});
it("keeps a successful supplement when a sibling request fails without hiding partial coverage", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  let calls = 0;
  const fetcher = vi.fn(async () => {
    const call = ++calls;
    if (call === 1)
      return Response.json({
        features: Array.from({ length: 50 }, (_, i) => feature(i, "house")),
      });
    if (call === 2)
      return Response.json({ features: [feature(99, "apartments", p, 1)] });
    return new Response("TEST", { status: 503 });
  });
  const result = await new MapboxNearbyProvider(
    fetcher as typeof fetch,
  ).buildings(p);
  expect(result.items).toHaveLength(1);
  expect(result.truncated).toBe(true);
  expect(calls).toBe(5);
});
it("keeps spatial offsets at the requested surface distance", () => {
  for (const bearing of [0, 90, 180, 270])
    expect(distanceM(p, offsetPoint(p, 100, bearing))).toBeCloseTo(100, 5);
});
it("does not fan out when the first provider request fails", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  const fetcher = vi.fn(async () => new Response("TEST", { status: 503 }));
  await expect(
    new MapboxNearbyProvider(fetcher as typeof fetch).buildings(p),
  ).rejects.toMatchObject({ code: "MAP_UNAVAILABLE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
const address = {
  address_line1: "100 TEST Ave",
  city: "TEST City",
  state: "CA",
  postal_code: "90000",
};
function geocode() {
  return {
    features: [
      {
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          feature_type: "address",
          coordinates: { accuracy: "rooftop" },
          match_code: {
            confidence: "exact",
            address_number: "matched",
            street: "matched",
            region: "matched",
          },
          context: {
            address: { address_number: "100", street_name: "TEST Avenue" },
            place: { name: "TEST City" },
            region: { region_code: "US-CA" },
            country: { country_code: "US" },
            postcode: { name: "90000" },
          },
        },
      },
    ],
  };
}

it("stores only precise, component-matched geocoding and uses documented forward parameters", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  vi.stubEnv("MAPBOX_PERMANENT_GEOCODING_ENABLED", "true");
  let requested: URL | undefined;
  const maps = new MapboxNearbyProvider((async (u: unknown) => {
    requested = new URL(String(u));
    return Response.json(geocode());
  }) as typeof fetch);
  expect((await maps.permanent(address)).address.address_line1).toBe(
    "100 TEST Avenue",
  );
  expect(requested?.searchParams.get("q")).toContain("100 TEST Ave");
  expect(requested?.searchParams.get("permanent")).toBe("true");
  expect(requested?.searchParams.has("address_line1")).toBe(false);
});
it.each(["interpolated", "approximate", undefined])(
  "refuses uncertain permanent coordinates %s",
  async (accuracy) => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
    vi.stubEnv("MAPBOX_PERMANENT_GEOCODING_ENABLED", "true");
    const raw = geocode();
    raw.features[0]!.properties.coordinates.accuracy = accuracy as string;
    const maps = new MapboxNearbyProvider((async () =>
      Response.json(raw)) as typeof fetch);
    await expect(maps.permanent(address)).rejects.toMatchObject({
      code: "ADDRESS_CONFIRMATION_REQUIRED",
    });
  },
);
it.each(["address_number", "street", "region"] as const)(
  "refuses a provider correction to %s even at high confidence",
  async (field) => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
    vi.stubEnv("MAPBOX_PERMANENT_GEOCODING_ENABLED", "true");
    const raw = geocode();
    raw.features[0]!.properties.match_code[field] = "unmatched";
    await expect(
      new MapboxNearbyProvider((async () =>
        Response.json(raw)) as typeof fetch).permanent(address),
    ).rejects.toMatchObject({ code: "ADDRESS_CONFIRMATION_REQUIRED" });
  },
);
it.each(["low", "missing"])(
  "refuses %s forward match quality",
  async (quality) => {
    vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
    vi.stubEnv("MAPBOX_PERMANENT_GEOCODING_ENABLED", "true");
    const raw = geocode();
    if (quality === "missing")
      delete (raw.features[0]!.properties as { match_code?: unknown })
        .match_code;
    else raw.features[0]!.properties.match_code.confidence = "low";
    await expect(
      new MapboxNearbyProvider((async () =>
        Response.json(raw)) as typeof fetch).permanent(address),
    ).rejects.toMatchObject({ code: "ADDRESS_CONFIRMATION_REQUIRED" });
  },
);
it("retains reverse suggestions without pretending reverse responses provide forward match codes", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  const raw = geocode();
  delete (raw.features[0]!.properties as { match_code?: unknown }).match_code;
  expect(
    await new MapboxNearbyProvider((async () =>
      Response.json(raw)) as typeof fetch).reverse(p),
  ).toMatchObject({ address_line1: "100 TEST Avenue" });
});
