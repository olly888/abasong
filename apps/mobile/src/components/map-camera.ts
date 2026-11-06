import type { components } from "@abasong/contracts";
type Point = components["schemas"]["Point"];
// Ephemeral viewport only. Never a driver location or a discovery query input.
export type MapCameraSnapshot = {
  center: Point;
  zoom: number;
  heading: number;
  pitch: number;
};
export function cameraSnapshot(p: {
  center: number[];
  zoom: number;
  heading: number;
  pitch: number;
}): MapCameraSnapshot | null {
  const [lng, lat] = p.center;
  if (
    ![lng, lat, p.zoom, p.heading, p.pitch].every(Number.isFinite) ||
    Math.abs(lng!) > 180 ||
    Math.abs(lat!) > 85.051129 ||
    p.zoom < 0 ||
    p.zoom > 20 ||
    p.pitch < 0 ||
    p.pitch > 85
  )
    return null;
  return {
    center: { lng: lng!, lat: lat! },
    zoom: p.zoom,
    heading: ((p.heading % 360) + 360) % 360,
    pitch: p.pitch,
  };
}
export function cameraAt(
  center: Point,
  previous?: MapCameraSnapshot,
): MapCameraSnapshot {
  return {
    center: { ...center },
    zoom: previous?.zoom ?? 14,
    heading: previous?.heading ?? 0,
    pitch: previous?.pitch ?? 0,
  };
}
