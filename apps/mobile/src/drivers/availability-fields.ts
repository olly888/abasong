import type { components } from "@abasong/contracts";
import { laInstant, localDateTime } from "../requests/presentation";
type S = components["schemas"];
export type AvailabilityFields = {
  enabled: boolean;
  date: string;
  start: string;
  end: string;
  regions: string[];
  capacity: string;
};
export function nextDate(date: string) {
  return new Date(Date.parse(date + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
}
export function availabilityFields(
  value: S["Availability"] | null,
  now = Date.now(),
): AvailabilityFields {
  const expired = !!value && Date.parse(value.ends_at) <= now;
  const start = localDateTime(
      !expired ? (value?.starts_at ?? null) : null,
      now,
    ),
    end = localDateTime(
      !expired
        ? (value?.ends_at ?? new Date(now + 7200000).toISOString())
        : new Date(now + 7200000).toISOString(),
    );
  return {
    enabled: !expired && (value?.enabled ?? false),
    date: start.date,
    start: start.time,
    end: end.time,
    regions: value?.region_ids ?? [],
    capacity: value?.capacity_parcels ? String(value.capacity_parcels) : "",
  };
}
export function availabilityPayload(
  f: AvailabilityFields,
  version: number,
): S["AvailabilityInput"] {
  if (!f.enabled) return { expected_version: version, enabled: false };
  if (!f.regions.length) throw new Error("请选择可去区域");
  if (f.capacity && !/^\d+$/.test(f.capacity))
    throw new Error("请填写有效的可接件数");
  const capacity = f.capacity ? Number(f.capacity) : null;
  if (capacity !== null && (capacity < 1 || capacity > 10000))
    throw new Error("可接件数为1–10000，或留空面议");
  return {
    expected_version: version,
    enabled: true,
    starts_at: laInstant(f.date, f.start),
    ends_at: laInstant(f.end <= f.start ? nextDate(f.date) : f.date, f.end),
    region_ids: f.regions,
    capacity_parcels: capacity,
  };
}
