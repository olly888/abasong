import { z } from "zod";
import { ApiError } from "../common/api-error";
import { checked } from "./request-input";

// Prepared contract/normalization only. R4-07 must wire transaction and object
// authorization together; V1 controllers do not accept these inputs yet.
const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((s) =>
      [...s].every(
        (c) =>
          (multiline && c === "\n") ||
          (c.codePointAt(0)! >= 32 && c.codePointAt(0) !== 127),
      ),
    );
const id = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
const count = z.number().int().positive().max(2147483647);
const instant = z.iso.datetime({ offset: true });
const warehouse = z
  .object({
    kind: z.literal("warehouse"),
    name: text(160).nullable().optional(),
    address_line1: text(200).nullable().optional(),
    city: text(100).nullable().optional(),
    state: text(2).nullable().optional(),
    postal_code: text(12).nullable().optional(),
    address_confirmed: z.boolean().optional(),
    address_source: z
      .enum(["publisher_entered", "mapbox_suggestion"])
      .optional(),
  })
  .strict();
export const pickupV2Input = z.discriminatedUnion("kind", [
  warehouse,
  z.object({ kind: z.literal("contact_handoff") }).strict(),
]);
const fields = {
  region_id: id.optional(),
  pickup_region_id: id.optional(),
  carrier: text(80).optional(),
  route_label: text(80).optional(),
  description: text(1000, true).optional(),
  task_scope: z.enum(["partial", "whole_route"]).optional(),
  quantity_mode: z.enum(["exact", "estimate", "unknown"]).optional(),
  parcel_count: count.nullable().optional(),
  stop_count: count.nullable().optional(),
  drivers_needed: count.nullable().optional(),
  minimum_parcels: count.nullable().optional(),
  handoff_mode: z.enum(["asap", "scheduled"]).optional(),
  handoff_date: z.iso.date().optional(),
  starts_at: instant.nullable().optional(),
  pickup_deadline_at: instant.nullable().optional(),
  completion_mode: z.enum(["same_day", "next_day", "contact"]).optional(),
  delivery_deadline_at: instant.nullable().optional(),
  expires_at: instant.nullable().optional(),
  timezone: z.literal("America/Los_Angeles").optional(),
  pickup: pickupV2Input.nullable().optional(),
  price_cents: z.number().int().min(0).max(2147483647).nullable().optional(),
  price_unit: z.enum(["per_parcel", "per_route", "negotiable"]).optional(),
  sorted_state: z.enum(["sorted", "unsorted", "unknown"]).optional(),
  handoff_requirement: z
    .enum(["carrier_account", "dsp_approval", "contact_confirm"])
    .optional(),
  experience_requirement: z
    .enum(["any", "delivery_experience", "carrier_experience"])
    .optional(),
  private_payment_terms: text(300).optional(),
};
export const draftV2Input = z
  .object({
    request_schema_version: z.literal(2),
    scenario: z.enum(["warehouse_shortage", "delivery_handoff"]),
    organization_id: id.optional(),
    ...fields,
  })
  .strict();
export const patchV2Input = z
  .object({
    request_schema_version: z.literal(2),
    expected_version: count.max(2147483646),
    ...fields,
  })
  .strict();
