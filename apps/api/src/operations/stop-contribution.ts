// Internal operator command only. Never registered as a mobile HTTP controller.
import { decodeJwt } from "jose";
import { z } from "zod";
import type { Pool } from "pg";
import type { TokenVerifier } from "../auth/token-verifier";
import { ApiError } from "../common/api-error";
const inputSchema = z
  .object({
    source_id: z.string().uuid(),
    expected_version: z.number().int().positive(),
    operation_id: z.string().uuid(),
    reason: z.enum(["wrong_apartment", "accidental_share"]),
  })
  .strict();
export class StopContributionCommand {
  constructor(
    private readonly db: Pick<Pool, "connect">,
    private readonly verifier: Pick<TokenVerifier, "verify">,
  ) {}
  async run(authorization: string, input: unknown, apply = false) {
    const b = inputSchema.safeParse(input);
    if (!b.success) throw new ApiError(400, "INVALID_INPUT", "停显参数无效");
    const actor = await this.verifier.verify(authorization);
    // Signature/issuer/audience/expiry were verified above; never trust unverified aal.
    if (decodeJwt(authorization.slice(7)).aal !== "aal2")
      throw new ApiError(403, "STAFF_MFA_REQUIRED", "管理员必须完成MFA");
    const p = b.data,
      c = await this.db.connect();
    try {
      await c.query("BEGIN");
      const user = (
        await c.query(
          "SELECT status,session_invalid_before FROM abasong.users WHERE id=$1 FOR SHARE",
          [actor.userId],
        )
      ).rows[0];
      if (!user || user.status !== "active")
        throw new ApiError(403, "STAFF_REQUIRED", "无管理员权限");
      if (
        user.session_invalid_before &&
        actor.issuedAt * 1000 <= user.session_invalid_before.getTime()
      )
        throw new ApiError(401, "SESSION_REVOKED", "管理员会话已结束");
      if (
        !(
          await c.query(
            "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND capability='ops.review' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR SHARE",
            [actor.userId],
          )
        ).rowCount
      )
        throw new ApiError(403, "STAFF_REQUIRED", "无管理员权限");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "operator.source.stop:" + p.operation_id,
      ]);
      const old = (
        await c.query(
          "SELECT actor_id,object_id,reason,action FROM abasong.audit_events WHERE id=$1",
          [p.operation_id],
        )
      ).rows[0];
      if (old) {
        if (
          old.actor_id !== actor.userId ||
          old.object_id !== p.source_id ||
          old.reason !== p.reason ||
          old.action !== "operator.source.stop"
        )
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "操作编号已使用");
        const event = (
          await c.query(
            "SELECT source_version FROM abasong.access_contributions WHERE id=$1 AND source_id=$2",
            [p.operation_id, p.source_id],
          )
        ).rows[0];
        if (!event)
          throw new ApiError(409, "RECEIPT_UNAVAILABLE", "停显记录不可用");
        if (event.source_version !== p.expected_version + 1)
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "操作编号已使用");
        await c.query("ROLLBACK");
        return {
          applied: true,
          replayed: true,
          applied_version: event.source_version,
        };
      }
      const owner = (
        await c.query(
          "SELECT user_id FROM abasong.access_contribution_sources WHERE id=$1",
          [p.source_id],
        )
      ).rows[0];
      if (!owner) throw new ApiError(404, "NOT_FOUND", "未找到来源");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "access-source-owner:" + owner.user_id,
      ]);
      const source = (
        await c.query(
          "SELECT * FROM abasong.access_contribution_sources WHERE id=$1 FOR UPDATE",
          [p.source_id],
        )
      ).rows[0];
      if (source.version !== p.expected_version || source.status !== "active")
        throw new ApiError(409, "VERSION_CONFLICT", "来源已改变，请重新核对");
      if (!apply) {
        await c.query("ROLLBACK");
        return { applied: false, replayed: false, applied_version: null };
      }
      await c.query(
        "UPDATE abasong.access_contribution_sources SET status='withdrawn',version=version+1,updated_at=now(),replacement_source_id=NULL WHERE id=$1",
        [p.source_id],
      );
      await c.query(
        "INSERT INTO abasong.access_contributions(id,record_id,user_id,event_type,source_id,source_version) VALUES($1,$2,$3,'withdrawn',$4,$5)",
        [
          p.operation_id,
          source.record_id,
          source.user_id,
          p.source_id,
          source.version + 1,
        ],
      );
      await c.query(
        "INSERT INTO abasong.moderation_actions(id,actor_id,object_type,object_id,action,reason) VALUES($1,$2,'access_source',$3,'stop_source',$4)",
        [p.operation_id, actor.userId, p.source_id, p.reason],
      );
      await c.query(
        "INSERT INTO abasong.audit_events(id,actor_id,request_id,action,object_type,object_id,result,reason) VALUES($1,$2,$1,'operator.source.stop','access_source',$3,'success',$4)",
        [p.operation_id, actor.userId, p.source_id, p.reason],
      );
      await c.query("COMMIT");
      return {
        applied: true,
        replayed: false,
        applied_version: source.version + 1,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
