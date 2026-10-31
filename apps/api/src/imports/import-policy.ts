import { z } from "zod";
import type { PoolClient } from "pg";
import { ApiError } from "../common/api-error";
export const importPolicySchema = z
  .object({
    version: z.number().int().positive(),
    max_images: z.number().int().min(1).max(50),
    max_image_bytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
    max_total_bytes: z
      .number()
      .int()
      .positive()
      .max(200 * 1024 * 1024),
    max_pixels: z.number().int().positive().max(100_000_000),
    draft_ttl_seconds: z.number().int().positive().max(86400),
    source_ttl_seconds: z.number().int().positive().max(86400),
    upload_ttl_seconds: z.number().int().positive().max(3600),
    processing_timeout_seconds: z.number().int().positive().max(300),
    daily_image_limit: z.number().int().positive().max(500),
    max_candidates: z.number().int().positive().max(100),
    recognition_mode: z.literal("on_device"),
    supported_mime_types: z
      .array(z.enum(["image/jpeg", "image/png", "image/heic"]))
      .min(1)
      .max(3),
  })
  .strict()
  .refine(
    (p) =>
      p.source_ttl_seconds <= p.draft_ttl_seconds &&
      p.max_image_bytes <= p.max_total_bytes,
  );
export async function importPolicy(c: PoolClient) {
  const row = (
    await c.query(
      "SELECT config FROM abasong.config_versions WHERE activated_at<=now() ORDER BY version DESC LIMIT 1",
    )
  ).rows[0];
  const parsed = importPolicySchema.safeParse(row?.config.import_policy);
  if (!parsed.success)
    throw new ApiError(503, "IMPORT_NOT_CONFIGURED", "截图导入暂不可用");
  return parsed.data;
}
