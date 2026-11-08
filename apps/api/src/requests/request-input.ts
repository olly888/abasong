import { z } from "zod";
import { ApiError } from "../common/api-error";
const text = (n: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(n)
    .refine((s) =>
      [...s].every(
        (c) =>
          (multiline && c === "\n") ||
          (c.codePointAt(0)! >= 32 && c.codePointAt(0) !== 127),
      ),
    );
const uuid = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
export const requestKind = z.enum([
  "partial_route",
  "whole_route",
  "extra_drivers",
  "vehicle_help",
  "other_help",
]);
const fields = {
  region_id: uuid.optional(),
  pickup_region_id: uuid.optional(),
  carrier: text(80).optional(),
  route_label: text(80).optional(),
  description: text(1000, true).optional(),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  expires_at: z.iso.datetime({ offset: true }).optional(),
  pickup_deadline_at: z.iso.datetime({ offset: true }).optional(),
  delivery_deadline_at: z.iso.datetime({ offset: true }).optional(),
  timezone: z.literal("America/Los_Angeles").optional(),
  parcel_count: z.number().int().positive().max(2147483647).optional(),
  stop_count: z.number().int().positive().max(2147483647).optional(),
  drivers_needed: z.number().int().positive().max(2147483647).optional(),
  price_cents: z.number().int().min(0).max(2147483647).optional(),
  price_unit: z.enum(["per_parcel", "per_route", "negotiable"]).optional(),
  sorted_state: z.enum(["sorted", "unsorted", "unknown"]).optional(),
  handoff_requirement: z
    .enum(["carrier_account", "dsp_approval", "contact_confirm"])
    .optional(),
  private_payment_terms: text(300).optional(),
  accepts_partial: z.boolean().optional(),
  minimum_parcels: z
    .number()
    .int()
    .positive()
    .max(2147483647)
    .nullable()
    .optional(),
  experience_requirement: z
    .enum(["any", "delivery_experience", "carrier_experience"])
    .optional(),
};
export const draftInput = z
  .object({ kind: requestKind, organization_id: uuid.optional(), ...fields })
  .strict();
export const patchInput = z
  .object({
    expected_version: z.number().int().positive(),
    ...fields,
    price_cents: fields.price_cents.nullable(),
    parcel_count: fields.parcel_count.nullable(),
    stop_count: fields.stop_count.nullable(),
    drivers_needed: fields.drivers_needed.nullable(),
    pickup_deadline_at: fields.pickup_deadline_at.nullable(),
    delivery_deadline_at: fields.delivery_deadline_at.nullable(),
  })
  .strict();
export const versionInput = z
  .object({ expected_version: z.number().int().positive() })
  .strict();
export const closeInput = versionInput
  .extend({ status: z.enum(["found", "closed"]) })
  .strict();
export const gapInput = versionInput
  .extend({
    remaining_parcels: z.number().int().min(0).max(2147483647).optional(),
    remaining_drivers: z.number().int().min(0).max(2147483647).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.remaining_parcels !== undefined || v.remaining_drivers !== undefined,
  );
export const requestPageInput = z
  .object({
    cursor: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    region_id: uuid.optional(),
    kind: requestKind.optional(),
    scenario: z.enum(["warehouse_shortage", "delivery_handoff"]).optional(),
    carrier: text(80).optional(),
    query: text(200).optional(),
    day: z.iso.date().optional(),
    request_schema_version: z.coerce.number().int().min(1).max(2).optional(),
  })
  .strict();
export function checked<T>(schema: z.ZodType<T>, input: unknown): T {
  const p = schema.safeParse(input);
  if (!p.success) throw new ApiError(400, "INVALID_INPUT", "请检查需求信息");
  return p.data;
}
export const requestId = (input: unknown) => checked(uuid, input);
export function validatePublishing(r: Record<string, unknown>, now: number) {
  const invalid = (message: string): never => {
    throw new ApiError(422, "REQUEST_INCOMPLETE", message);
  };
  const start = Date.parse(String(r.starts_at)),
    end = Date.parse(String(r.expires_at));
  if (!r.region_id || !Number.isFinite(start) || !Number.isFinite(end))
    invalid("请选择区域、开始时间和截止时间");
  if (end <= now || end <= start) invalid("有效截止须晚于当前和开始时间");
  const pickup = r.pickup_deadline_at
      ? Date.parse(String(r.pickup_deadline_at))
      : null,
    delivery = r.delivery_deadline_at
      ? Date.parse(String(r.delivery_deadline_at))
      : null;
  if (
    (pickup !== null && (pickup < start || end > pickup)) ||
    (delivery !== null && (delivery < start || end > delivery)) ||
    (pickup !== null && delivery !== null && pickup > delivery)
  )
    invalid("请核对取件、配送与有效截止时间");
  if (["vehicle_help", "other_help"].includes(String(r.kind))) {
    if (!String(r.description ?? "").trim()) invalid("请说明需要什么帮助");
    return;
  }
  if (
    !r.pickup_region_id ||
    !String(r.carrier ?? "").trim() ||
    !r.parcel_count ||
    !r.price_unit ||
    !r.sorted_state ||
    !r.handoff_requirement
  )
    invalid("请补齐承运商、取件区域、件数、报价和接手条件");
  if (
    r.price_unit !== "negotiable" &&
    (r.price_cents === null || r.price_cents === undefined)
  )
    invalid("请填写报价，或选择联系议价");
  if (Number(r.minimum_parcels) > Number(r.parcel_count))
    invalid("最低承接量不能超过本次件数");
  if (
    r.kind === "whole_route" &&
    (r.accepts_partial !== false || r.minimum_parcels !== r.parcel_count)
  )
    invalid("整条线路须整线承接");
  if (r.kind === "extra_drivers" && !r.drivers_needed)
    invalid("请填写本次需要几名司机");
}
