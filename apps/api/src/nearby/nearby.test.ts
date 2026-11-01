import { expect, it, vi } from "vitest";
import { MapboxNearbyProvider } from "./mapbox-nearby.provider";
import { addressContribution, freshObservation } from "./nearby-input";
const p = { lng: -118.1, lat: 34.1 };
it("filters houses, generic residential, distance overflow and duplicate roofs", async () => {
  vi.stubEnv("MAPBOX_SEARCH_TOKEN", "pk.TEST");
  const response = {
    features: ["apartments", "house", "residential", "apartments"].map(
      (type, i) => ({
        id: i === 3 ? 0 : i,
        geometry: { coordinates: [p.lng, p.lat] },
        properties: { type, tilequery: { distance: 20 } },
      }),
    ),
  };
  const m = new MapboxNearbyProvider(
    vi.fn(async () => Response.json(response)) as typeof fetch,
  );
  expect((await m.buildings(p)).items).toHaveLength(1);
  vi.unstubAllEnvs();
});
it("never calls a permanent endpoint without explicit provider configuration", async () => {
  vi.stubEnv("MAPBOX_PERMANENT_GEOCODING_ENABLED", "false");
  const f = vi.fn();
  const m = new MapboxNearbyProvider(f);
  await expect(
    m.permanent({
      address_line1: "100 TEST St",
      city: "TEST City",
      state: "CA",
      postal_code: null,
    }),
  ).rejects.toMatchObject({ code: "ADDRESS_STORAGE_UNAVAILABLE" });
  expect(f).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});
it("rejects caller coordinates, false confirmation, stale and approximate fixes", () => {
  const body = {
    address: {
      address_line1: "100 TEST St",
      city: "TEST City",
      state: "CA",
      postal_code: null,
    },
    method: "keypad",
    value: "TEST#",
    source_attested: true,
    address_confirmed: true,
  };
  expect(addressContribution.safeParse(body).success).toBe(true);
  expect(addressContribution.safeParse({ ...body, point: p }).success).toBe(
    false,
  );
  expect(
    addressContribution.safeParse({ ...body, address_confirmed: false })
      .success,
  ).toBe(false);
  const fix = {
    point: p,
    observed_at: new Date().toISOString(),
    accuracy_m: 5,
    accuracy_permission: "precise",
  };
  expect(freshObservation(fix).point).toEqual(p);
  expect(() =>
    freshObservation({ ...fix, accuracy_permission: "approximate" }),
  ).toThrow();
  expect(() =>
    freshObservation({
      ...fix,
      observed_at: new Date(Date.now() - 30000).toISOString(),
    }),
  ).toThrow();
});
