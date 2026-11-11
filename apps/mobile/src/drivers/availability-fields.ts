import type { components } from "@abasong/contracts";
import {
  laInstant,
  localDateTime,
  requestTime,
} from "../requests/presentation";
type S = components["schemas"];
export type AvailabilityFields = {
  enabled: boolean;
  date: string;
  start: string;
  end: string;
  endDate?: string;
  endDateEdited?: boolean;
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
    endDate: end.date,
    endDateEdited:
      end.date !== inferredEndDate(start.date, start.time, end.time),
    regions: value?.region_ids ?? [],
    capacity: value?.capacity_parcels ? String(value.capacity_parcels) : "",
  };
}
export function availabilityPayload(
  f: AvailabilityFields,
  version: number,
  now = Date.now(),
): S["AvailabilityInput"] {
  if (!f.enabled) return { expected_version: version, enabled: false };
  if (
    !f.regions.length ||
    f.regions.length > 5 ||
    new Set(f.regions).size !== f.regions.length
  )
    throw new Error("请选择1–5个不同的可去区域");
  if (f.capacity && !/^\d+$/.test(f.capacity))
    throw new Error("请填写有效的可接件数");
  const capacity = f.capacity ? Number(f.capacity) : null;
  if (capacity !== null && (capacity < 1 || capacity > 10000))
    throw new Error("可接件数为1–10000，或留空面议");
  const start = laInstant(f.date, f.start),
    end = laInstant(availabilityEndDate(f), f.end);
  if (
    Date.parse(end) <= now ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 86400000 ||
    Date.parse(start) > now + 7 * 86400000
  )
    throw new Error("请选择尚未结束、最长24小时的本次时段，开始时间在7天内");
  return {
    expected_version: version,
    enabled: true,
    starts_at: start,
    ends_at: end,
    region_ids: f.regions,
    capacity_parcels: capacity,
  };
}
function inferredEndDate(date: string, start: string, end: string) {
  return end <= start ? nextDate(date) : date;
}
export function availabilityEndDate(f: AvailabilityFields) {
  return f.endDate ?? inferredEndDate(f.date, f.start, f.end);
}
export function changeAvailabilityField<K extends keyof AvailabilityFields>(
  f: AvailabilityFields,
  key: K,
  value: AvailabilityFields[K],
): AvailabilityFields {
  const next = { ...f, [key]: value };
  if (key === "endDate") next.endDateEdited = true;
  if (key === "date") {
    const days = Math.round(
      (Date.parse(availabilityEndDate(f) + "T12:00:00Z") -
        Date.parse(f.date + "T12:00:00Z")) /
        86400000,
    );
    next.endDate = new Date(
      Date.parse(String(value) + "T12:00:00Z") + days * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  }
  if ((key === "start" || key === "end") && !f.endDateEdited)
    next.endDate = inferredEndDate(next.date, next.start, next.end);
  return next;
}
export function availabilityDraftKey(f: AvailabilityFields) {
  return JSON.stringify({
    ...f,
    endDate: availabilityEndDate(f),
    endDateEdited: undefined,
    regions: [...f.regions].sort(),
  });
}
export function availabilitySummary(
  value: S["Availability"] | null,
  now = Date.now(),
) {
  if (!value?.enabled) return "已关闭";
  if (Date.parse(value.ends_at) <= now) return "本次时段已结束";
  const start = localDateTime(value.starts_at),
    end = localDateTime(value.ends_at),
    today = localDateTime(null, now).date;
  const day = (s: string) =>
    s === today ? "今天" : s === nextDate(today) ? "明天" : s;
  const time = (iso: string) => requestTime(iso).replace(/^\d+\/\d+ /, "");
  return `${day(start.date)} ${time(value.starts_at)}–${end.date === start.date ? "" : day(end.date) + " "}${time(value.ends_at)} 可接活`;
}
