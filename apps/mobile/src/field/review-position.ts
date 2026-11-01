import type { ForegroundFix } from "../apartments/foreground-location";
export function reviewPoint(fix: ForegroundFix, now: number) {
  const { longitude: lng, latitude: lat, accuracy } = fix.coords;
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(fix.timestamp) ||
    now - fix.timestamp > 20000 ||
    fix.timestamp > now + 1000 ||
    accuracy === null ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    return null;
  return { lng, lat };
}
