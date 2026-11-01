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
  const seen = new Set<string>();
  return [...catalog, ...provider]
    .sort((a, b) => a.distance_m - b.distance_m || a.key.localeCompare(b.key))
    .filter((c) => {
      const k = c.apartment?.id ?? c.key;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 20);
}
