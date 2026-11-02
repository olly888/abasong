import { expect, it } from "vitest";
import {
  mergeNearby,
  distanceM,
  nearbyAtCurrentObservation,
  nearbyFromSnapshots,
  withinNearbyRadius,
} from "./nearby-policy";
import {
  getNearbyContribution,
  setNearbyContribution,
} from "./nearby-contribution";
import type { components } from "@abasong/contracts";
type C = components["schemas"]["NearbyCandidate"];
const item = (key: string, distance_m: number): C => ({
  key,
  source: "mapbox",
  apartment: null,
  address: null,
  point: { lng: -118.1, lat: 34.1 },
  distance_m,
  classification: "apartments",
  requires_address_confirmation: true,
});

it("withdraws an edge recommendation on the next GPS fix while its replacement query is still pending", () => {
  const now = Date.now();
  const point = { lng: -118.1, lat: 34.1 };
  const current = {
    fix: {
      coords: {
        longitude: point.lng,
        latitude: point.lat + 0.0002,
        accuracy: 5,
      },
      timestamp: now,
    },
    approximate: false,
  };
  const catalog = {
    point,
    until: now + 20000,
    items: [item("edge", 190), item("close", 20)],
  };
  expect(nearbyFromSnapshots(catalog, null, current).map((c) => c.key)).toEqual(
    ["close"],
  );
  expect(catalog.items).toHaveLength(2);
});

it("expires catalog and provider snapshots independently without reviving an expired catalog from a late provider response", () => {
  const now = Date.now(),
    point = { lng: -118.1, lat: 34.1 };
  const current = {
    fix: {
      coords: { longitude: point.lng, latitude: point.lat, accuracy: 5 },
      timestamp: now,
    },
    approximate: false,
  };
  const catalog = {
    point,
    until: now - 1,
    items: [item("expired-catalog", 0)],
  };
  const provider = {
    point,
    until: now + 60000,
    items: [item("temporary", 25)],
  };
  expect(
    nearbyFromSnapshots(catalog, provider, current).map((c) => c.key),
  ).toEqual(["temporary"]);
  expect(
    nearbyFromSnapshots(catalog, { ...provider, until: now - 1 }, current),
  ).toEqual([]);
  expect(
    nearbyFromSnapshots(null, provider, { ...current, approximate: true }),
  ).toEqual([]);
});
it("orders by distance without password metadata and deduplicates identities", () => {
  expect(
    mergeNearby([item("a", 100)], [item("b", 20), item("a", 100)]).map(
      (c) => c.key,
    ),
  ).toEqual(["b", "a"]);
  expect(distanceM(item("a", 1).point, item("b", 2).point)).toBe(0);
});
it("keeps temporary contribution handoff isolated by account and random key", () => {
  expect(getNearbyContribution(undefined, "TEST-a")).toBeUndefined();
  setNearbyContribution("TEST-key", "TEST-a", item("a", 10));
  expect(getNearbyContribution("TEST-key", "TEST-b")).toBeUndefined();
  expect(getNearbyContribution("TEST-key", "TEST-a")?.key).toBe("a");
});

it("prefers newly catalogued addresses over cached temporary duplicates without merging distinct catalog IDs", () => {
  const address = {
    address_line1: "100 TEST St",
    city: "TEST City",
    state: "CA",
    postal_code: null,
  };
  const catalog: C = {
    ...item("catalog", 25),
    source: "catalog",
    address,
    apartment: {
      ...address,
      id: "catalog",
      name: null,
      point: item("a", 1).point,
      confidence: "unverified",
    },
  };
  const temporary = {
    ...item("provider", 0),
    address: { ...address, address_line1: "100 Test Street" },
  };
  expect(mergeNearby([catalog], [temporary]).map((c) => c.key)).toEqual([
    "catalog",
  ]);
  const other = {
    ...catalog,
    key: "other",
    apartment: { ...catalog.apartment!, id: "other" },
  };
  expect(mergeNearby([catalog, other], [temporary])).toHaveLength(2);
});

it("keeps boundary-based communities within radius without using the distant centroid", () => {
  const origin = { lng: -118.1, lat: 34.1 },
    current = { ...origin, lat: origin.lat + 0.00005 };
  const community = {
    ...item("community", 0),
    point: { lng: -118.1, lat: 34.11 },
  };
  expect(
    withinNearbyRadius(
      [community, item("edge", 198), item("close", 20)],
      origin,
      current,
    ).map((c) => c.key),
  ).toEqual(["community", "close"]);
});
it("rejects expired discovery data and preserves response identity while trimming moved-radius edges", () => {
  const origin = {
    fix: {
      coords: { longitude: -118.1, latitude: 34.1, accuracy: 5 },
      timestamp: Date.now(),
    },
    approximate: false,
  };
  const current = {
    ...origin,
    fix: {
      ...origin.fix,
      coords: { ...origin.fix.coords, latitude: 34.10005 },
    },
  };
  const lookup = {
    items: [item("a", 10), item("edge", 198)],
    expires_at: new Date(Date.now() + 20000).toISOString(),
    radius_m: 200,
    truncated: false,
    provider_status: "ok" as const,
    attribution: "TEST",
    use_mode: "temporary" as const,
  };
  expect(
    nearbyAtCurrentObservation(lookup, origin, current)?.items.map(
      (c) => c.key,
    ),
  ).toEqual(["a"]);
  expect(lookup.items).toHaveLength(2);
  expect(
    nearbyAtCurrentObservation(
      { ...lookup, expires_at: new Date(Date.now() - 1).toISOString() },
      origin,
      current,
    ),
  ).toBeNull();
});