export const gapV2Input = z
  .object({
    request_schema_version: z.literal(2),
    expected_version: count.max(2147483646),
    remaining_parcels: z
      .number()
      .int()
      .min(0)
      .max(2147483647)
      .nullable()
      .optional(),
    remaining_drivers: z.number().int().min(0).max(2147483647).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.remaining_parcels !== undefined || v.remaining_drivers !== undefined,
  );

const la = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function parts(time: number) {
  const p = Object.fromEntries(
    la.formatToParts(time).map((p) => [p.type, p.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    year: +p.year!,
    month: +p.month!,
    day: +p.day!,
    hour: +p.hour!,
    minute: +p.minute!,
  };
}
export const laDate = (time: number) => parts(time).date;
export function endOfLaDay(day: string) {
  checked(z.iso.date(), day);
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, 23, 59);
  let time = wall;
  for (let i = 0; i < 3; i++) {
    const p = parts(time);
    const delta = wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (!delta) return time + 59999;
    time += delta;
  }
  throw new ApiError(422, "REQUEST_INCOMPLETE", "请重新选择接手日期");
}
function nextDay(day: string) {
  return new Date(Date.parse(day + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
}
function incomplete(message: string): never {
  throw new ApiError(422, "REQUEST_INCOMPLETE", message);
}
export function prepareV2Publication(input: unknown, now: number) {
  if (!Number.isFinite(now)) throw new Error("Publication clock unavailable");
  const p = checked(draftV2Input, input);
  if (
    !p.region_id ||
    !p.pickup_region_id ||
    !p.carrier ||
    !p.pickup ||
    !p.task_scope ||
    !p.quantity_mode ||
    !p.handoff_mode ||
    !p.handoff_date ||
    !p.completion_mode ||
    !p.price_unit ||
    !p.sorted_state ||
    !p.handoff_requirement
  )
    incomplete("请补齐派送、取件、接手时间、任务量、报价和接手条件");
  if (
    p.quantity_mode === "unknown"
      ? p.parcel_count != null || p.minimum_parcels != null
      : !p.parcel_count
  )
    incomplete("请核对确定、约数或待确认的包裹数量");
  if (p.task_scope === "whole_route" && p.quantity_mode !== "exact")
    incomplete("整线接手须先确认整批件数");
  if (
    p.quantity_mode === "exact" &&
    p.minimum_parcels &&
    p.minimum_parcels > p.parcel_count!
  )
    incomplete("最低承接量不能超过已确认的整批件数");
  if (p.scenario === "warehouse_shortage" && !p.drivers_needed)
    incomplete("请填写需要几名司机");
  if (p.price_unit !== "negotiable" && p.price_cents == null)
    incomplete("请填写报价，或明确选择联系议价");
  if (p.pickup.kind === "warehouse") {
    if (
      !p.pickup.address_source ||
      !p.pickup.address_confirmed ||
      !p.pickup.address_line1 ||
      !p.pickup.city ||
      !/^[A-Z]{2}$/.test(p.pickup.state ?? "") ||
      (p.pickup.postal_code && !/^\d{5}(-\d{4})?$/.test(p.pickup.postal_code))
    )
      incomplete("请核对并确认仓库完整地址");
  }
  let start: number;
  if (p.handoff_mode === "asap") {
    if (p.starts_at != null || p.handoff_date !== laDate(now))
      incomplete("尽快接手仅适用于今天，请重新核对日期");
    start = now;
  } else {
    start = Date.parse(p.starts_at ?? "");
    if (
      !Number.isFinite(start) ||
      start < now ||
      laDate(start) !== p.handoff_date
    )
      incomplete("请选择未来的接手时间及对应洛杉矶日期");
  }
  const pickupEnd = p.pickup_deadline_at
    ? Date.parse(p.pickup_deadline_at)
    : null;
  if (
    pickupEnd !== null &&
    (pickupEnd < start || laDate(pickupEnd) !== p.handoff_date)
  )
    incomplete("最迟接手须在接手日且不早于希望到场时间");
  const expiry = p.expires_at
    ? Date.parse(p.expires_at)
    : (pickupEnd ?? endOfLaDay(p.handoff_date));
  if (expiry <= now || (pickupEnd !== null && expiry > pickupEnd))
    incomplete("请核对需求下架时间");
  let completion: number | null = null;
  if (p.completion_mode === "contact") {
    if (p.delivery_deadline_at != null)
      incomplete("联系确认送完时间时，请清除旧截止时间");
  } else {
    const day =
      p.completion_mode === "next_day"
        ? nextDay(p.handoff_date)
        : p.handoff_date;
    const latest = endOfLaDay(day);
    completion = p.delivery_deadline_at
      ? Date.parse(p.delivery_deadline_at)
      : latest;
    if (completion < start || completion > latest)
      incomplete("请核对送完要求和截止时间");
  }
  return {
    ...p,
    kind:
      p.scenario === "warehouse_shortage"
        ? ("extra_drivers" as const)
        : p.task_scope === "whole_route"
          ? ("whole_route" as const)
          : ("partial_route" as const),
    timezone: "America/Los_Angeles" as const,
    starts_at: new Date(start).toISOString(),
    expires_at: new Date(expiry).toISOString(),
    pickup_deadline_at:
      pickupEnd === null ? null : new Date(pickupEnd).toISOString(),
    delivery_deadline_at:
      completion === null ? null : new Date(completion).toISOString(),
    parcel_count: p.parcel_count ?? null,
    remaining_parcels: p.quantity_mode === "exact" ? p.parcel_count! : null,
    drivers_needed: p.drivers_needed ?? null,
    remaining_drivers: p.drivers_needed ?? null,
    accepts_partial: p.task_scope !== "whole_route",
    minimum_parcels:
      p.task_scope === "whole_route"
        ? p.parcel_count!
        : (p.minimum_parcels ?? null),
    price_cents: p.price_unit === "negotiable" ? null : p.price_cents!,
  };
}
