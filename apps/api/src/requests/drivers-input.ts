import { z } from "zod";
export const driverPageInput = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    region_id: z.uuid().optional(),
    carrier: z.string().trim().min(1).max(80).optional(),
    day: z.iso.date().optional(),
  })
  .strict();
export const availabilityInput = z
  .object({
    expected_version: z.number().int().min(0).max(2147483646),
    enabled: z.boolean(),
    starts_at: z.iso.datetime({ offset: true }).optional(),
    ends_at: z.iso.datetime({ offset: true }).optional(),
    region_ids: z
      .array(z.uuid())
      .min(1)
      .max(5)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    capacity_parcels: z
      .number()
      .int()
      .positive()
      .max(10000)
      .nullable()
      .optional(),
    latest_finish_at: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((p, c) => {
    if (p.enabled && (!p.starts_at || !p.ends_at || !p.region_ids?.length))
      c.addIssue({ code: "custom", message: "请填写时段和区域" });
  });
