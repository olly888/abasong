import { addressIdentity } from "@abasong/contracts";
import type { components } from "@abasong/contracts";
type S = components["schemas"];
export function distanceM(a: S["Point"], b: S["Point"]) {
  const r = Math.PI / 180,
    h =
      Math.sin(((a.lat - b.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) *
        Math.cos(b.lat * r) *
        Math.sin(((a.lng - b.lng) * r) / 2) ** 2;
  return 12742017.6 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function mergeNearby(
  catalog: S["NearbyCandidate"][],
  provider: S["NearbyCandidate"][],
) {
  const catalogAddresses = new Set(
    catalog.map((c) => addressIdentity(c.address)).filter(Boolean),
  );
  const identities = new Set<string>(),
    providerAddresses = new Set<string>();
  return [...catalog, ...provider]
    .filter((c) => {
      const id = c.apartment?.id ?? c.key;
      if (identities.has(id)) return false;
      const address = addressIdentity(c.address);
      if (!c.apartment && address) {
        if (catalogAddresses.has(address) || providerAddresses.has(address))
          return false;
        providerAddresses.add(address);
      }
      identities.add(id);
      return true;
    })
    .sort((a, b) => a.distance_m - b.distance_m || a.key.localeCompare(b.key))
    .slice(0, 20);
}

export type DiscoveryObservation = {
  fix: import("./foreground-location").ForegroundFix;
  approximate: boolean;
};
export function isFreshDiscoveryObservation(
  a: DiscoveryObservation,
  now = Date.now(),
) {
  const c = a.fix.coords;
  return (
    !a.approximate &&
    c.accuracy !== null &&
    Number.isFinite(c.accuracy) &&
    c.accuracy >= 0 &&
    c.accuracy <= 100 &&
    Number.isFinite(c.latitude) &&
    Math.abs(c.latitude) <= 90 &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.longitude) <= 180 &&
    Number.isFinite(a.fix.timestamp) &&
    now - a.fix.timestamp <= 20000 &&
    now - a.fix.timestamp >= -1000
  );
}
export function observationPoint(a: DiscoveryObservation): S["Point"] {
  return { lng: a.fix.coords.longitude, lat: a.fix.coords.latitude };
}
// Nearby recommendations tolerate small GPS drift; this never confirms arrival.
export function sameDiscoveryObservation(
  a: DiscoveryObservation,
  b: DiscoveryObservation,
) {
  return (
    isFreshDiscoveryObservation(a) &&
    isFreshDiscoveryObservation(b) &&
    distanceM(observationPoint(a), observationPoint(b)) <= 15
  );
}
// Boundary distances obey the same triangle inequality as point distances.
// Keep only candidates provably within the radius after the query point moves;
// never replace a community boundary distance with its distant centroid.
export function withinNearbyRadius(
  items: S["NearbyCandidate"][],
  origin: S["Point"],
  current: S["Point"],
  radius = 200,
) {
  const shift = distanceM(origin, current);
  return items.filter(
    (c) =>
      Number.isFinite(c.distance_m) &&
      c.distance_m >= 0 &&
      c.distance_m + shift <= Math.min(200, radius),
  );
}
export function nearbyAtCurrentObservation(
  lookup: S["NearbyDiscovery"],
  origin: DiscoveryObservation,
  current: DiscoveryObservation,
) {
  if (
    !sameDiscoveryObservation(origin, current) ||
    !(Date.parse(lookup.expires_at) > Date.now())
  )
    return null;
  return {
    ...lookup,
    items: withinNearbyRadius(
      lookup.items,
      observationPoint(origin),
      observationPoint(current),
      lookup.radius_m,
    ),
  };
}
