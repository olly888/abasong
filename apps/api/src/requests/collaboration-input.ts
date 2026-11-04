import { z } from "zod";
import { ApiError } from "../common/api-error";
import type { RequestRow } from "./requests.service";
export const applyInput = z
  .object({
    expected_arrival_at: z.iso.datetime({ offset: true }),
    capacity_parcels: z.number().int().positive().max(2147483647).optional(),
    observed_request_version: z.number().int().positive().max(2147483647),
  })
  .strict();
export const conversationInput = z
  .object({
    other_user_id: z.uuid().transform((v) => v.toLowerCase()),
    source_request_id: z
      .uuid()
      .transform((v) => v.toLowerCase())
      .optional(),
    source_request_version: z
      .number()
      .int()
      .positive()
      .max(2147483647)
      .optional(),
  })
  .strict()
  .refine((x) => !!x.source_request_id === !!x.source_request_version);
export const messageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    after_sequence: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
    cursor: z.coerce
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .strict();
export const readInput = z
  .object({
    last_read_sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export function validateApplication(
  r: RequestRow,
  p: z.infer<typeof applyInput>,
  now: number,
) {
  if (
    r.status !== "open" ||
    r.is_expired ||
    !(r.expires_at instanceof Date) ||
    r.expires_at.getTime() <= now
  )
    throw new ApiError(409, "REQUEST_ENDED", "这条需求已结束");
  if (p.observed_request_version !== r.version)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "需求条件已更新，请重新核对后报名",
    );
  const arrival = Date.parse(p.expected_arrival_at);
  if (
    arrival < now - 60000 ||
    arrival > r.expires_at.getTime() ||
    (r.pickup_deadline_at instanceof Date &&
      arrival > r.pickup_deadline_at.getTime())
  )
    throw new ApiError(
      422,
      "INVALID_ARRIVAL",
      "预计到达时间须在本次有效时段内",
    );
  if (["vehicle_help", "other_help"].includes(r.kind)) {
    if (p.capacity_parcels !== undefined)
      throw new ApiError(400, "INVALID_INPUT", "此类求助无需可接件数");
    return;
  }
  const remaining = Number(r.remaining_parcels ?? 0),
    capacity = p.capacity_parcels;
  if (
    !capacity ||
    capacity > remaining ||
    capacity < Number(r.minimum_parcels ?? 1)
  )
    throw new ApiError(
      422,
      "INVALID_CAPACITY",
      "请按当前剩余件数和最低承接量填写",
    );
  if (
    (r.kind === "whole_route" || !r.accepts_partial) &&
    capacity !== remaining
  )
    throw new ApiError(422, "INVALID_CAPACITY", "这条需求须整量承接");
  if (r.kind === "extra_drivers" && Number(r.remaining_drivers ?? 0) < 1)
    throw new ApiError(409, "NO_REMAINING_GAP", "本次已没有司机缺口");
}
