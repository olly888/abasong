import type { components } from "@abasong/contracts";
type Building =
  components["schemas"]["ApartmentMapContext"]["buildings"][number];
type Padding = {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
};
// Mercator / 512 logical-pixel world. Only explicitly selected public geometry
// frames the camera; this calculation never determines apartment membership.
export function buildingCamera(
  buildings: Building[],
  width: number,
  height: number,
  padding: Padding,
) {
  const positions = buildings.flatMap((b) => b.geometry.coordinates.flat(2));
  const availableWidth = width - padding.paddingLeft - padding.paddingRight;
  const availableHeight = height - padding.paddingTop - padding.paddingBottom;
  if (!positions.length || availableWidth <= 0 || availableHeight <= 0)
    return null;
  if (
    positions.some(
      (p) =>
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]!) > 180 ||
        Math.abs(p[1]!) > 85,
    )
  )
    return null;
  const xs = positions.map((p) => (p[0]! + 180) / 360);
  const ys = positions.map(
    (p) => (1 - Math.asinh(Math.tan((p[1]! * Math.PI) / 180)) / Math.PI) / 2,
  );
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  if (maxX - minX > 0.5) return null; // Not an LA/local footprint; no world-spanning fit.
  const zoom = Math.log2(
    Math.min(
      availableWidth / (512 * Math.max(maxX - minX, 1e-9)),
      availableHeight / (512 * Math.max(maxY - minY, 1e-9)),
    ),
  );
  return {
    centerCoordinate: [
      (minX + maxX) * 180 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - minY - maxY))) * 180) / Math.PI,
    ],
    zoomLevel: Math.max(0, Math.min(18, zoom)),
  };
}
