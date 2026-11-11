import { expect, it } from "vitest";
import {
  distanceHint,
  type NearbyCardCandidate,
} from "./distance-presentation";
import {
  nearbyAtCurrentObservation,
  nearbyFromSnapshots,
  type DiscoveryObservation,
} from "./nearby-policy";
const now = Date.now(),
  point = { lng: -118.1, lat: 34.1 };
const observation: DiscoveryObservation = {
  id: "11111111-1111-4111-8111-111111111111",
  approximate: false,
  fix: {
    timestamp: now,
    coords: { longitude: point.lng, latitude: point.lat, accuracy: 5 },
  },
};
const context = {
  observation_id: observation.id!,
  observed_at: new Date(now).toISOString(),
  accuracy_m: 5,
  accuracy_permission: "precise" as const,
  valid_until: new Date(now + 20000).toISOString(),
};
const candidate: NearbyCardCandidate = {
  key: "TEST",
  source: "catalog",
  apartment: null,
  address: null,
  point,
  distance_m: 23,
  distance_basis: "community_boundary",
  classification: "catalog_community",
  requires_address_confirmation: true,
  distance_reference: { context, origin: point },
};
it("formats approximate metric proximity without exposing boundary terminology or converting absence to zero", () => {
  expect(distanceHint(candidate, observation, now)).toBe("约25 m");
  expect(distanceHint({ ...candidate, distance_m: 0 }, observation, now)).toBe(
    "10 m内",
  );
  expect(
    distanceHint({ ...candidate, distance_m: 1020 }, observation, now),
  ).toBe("约1.0 km");
  expect(
    distanceHint({ ...candidate, distance_basis: undefined }, observation, now),
  ).toBeNull();
  expect(
    distanceHint({ ...candidate, distance_m: NaN }, observation, now),
  ).toBeNull();
  expect(
    distanceHint(
      { ...candidate, distance_reference: undefined },
      observation,
      now,
    ),
  ).toBeNull();
});
it("hides an expired snapshot even with a newer GPS fix and does not relabel old geometry distances as current", () => {
  const newer = {
    ...observation,
    fix: { ...observation.fix, timestamp: now + 21000 },
  };
  expect(distanceHint(candidate, newer, now + 21000)).toBeNull();
  expect(
    distanceHint(
      candidate,
      {
        ...observation,
        fix: {
          ...observation.fix,
          coords: { ...observation.fix.coords, latitude: 34.11 },
        },
      },
      now,
    ),
  ).toBeNull();
  expect(
    distanceHint(candidate, { ...observation, approximate: true }, now),
  ).toBe("位置较粗略");
  expect(
    distanceHint(
      candidate,
      {
        ...observation,
        fix: {
          ...observation.fix,
          coords: { ...observation.fix.coords, accuracy: 60 },
        },
      },
      now,
    ),
  ).toBe("位置较粗略");
});
it("rejects wrong observation IDs and forged renewed distance leases without mutating the original response", () => {
  const lookup = {
    items: [candidate],
    radius_m: 200 as const,
    truncated: false,
    provider_status: "ok" as const,
    expires_at: new Date(now + 60000).toISOString(),
    attribution: "TEST",
    use_mode: "temporary" as const,
    distance_context: context,
  };
  expect(
    nearbyAtCurrentObservation(lookup, observation, observation)?.items,
  ).toHaveLength(1);
  expect(
    nearbyAtCurrentObservation(
      { ...lookup, distance_context: { ...context, observation_id: null } },
      observation,
      observation,
    ),
  ).toBeNull();
  expect(
    nearbyAtCurrentObservation(
      {
        ...lookup,
        distance_context: {
          ...context,
          valid_until: new Date(now + 60000).toISOString(),
        },
      },
      observation,
      observation,
    ),
  ).toBeNull();
  expect(lookup.items[0]).toBe(candidate);
});
it("uses one atomic catalog+provider ranking rather than mixing a newer catalog distance origin", () => {
  const newerCatalog = {
    items: [{ ...candidate, key: "NEW-ORIGIN", distance_m: 0 }],
    point,
    until: now + 20000,
    context,
  };
  const bundle = {
    items: [candidate, { ...candidate, key: "PROVIDER", distance_m: 30 }],
    point,
    until: now + 60000,
    context,
    complete: true,
  };
  const result = nearbyFromSnapshots(newerCatalog, bundle, observation);
  expect(result.map((c) => c.key)).toEqual(["TEST", "PROVIDER"]);
  expect(result[0]?.distance_reference?.context).toBe(context);
  expect(
    nearbyFromSnapshots(
      newerCatalog,
      { ...bundle, until: now - 1 },
      observation,
    ).map((c) => c.key),
  ).toEqual(["NEW-ORIGIN"]);
});
