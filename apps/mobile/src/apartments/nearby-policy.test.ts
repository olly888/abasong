import { expect, it } from "vitest";
import {
  mergeNearby,
  discoveryInput,
  nearbyRangeLabel,
  distanceM,
  nearbyAtCurrentObservation,
  nearbyFromSnapshots,
  nearbyResultState,
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
const resolved = (distance_m: number): C => {
  const address = {
    address_line1: "2445 TEST St",
    city: "TEST City",
    state: "CA",
    postal_code: null,
  };
  return {
    ...item("z-known", distance_m),
    address,
    source: "catalog",
    requires_address_confirmation: false,
    apartment: {
      ...address,
      id: "z-known",
      name: null,
      point: item("p", 0).point,
      confidence: "authorized_source",
    },
  };
};
it("prefers a known address only at an exact distance tie; closer candidates are not displaced by data availability", () => {
  expect(mergeNearby([resolved(0)], [item("a-temporary", 0)])[0]?.key).toBe(
    "z-known",
  );
  for (const d of [0.22, 0.01, 0.22])
    expect(mergeNearby([resolved(d)], [item("a-temporary", 0)])[0]?.key).toBe(
      "a-temporary",
    );
});
it("uses postal identity rather than fresh random keys for equal-distance temporary cards", () => {
  const address = {
    address_line1: "100 TEST St",
    city: "TEST City",
    state: "CA",
    postal_code: null,
  };
  const a = { ...item("z-random", 20), address };
  const b = {
    ...item("a-random", 20),
    address: { ...address, address_line1: "102 TEST St" },
  };
  expect(mergeNearby([], [b, a]).map((c) => c.address?.address_line1)).toEqual([
    "100 TEST St",
    "102 TEST St",
  ]);
  expect(
    mergeNearby(
      [],
      [
        { ...a, key: "a-next" },
        { ...b, key: "z-next" },
      ],
    ).map((c) => c.address?.address_line1),
  ).toEqual(["100 TEST St", "102 TEST St"]);
});
it("still recommends a clearly closer temporary address before a resolved address", () => {
  expect(mergeNearby([resolved(21)], [item("temporary", 19.9)])[0]?.key).toBe(
    "temporary",
  );
});
it("uses the provider feature identity to stabilize equally distant unresolved cards", () => {
  const a = { ...item("z-random", 10), provider_feature_id: "1" };
  const b = { ...item("a-random", 10), provider_feature_id: "2" };
  expect(mergeNearby([], [b, a]).map((c) => c.provider_feature_id)).toEqual([
    "1",
    "2",
  ]);
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
    radius_m: 200 as const,
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

it("only presents an empty result after the nearby provider has answered successfully", () => {
  expect(nearbyResultState(false, "idle")).toBe("loading");
  expect(nearbyResultState(false, "loading")).toBe("loading");
  expect(nearbyResultState(false, "ok")).toBe("empty");
  expect(nearbyResultState(false, "unavailable")).toBe("error");
  expect(nearbyResultState(true, "unavailable")).toBe("nearby");
});

it("retains expanded candidates only inside the server's allowlisted radius after drift", () => {
  const p = item("p", 0).point;
  expect(
    withinNearbyRadius(
      [item("a", 400), item("b", 499), item("c", 501)],
      p,
      p,
      500,
    ).map((c) => c.key),
  ).toEqual(["a", "b"]);
  const moved = { ...p, lat: p.lat + 0.0001 };
  expect(
    withinNearbyRadius([item("a", 490), item("b", 400)], p, moved, 500).map(
      (c) => c.key,
    ),
  ).toEqual(["b"]);
  expect(withinNearbyRadius([item("a", 900)], p, p, 1000)).toHaveLength(1);
  expect(withinNearbyRadius([item("a", 900)], p, p, 90000)).toEqual([]);
  expect(withinNearbyRadius([item("a", 400)], p, p)).toEqual([]);
});
it("does not mix an expanded bundle's origin with a newer catalog and expires its range", () => {
  const now = Date.now(),
    p = item("p", 0).point;
  const observation = {
    fix: {
      coords: { longitude: p.lng, latitude: p.lat, accuracy: 5 },
      timestamp: now,
    },
    approximate: false,
  };
  const catalog = { items: [item("near", 80)], point: p, until: now + 10000 };
  const provider = {
    items: [item("far", 400)],
    point: p,
    until: now + 10000,
    complete: true,
    radius_m: 500,
  };
  expect(
    nearbyFromSnapshots(catalog, provider, observation).map((c) => c.key),
  ).toEqual(["far"]);
  expect(
    nearbyFromSnapshots(
      catalog,
      { ...provider, until: now - 1 },
      observation,
    ).map((c) => c.key),
  ).toEqual(["near"]);
  expect(nearbyResultState(false, "partial")).toBe("partial");
  expect(nearbyResultState(false, "unavailable")).toBe("error");
});

it("requests expansion only explicitly and labels the actual range without claiming full coverage", () => {
  const o = {
    fix: {
      coords: { longitude: -118.1, latitude: 34.1, accuracy: 5 },
      timestamp: Date.now(),
    },
    approximate: false,
  };
  expect(discoveryInput(o).expand).toBeUndefined();
  expect(discoveryInput(o, true).expand).toBe(true);
  const snapshot = {
    items: [],
    point: item("p", 0).point,
    until: Date.now() + 10000,
    radius_m: 1000,
    coverage: { catalog: "queried", mapbox: "partial" },
  } as const;
  expect(nearbyRangeLabel({ ...snapshot, items: [] }, "partial")).toEqual({
    title: "附近公寓 · 1 km",
    note: "部分范围待补全",
  });
  expect(nearbyRangeLabel(null, "unavailable").note).toBe("更新失败");
  expect(nearbyRangeLabel(null, "idle")).toEqual({
    title: "附近公寓",
    note: undefined,
  });
});
