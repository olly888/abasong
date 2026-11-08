import { z } from "zod";
import type { Pool } from "pg";
import type { TokenVerifier } from "../auth/token-verifier";
import { ApiError } from "../common/api-error";
import { lockApartmentSharing } from "../apartments/sharing-state";
import { requireReviewAccess, verifyReviewIdentity } from "./review-access";

const fields = {
  apartment_id: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  expected_version: z.number().int().min(0).max(2147483646).optional(),
  operation_id: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
};
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...fields,
      action: z.literal("pause"),
      reason: z.enum(["property_request", "authorization_review"]),
    })
    .strict(),
  z
    .object({
      ...fields,
      action: z.literal("resume"),
      reason: z.literal("property_confirmed"),
    })
    .strict(),
]);
const collision = () =>
  new ApiError(409, "IDEMPOTENCY_CONFLICT", "操作编号已使用");

// Operator-only entry point. Runtime roles have read access to state columns.
export class ApartmentSharingCommand {
  constructor(
    private readonly db: Pick<Pool, "connect">,
    private readonly verifier: Pick<TokenVerifier, "verify">,
  ) {}

  async run(authorization: string, input: unknown, apply = false) {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
      throw new ApiError(400, "INVALID_INPUT", "公寓共享操作参数无效");
    const p = parsed.data,
      paused = p.action === "pause";
    if (apply && p.expected_version === undefined)
      throw new ApiError(400, "INVALID_INPUT", "请先核对公寓共享状态版本");
    const actor = await verifyReviewIdentity(this.verifier, authorization);
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await requireReviewAccess(c, actor);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `operator.apartment.sharing:${p.operation_id}`,
      ]);
      const state = await lockApartmentSharing(c, p.apartment_id, apply);
      const previous = (
        await c.query(
          "SELECT apartment_id,version,paused,actor_id,reason FROM abasong.apartment_sharing_operations WHERE id=$1",
          [p.operation_id],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.apartment_id !== p.apartment_id ||
          previous.version - 1 !== p.expected_version ||
          previous.paused !== paused ||
          previous.actor_id !== actor.userId ||
          previous.reason !== p.reason
        )
          throw collision();
        await c.query("ROLLBACK");
        return {
          applied: true,
          replayed: true,
          applied_version: previous.version,
          current_version: state.version,
          paused: state.paused,
        };
      }
      const apartment = (
        await c.query(
          "SELECT address_line1,city,state,postal_code FROM abasong.apartments WHERE id=$1 AND status='active'",
          [p.apartment_id],
        )
      ).rows[0];
      if (!apartment)
        throw new ApiError(404, "NOT_FOUND", "未找到可操作的公寓");
      if (
        p.expected_version !== undefined &&
        state.version !== p.expected_version
      )
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "公寓共享状态已改变，请重新核对",
        );
      if (apply && state.paused === paused)
        throw new ApiError(409, "NO_STATE_CHANGE", "公寓已处于目标状态");
      const summary = (
        await c.query(
          `SELECT count(DISTINCT r.id)::int AS records, count(s.id)::int AS sources
           FROM abasong.access_records r JOIN abasong.access_contribution_sources s ON s.record_id=r.id AND s.status='active'
           WHERE r.apartment_id=$1 AND r.status='active' AND r.applicable_schedule IS NULL AND (r.expires_at IS NULL OR r.expires_at>now())`,
          [p.apartment_id],
        )
      ).rows[0];
      if (!apply) {
        await c.query("ROLLBACK");
        return {
          applied: false,
          replayed: false,
          applied_version: null,
          current_version: state.version,
          paused: state.paused,
          action: p.action,
          apartment,
          affected_records: summary.records,
          affected_sources: summary.sources,
        };
      }
      const action = `operator.apartment.${p.action}`;
      const audit = await c.query(
        "INSERT INTO abasong.audit_events(id,actor_id,request_id,action,object_type,object_id,result,reason) VALUES($1,$2,$1,$3,'apartment',$4,'success',$5) ON CONFLICT(id) DO NOTHING",
        [p.operation_id, actor.userId, action, p.apartment_id, p.reason],
      );
      if (!audit.rowCount) throw collision();
      const version = state.version + 1;
      await c.query(
        "INSERT INTO abasong.apartment_sharing_operations(id,apartment_id,version,paused,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)",
        [
          p.operation_id,
          p.apartment_id,
          version,
          paused,
          actor.userId,
          p.reason,
        ],
      );
      await c.query("COMMIT");
      return {
        applied: true,
        replayed: false,
        applied_version: version,
        current_version: version,
        paused,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
