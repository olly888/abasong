import type { QueryConfig } from "pg";

export interface AccessRankingInput {
  apartmentId: string;
  /** Server-resolved applicable scope keys, never an authorization decision supplied by a client. */
  scopeKeys: readonly string[];
  /** Database timestamps may be passed as strings to retain sub-millisecond precision. */
  asOf: Date | string;
  /** Required from active configuration; no invented production feedback-window default. */
  effectiveUsefulSince: Date | string;
  limit: number;
}
export interface AccessRankingRow {
  id: string;
  contributed_at: Date;
  has_current_effective_useful: boolean;
}

/** Metadata-only internal query. Object/schedule authorization must precede any secret lookup. */
export function buildAccessRankingQuery(
  input: AccessRankingInput,
): QueryConfig {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.apartmentId,
    )
  )
    throw new Error("Invalid apartment ID");
  if (!input.scopeKeys.length || input.scopeKeys.some((key) => !key.trim()))
    throw new Error("Applicable scopes required");
  const asOf = new Date(input.asOf).getTime();
  const since = new Date(input.effectiveUsefulSince).getTime();
  if (!Number.isFinite(asOf) || !Number.isFinite(since) || since > asOf)
    throw new Error("Explicit valid feedback interval required");
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20)
    throw new Error("Access ranking limit must be 1–20");
  return {
    text: `SELECT r.id, live.first_contributed_at AS contributed_at,
      EXISTS (
        SELECT 1 FROM abasong.access_feedback f
        JOIN abasong.users voter ON voter.id = f.user_id AND voter.status = 'active'
        WHERE f.record_id = r.id AND f.value = 'useful'
          AND f.applicable AND f.excluded_at IS NULL
          AND f.updated_at >= $3::timestamptz AND f.updated_at <= $2::timestamptz
      ) AS has_current_effective_useful
      FROM abasong.access_records r
      JOIN LATERAL (SELECT first_contributed_at FROM abasong.access_contribution_sources s WHERE s.record_id=r.id AND s.status='active' ORDER BY first_contributed_at,s.id LIMIT 1) live ON true
      JOIN abasong.apartments a ON a.id = r.apartment_id AND a.status = 'active'
      WHERE r.apartment_id = $1::uuid AND r.status = 'active'
        AND r.scope_key = ANY($4::text[])
        AND (r.expires_at IS NULL OR r.expires_at > $2::timestamptz)
      ORDER BY has_current_effective_useful DESC, live.first_contributed_at DESC, r.id DESC
      LIMIT $5`,
    values: [
      input.apartmentId,
      input.asOf,
      input.effectiveUsefulSince,
      [...input.scopeKeys],
      input.limit,
    ],
  };
}
