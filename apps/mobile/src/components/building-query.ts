import type { components } from "@abasong/contracts";
type S = components["schemas"];
type Geometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
export type BuildingTarget = {
  key: string;
  point: S["Point"];
  featureId?: string;
};
export function featureId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  if (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    ![...value].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127)
  )
    return value;
  return undefined;
}
function geometries(raw: unknown) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("features" in raw) ||
    !Array.isArray(raw.features)
  )
    return [];
  const result: Array<{ id?: string; geometry: Geometry }> = [];
  let total = 0;
  for (const f of raw.features.slice(0, 1000)) {
    if (!f || typeof f !== "object" || f.properties?.type === "building:part")
      continue;
    const g = f.geometry;
    if (
      !g ||
      !["Polygon", "MultiPolygon"].includes(g.type) ||
      !Array.isArray(g.coordinates)
    )
      continue;
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (!polygons.length || polygons.length > 100) continue;
    let n = 0;
    const valid = polygons.every(
      (polygon: unknown) =>
        Array.isArray(polygon) &&
        polygon.length > 0 &&
        polygon.length <= 100 &&
        polygon.every((ring: unknown) => {
          if (!Array.isArray(ring) || ring.length < 4 || ring.length > 5000)
            return false;
          n += ring.length;
          return (
            ring.every(
              (p: unknown) =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every(Number.isFinite) &&
                Math.abs(p[0]) <= 180 &&
                Math.abs(p[1]) <= 90,
            ) &&
            ring[0][0] === ring.at(-1)[0] &&
            ring[0][1] === ring.at(-1)[1] &&
            Math.abs(
              ring.slice(1).reduce((area: number, p: number[], i: number) => {
                const a = ring[i];
                return (
                  area +
                  (a[0] - ring[0][0]) * (p[1]! - ring[0][1]) -
                  (p[0]! - ring[0][0]) * (a[1] - ring[0][1])
                );
              }, 0),
            ) > 1e-16
          );
        }),
    );
    if (!valid || n > 10000) continue;
    total += n;
    if (total > 20000) break;
    result.push({ id: featureId(f.id), geometry: g as Geometry });
  }
  return result;
}
// 0 outside, 1 inside, 2 on edge. Preserve courtyard holes and boundaries.
function ringContains(ring: GeoJSON.Position[], p: S["Point"]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!,
      b = ring[i]!,
      dx = b[0]! - a[0]!,
      dy = b[1]! - a[1]!;
    const cross = (p.lng - a[0]!) * dy - (p.lat - a[1]!) * dx;
    if (
      Math.abs(cross) <= 1e-12 &&
      p.lng >= Math.min(a[0]!, b[0]!) - 1e-10 &&
      p.lng <= Math.max(a[0]!, b[0]!) + 1e-10 &&
      p.lat >= Math.min(a[1]!, b[1]!) - 1e-10 &&
      p.lat <= Math.max(a[1]!, b[1]!) + 1e-10
    )
      return 2;
    if (
      a[1]! > p.lat !== b[1]! > p.lat &&
      p.lng < ((b[0]! - a[0]!) * (p.lat - a[1]!)) / (b[1]! - a[1]!) + a[0]!
    )
      inside = !inside;
  }
  return inside ? 1 : 0;
}
function contains(g: Geometry, p: S["Point"]) {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polygons.some(
    (rings) =>
      ringContains(rings[0]!, p) !== 0 &&
      !rings.slice(1).some((r) => ringContains(r, p) === 1),
  );
}
export function selectedBuildingGeometry(
  raw: unknown,
  target: BuildingTarget,
): GeoJSON.FeatureCollection<Geometry> {
  const all = geometries(raw);
  const matching = target.featureId
    ? all.filter((f) => f.id === target.featureId)
    : all.filter((f) => contains(f.geometry, target.point));
  const identities = new Set(
    matching.map((f) => f.id ?? JSON.stringify(f.geometry)),
  );
  const selected = identities.size === 1 ? matching : [];
  const seen = new Set<string>();
  return {
    type: "FeatureCollection",
    features: selected
      .filter((f) => {
        const key = JSON.stringify(f.geometry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((f, i) => ({
        type: "Feature",
        id: "selected-sdk-" + i,
        properties: {},
        geometry: f.geometry,
      })),
  };
}
export function candidateForBuilding(
  raw: unknown,
  candidates: readonly S["NearbyCandidate"][],
): S["NearbyCandidate"] | undefined {
  const all = geometries(raw);
  const matches = candidates.filter((c) =>
    all.some((f) =>
      c.provider_feature_id
        ? f.id === c.provider_feature_id
        : contains(f.geometry, c.point),
    ),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
