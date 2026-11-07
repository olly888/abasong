import { addressIdentity } from "@abasong/contracts";
import type { components } from "@abasong/contracts";
import type { NearbyCardCandidate } from "./distance-presentation";
type S = components["schemas"];
export type ProviderDiscoveryStatus = "idle" | "loading" | "ok" | "unavailable";
export function nearbyResultState(
  hasCandidates: boolean,
  provider: ProviderDiscoveryStatus,
) {
  if (hasCandidates) return "nearby";
  if (provider === "ok") return "empty";
  return provider === "unavailable" ? "error" : "loading";
}

function nearbyOrder(a: S["NearbyCandidate"], b: S["NearbyCandidate"]) {
  // Initial recommendations follow the same numeric distance as the card.
  // Stability after deliberate selection is handled by the reading lock.
  const difference = a.distance_m - b.distance_m;
  if (difference) return difference;
  const resolved = (c: S["NearbyCandidate"]) =>
    Number(!!c.apartment && !c.requires_address_confirmation);
  const identity = (c: S["NearbyCandidate"]) =>
    addressIdentity(c.address) ?? c.provider_feature_id ?? c.key;
  return (
    resolved(b) - resolved(a) ||
    identity(a).localeCompare(identity(b)) ||
    a.key.localeCompare(b.key)
  );
}
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
    .sort(nearbyOrder)
    .slice(0, 20);
}

export type DiscoveryObservation = {
  fix: import("./foreground-location").ForegroundFix;
  approximate: boolean;
  id?: string;
};
export function discoveryInput(o: DiscoveryObservation): S["NearbyInput"] {
  return {
    point: observationPoint(o),
    observed_at: new Date(o.fix.timestamp).toISOString(),
    accuracy_m: o.fix.coords.accuracy ?? 100000,
    accuracy_permission: o.approximate ? "approximate" : "precise",
    ...(o.id ? { observation_id: o.id } : {}),
  };
}
export function matchesDistanceContext(
  lookup: S["NearbyDiscovery"],
  o: DiscoveryObservation,
) {
  const c = lookup.distance_context;
  // Legacy discovery is still usable, but has no displayable distance context.
  return (
    !c ||
    (c.observed_at === new Date(o.fix.timestamp).toISOString() &&
      c.accuracy_m === o.fix.coords.accuracy &&
      c.accuracy_permission === (o.approximate ? "approximate" : "precise") &&
      c.observation_id === (o.id ?? null) &&
      Date.parse(c.valid_until) <= o.fix.timestamp + 20000)
  );
}
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
    !matchesDistanceContext(lookup, origin) ||
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

export type NearbySnapshot = {
  items: S["NearbyCandidate"][];
  point: S["Point"];
  until: number;
  context?: S["DistanceContext"];
  complete?: boolean;
};

// Revalidate visible automatic recommendations on every fresh fix, not only
// when another network lookup completes. Each source retains its own origin
// and lease; a late optional provider response cannot renew catalog data.
export function nearbyFromSnapshots(
  catalog: NearbySnapshot | null,
  provider: NearbySnapshot | null,
  observation: DiscoveryObservation,
): NearbyCardCandidate[] {
  if (!isFreshDiscoveryObservation(observation)) return [];
  const current = observationPoint(observation),
    now = Date.now();
  const visible = (snapshot: NearbySnapshot | null): NearbyCardCandidate[] =>
    snapshot && snapshot.until > now
      ? withinNearbyRadius(snapshot.items, snapshot.point, current).map(
          (c) => ({
            ...c,
            ...(snapshot.context
              ? {
                  distance_reference: {
                    context: snapshot.context,
                    origin: snapshot.point,
                  },
                }
              : {}),
          }),
        )
      : [];
  // New provider responses are atomic catalog+map bundles. Keep their common
  // ranking origin during small GPS drift; never mix their distances with a
  // newer catalog origin. A different fix cannot extend the label's lifetime.
  if (
    provider?.complete &&
    provider.items.length > 0 &&
    provider.until > now &&
    distanceM(provider.point, current) <= 15
  )
    return visible(provider);
  if (provider?.complete) return visible(catalog);
  return mergeNearby(visible(catalog), visible(provider));
}
