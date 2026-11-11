import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { components } from "@abasong/contracts";
import type { ApartmentsService } from "../apartments/apartments.service";
import type { MeService } from "../me/me.service";
import { ApiError } from "../common/api-error";
import { NearbyService } from "./nearby.service";
import { MapboxNearbyProvider } from "./mapbox-nearby.provider";
import { offsetPoint, tilequeryCoversRadius } from "./nearby-spatial";
type S = components["schemas"];
const point = { lng: -118.01, lat: 34.42 };
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function fixture(
  options: {
    distances?: number[];
    cap?: boolean;
    zoom?: number;
    failRadius?: number;
    missingMetadata?: boolean;
    sameAddress?: boolean;
  } = {},
) {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  const calls: URL[] = [];
  const maps = new MapboxNearbyProvider((async (input: unknown) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith("streets-v8.json"))
      return Response.json(
        options.missingMetadata ? {} : { maxzoom: options.zoom ?? 14 },
      );
    if (url.pathname.includes("tilequery")) {
      const radius = Number(url.searchParams.get("radius"));
      if (radius === options.failRadius)
        return new Response("TEST", { status: 503 });
      return Response.json({
        features: options.cap
          ? Array.from({ length: 50 }, (_, id) => ({
              id,
              geometry: { coordinates: [point.lng, point.lat] },
              properties: { type: "house", tilequery: { distance: 0 } },
            }))
          : (options.distances ?? [])
              .filter((d) => d <= radius)
              .map((distance, i) => {
                const p = offsetPoint(point, distance, 90);
                return {
                  id: i,
                  geometry: { coordinates: [p.lng, p.lat] },
                  properties: { type: "apartments", tilequery: { distance } },
                };
              }),
      });
    }
    const id = options.sameAddress
      ? "100"
      : String(Math.round(Number(url.searchParams.get("longitude")) * 100000));
    return Response.json({
      features: [
        {
          geometry: { coordinates: [point.lng, point.lat] },
          properties: {
            feature_type: "address",
            context: {
              address: { address_number: id, street_name: "TEST Ave" },
              place: { name: "TEST City" },
              region: { region_code: "US-CA" },
              country: { country_code: "US" },
            },
          },
        },
      ],
    });
  }) as typeof fetch);
  const apartments = {
    discoverCatalog: vi.fn(
      async (
        _a: unknown,
        _p: unknown,
        _radius?: number,
      ): Promise<S["NearbyCandidate"][]> => {
        void _radius;
        return [];
      },
    ),
    matchSearchAddress: vi.fn(async (): Promise<S["Apartment"][]> => []),
    readShared: vi.fn(),
    contributeAddress: vi.fn(),
  };
  const get = vi.fn(async () => ({ capabilities: [] }));
  const service = new NearbyService(
    apartments as unknown as ApartmentsService,
    { get } as unknown as MeService,
    maps,
  );
  const actor = { userId: randomUUID(), issuedAt: 1 };
  const body = {
    point,
    observed_at: new Date().toISOString(),
    accuracy_m: 5,
    accuracy_permission: "precise",
    observation_id: randomUUID(),
    expand: true,
  };
  return { calls, maps, service, apartments, actor, body, get };
}
it("expands exactly three tiers on successful sparse coverage, reuses reverse lookups and keeps same-origin distance", async () => {
  const f = fixture({ distances: [100, 400, 900] });
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.items.map((c) => c.distance_m)).toEqual([100, 400, 900]);
  expect(r.radius_m).toBe(1000);
  expect(r.expansion).toMatchObject({
    attempted_radii_m: [200, 500, 1000],
    stop_reason: "sufficient",
    catalog_queries: 3,
    tilequery_requests: 3,
    reverse_requests: 3,
    metadata_requests: 1,
  });
  expect(r.distance_context?.observation_id).toBe(f.body.observation_id);
  expect(f.apartments.readShared).not.toHaveBeenCalled();
  expect(f.apartments.contributeAddress).not.toHaveBeenCalled();
  expect(
    f.calls
      .filter((u) => u.pathname.includes("reverse"))
      .every((u) => u.searchParams.get("permanent") === "false"),
  ).toBe(true);
});
it("stops at 200 when three candidates exist and preserves legacy fixed-radius calls", async () => {
  const f = fixture({ distances: [10, 20, 30] });
  expect(
    (await f.service.discover(f.actor, f.body, true)).expansion
      ?.attempted_radii_m,
  ).toEqual([200]);
  const old = fixture({ distances: [100, 400, 900] });
  const r = await old.service.discover(
    old.actor,
    { ...old.body, expand: undefined },
    true,
  );
  expect(r.radius_m).toBe(200);
  expect(r.expansion).toBeUndefined();
  expect(old.calls.some((u) => u.pathname.endsWith("streets-v8.json"))).toBe(
    false,
  );
});
it("stops after 500 when three distinct candidates exist", async () => {
  const f = fixture({ distances: [100, 350, 400, 900] });
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.radius_m).toBe(500);
  expect(r.items).toHaveLength(3);
  expect(r.expansion?.attempted_radii_m).toEqual([200, 500]);
});
it("does not count duplicate roofs as separate communities or exceed the reverse budget", async () => {
  const f = fixture({ distances: [10, 20, 30, 40, 45, 50], sameAddress: true });
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.items).toHaveLength(1);
  expect(r.expansion).toMatchObject({
    attempted_radii_m: [200],
    reverse_requests: 4,
    stop_reason: "coverage_incomplete",
  });
});
it("capped house-only results remain partial and cannot trigger expansion or fake apartment cards", async () => {
  const f = fixture({ cap: true });
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.items).toEqual([]);
  expect(r.coverage?.mapbox).toBe("partial");
  expect(r.expansion).toMatchObject({
    attempted_radii_m: [200],
    tilequery_requests: 5,
    reverse_requests: 0,
    stop_reason: "coverage_incomplete",
  });
});
it.each([{ zoom: 18 }, { missingMetadata: true }])(
  "unknown or insufficient tile extent does not count as an empty full radius: %j",
  async (options) => {
    const f = fixture(options);
    const r = await f.service.discover(f.actor, f.body, true);
    expect(r.coverage?.mapbox).toBe("partial");
    expect(r.expansion?.attempted_radii_m).toEqual([200]);
  },
);
it("retains only the last successful radius after a later provider error", async () => {
  const f = fixture({ distances: [100], failRadius: 500 });
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.radius_m).toBe(200);
  expect(r.items.map((c) => c.distance_m)).toEqual([100]);
  expect(r.provider_status).toBe("unavailable");
  expect(r.expansion).toMatchObject({
    attempted_radii_m: [200, 500],
    stop_reason: "provider_unavailable",
  });
});
it("empty successful discovery stops at 1km without an unbounded loop", async () => {
  const f = fixture();
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.items).toEqual([]);
  expect(r.radius_m).toBe(1000);
  expect(r.expansion).toMatchObject({
    tilequery_requests: 3,
    stop_reason: "max_radius",
  });
});
it("revocation during expansion and stale fixes never return usable discovery", async () => {
  const f = fixture();
  f.get
    .mockImplementationOnce(async () => ({ capabilities: [] }))
    .mockRejectedValue(new ApiError(403, "ACCOUNT_UNAVAILABLE", "TEST"));
  await expect(f.service.discover(f.actor, f.body, true)).rejects.toMatchObject(
    { status: 403 },
  );
  const old = fixture();
  await expect(
    old.service.discover(
      old.actor,
      { ...old.body, observed_at: new Date(Date.now() - 21000).toISOString() },
      true,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(old.calls).toHaveLength(0);
});
it("enforces a cycle duration budget before another tier and rejects arbitrary caller radius", async () => {
  const f = fixture({ distances: [100] });
  let clock = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  // Move the clock once, without making the final freshness check fail.
  f.get
    .mockImplementationOnce(async () => ({ capabilities: [] }))
    .mockImplementationOnce(async () => {
      clock += 8500;
      return { capabilities: [] };
    })
    .mockResolvedValue({ capabilities: [] });
  const r = await f.service.discover(f.actor, f.body, true);
  expect(r.expansion?.stop_reason).toBe("budget_exhausted");
  expect(r.expansion?.attempted_radii_m).toEqual([200]);
  const invalid = fixture();
  await expect(
    invalid.service.discover(
      invalid.actor,
      { ...invalid.body, radius_m: 99999 },
      true,
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("checks nine-tile geographic bounds, independent of loaded native viewport", () => {
  expect(tilequeryCoversRadius(point, 200, 16)).toBe(true);
  expect(tilequeryCoversRadius(point, 1000, 16)).toBe(false);
  expect(tilequeryCoversRadius(point, 1000, 14)).toBe(true);
  expect(tilequeryCoversRadius({ lng: 179.999, lat: 84 }, 1000, 16)).toBe(
    false,
  );
});
