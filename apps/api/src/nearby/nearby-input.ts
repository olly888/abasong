import { z } from "zod";
import { ApiError } from "../common/api-error";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        ![...s].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127),
    );
export const observation = z
  .object({
    point: z
      .object({
        lng: z.number().finite().min(-180).max(180),
        lat: z.number().finite().min(-90).max(90),
      })
      .strict(),
    observed_at: z.string().datetime({ offset: true }),
    accuracy_m: z.number().finite().min(0).max(100000),
    accuracy_permission: z.enum(["precise", "approximate"]),
  })
  .strict();
export const confirmedAddress = z
  .object({
    address_line1: text(200),
    city: text(100),
    state: z.string().regex(/^[A-Z]{2}$/),
    postal_code: z
      .string()
      .regex(/^\d{5}(?:-\d{4})?$/)
      .nullable(),
  })
  .strict();
export const addressContribution = z
  .object({
    address: confirmedAddress,
    method: z.literal("keypad"),
    value: text(32),
    scope: z
      .object({ label: text(100) })
      .strict()
      .optional(),
    source_attested: z.literal(true),
    address_confirmed: z.literal(true),
  })
  .strict();
export function checked<T>(schema: z.ZodType<T>, body: unknown): T {
  const p = schema.safeParse(body);
  if (!p.success)
    throw new ApiError(400, "INVALID_INPUT", "请核对地址与填写内容");
  return p.data;
}
export function freshObservation(body: unknown) {
  const p = checked(observation, body),
    age = Date.now() - Date.parse(p.observed_at);
  if (age > 20000 || age < -1000)
    throw new ApiError(409, "STALE_LOCATION", "位置需要更新");
  if (p.accuracy_permission !== "precise" || p.accuracy_m > 100)
    throw new ApiError(409, "IMPRECISE_LOCATION", "请开启精确位置，或搜索地址");
  return p;
}
