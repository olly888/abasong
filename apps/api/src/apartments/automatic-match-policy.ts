import { z } from "zod";

const basis = z.enum(["boundary", "entrance"]);
const scope = z
  .object({
    apartment_id: z.string().uuid(),
    match_bases: z.array(basis).min(1).max(2),
    evidence_ref: z.string().trim().min(1).max(300),
    verified_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((s) => new Set(s.match_bases).size === s.match_bases.length)
  .refine((s) => Date.parse(s.expires_at) > Date.parse(s.verified_at));

const policy = z
  .object({
    enabled: z.boolean(),
    max_accuracy_m: z.number().finite().positive().max(50),
    // Accepted for old configurations only; global evidence never enables an
    // apartment. Evidence must belong to its explicit, time-bounded scope.
    evidence_ref: z.string().trim().min(1).max(300).optional(),
    scopes: z.array(scope).max(100).default([]),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.scopes.map((s) => s.apartment_id)).size === p.scopes.length,
  );

export type AutomaticMatchPolicy = {
  maxAccuracyM: number;
  scopes: ReadonlyMap<string, ReadonlySet<"boundary" | "entrance">>;
};

/** Invalid/legacy/expired pilot configuration preserves manual candidates. */
export function automaticMatchPolicy(
  input: unknown,
  databaseNowMs: number,
): AutomaticMatchPolicy | null {
  const parsed = policy.safeParse(input);
  if (
    !Number.isFinite(databaseNowMs) ||
    !parsed.success ||
    !parsed.data.enabled
  )
    return null;
  const active = parsed.data.scopes.filter(
    (s) =>
      Date.parse(s.verified_at) <= databaseNowMs &&
      Date.parse(s.expires_at) > databaseNowMs,
  );
  return active.length
    ? {
        maxAccuracyM: parsed.data.max_accuracy_m,
        scopes: new Map(
          active.map((s) => [s.apartment_id, new Set(s.match_bases)]),
        ),
      }
    : null;
}

/** All nearby competitors must be evaluated BEFORE calling this selector. */
export function automaticMatchBasis(
  policy: AutomaticMatchPolicy | null,
  apartment: { id: string; boundary_inside: boolean; entrance_inside: boolean },
): "boundary" | "entrance" | null {
  const allowed = policy?.scopes.get(apartment.id);
  if (apartment.entrance_inside && allowed?.has("entrance")) return "entrance";
  if (apartment.boundary_inside && allowed?.has("boundary")) return "boundary";
  return null;
}
