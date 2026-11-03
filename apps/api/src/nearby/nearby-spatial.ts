type Point = { lng: number; lat: number };
const rad = Math.PI / 180,
  earth = 6371008.8;
export function distanceM(a: Point, b: Point) {
  const h =
    Math.sin(((a.lat - b.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((a.lng - b.lng) * rad) / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function offsetPoint(p: Point, metres: number, bearing: number): Point {
  const lat = p.lat * rad,
    lng = p.lng * rad,
    d = metres / earth,
    b = bearing * rad;
  const next = Math.asin(
    Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b),
  );
  const lon =
    lng +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(next),
    );
  return { lat: next / rad, lng: ((lon / rad + 540) % 360) - 180 };
}
export function mapFeatureId(value: unknown): string | undefined {
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
