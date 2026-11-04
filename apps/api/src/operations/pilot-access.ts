import { decodeJwt } from "jose";
import type { Pool } from "pg";
import { z } from "zod";
import type { TokenVerifier } from "../auth/token-verifier";
import { ApiError } from "../common/api-error";

const uuid = () =>
  z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase());
const common = { user_id: uuid(), operation_id: uuid() };
const schema = z.discriminatedUnion("action", [
  z
    .object({
      ...common,
      action: z.literal("grant"),
      valid_until: z.iso.datetime(),
      reason: z.literal("invited_pilot"),
    })
    .strict(),
  z
    .object({
      ...common,
      action: z.literal("revoke"),
      grant_operation_id: uuid(),
      reason: z.enum(["pilot_completed", "access_removed"]),
    })
    .strict(),
]);
const capabilities = ["access.read", "access.contribute"];
const maxDurationMs = 7 * 24 * 60 * 60 * 1000;

// Operator command only: intentionally not registered as an HTTP controller.
// The CLI currently permits isolated D0 only; cloud execution needs its own role.
export class PilotAccessCommand {
  constructor(
    private readonly db: Pick<Pool, "connect">,
    private readonly verifier: Pick<TokenVerifier, "verify">,
  ) {}
  async run(authorization: string, input: unknown, apply = false) {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new ApiError(400, "INVALID_INPUT", "内测资格参数无效");
    const actor = await this.verifier.verify(authorization);
    if (decodeJwt(authorization.slice(7)).aal !== "aal2")
      throw new ApiError(403, "STAFF_MFA_REQUIRED", "管理员必须完成MFA");
    const p = parsed.data;
    if (p.user_id === actor.userId)
      throw new ApiError(403, "SELF_GRANT_FORBIDDEN", "不能管理本人的内测资格");
    const receipt = JSON.stringify(p),
      action = "operator.pilot." + p.action;
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      const staff = (
        await c.query(
          "SELECT status,session_invalid_before FROM abasong.users WHERE id=$1 FOR SHARE",
          [actor.userId],
        )
      ).rows[0];
      if (!staff || staff.status !== "active")
        throw new ApiError(403, "STAFF_REQUIRED", "无管理员权限");
      if (
        staff.session_invalid_before &&
        actor.issuedAt * 1000 <= staff.session_invalid_before.getTime()
      )
        throw new ApiError(401, "SESSION_REVOKED", "管理员会话已结束");
      if (
        !(
          await c.query(
            "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND capability='ops.user_manage' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR SHARE",
            [actor.userId],
          )
        ).rowCount
      )
        throw new ApiError(403, "STAFF_REQUIRED", "无管理员权限");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "operator.pilot.operation:" + p.operation_id,
      ]);
      const old = (
        await c.query(
          "SELECT actor_id,object_id,action,reason FROM abasong.audit_events WHERE id=$1",
          [p.operation_id],
        )
      ).rows[0];
      if (old) {
        if (
          old.actor_id !== actor.userId ||
          old.object_id !== p.user_id ||
          old.action !== action ||
          old.reason !== receipt
        )
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "操作编号已使用");
        await c.query("ROLLBACK");
        return {
          applied: true,
          replayed: true,
          capability_count: 2,
          valid_until: p.action === "grant" ? p.valid_until : null,
        };
      }
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "operator.pilot.user:" + p.user_id,
      ]);
      const target = (
        await c.query(
          "SELECT status FROM abasong.users WHERE id=$1 FOR SHARE",
          [p.user_id],
        )
      ).rows[0];
      if (!target || (p.action === "grant" && target.status !== "active"))
        throw new ApiError(409, "TARGET_NOT_ACTIVE", "目标账号不可用");
      if (p.action === "grant") {
        const now = (
          await c.query("SELECT now() AS clock")
        ).rows[0].clock.getTime();
        const until = Date.parse(p.valid_until);
        if (until <= now || until > now + maxDurationMs)
          throw new ApiError(
            400,
            "INVALID_EXPIRY",
            "内测资格须在未来七天内到期",
          );
        if (
          !(
            await c.query(
              "SELECT user_id FROM abasong.profiles WHERE user_id=$1",
              [p.user_id],
            )
          ).rowCount
        )
          throw new ApiError(409, "PROFILE_REQUIRED", "目标账号尚未完成资料");
        if (
          (
            await c.query(
              "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND capability=ANY($2::text[]) AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now()) FOR UPDATE",
              [p.user_id, capabilities],
            )
          ).rowCount
        )
          throw new ApiError(
            409,
            "CAPABILITY_ALREADY_ACTIVE",
            "已有资格，请先核对",
          );
        if (apply)
          await c.query(
            "INSERT INTO abasong.capabilities(user_id,capability,granted_by,valid_until,reason) SELECT $1,c,$2,$3,$4 FROM unnest($5::text[]) c",
            [
              p.user_id,
              actor.userId,
              p.valid_until,
              "pilot:" + p.operation_id,
              capabilities,
            ],
          );
      } else {
        const original = (
          await c.query(
            "SELECT actor_id,object_id,action FROM abasong.audit_events WHERE id=$1",
            [p.grant_operation_id],
          )
        ).rows[0];
        if (
          !original ||
          original.object_id !== p.user_id ||
          original.action !== "operator.pilot.grant"
        )
          throw new ApiError(404, "NOT_FOUND", "未找到本次内测授权");
        const rows = await c.query(
          "SELECT id,capability FROM abasong.capabilities WHERE user_id=$1 AND capability=ANY($2::text[]) AND reason=$3 AND granted_by=$4 FOR UPDATE",
          [
            p.user_id,
            capabilities,
            "pilot:" + p.grant_operation_id,
            original.actor_id,
          ],
        );
        if (
          rows.rowCount !== 2 ||
          new Set(rows.rows.map((r) => r.capability)).size !== 2
        )
          throw new ApiError(409, "RECEIPT_UNAVAILABLE", "内测授权记录不完整");
        if (apply)
          await c.query(
            "UPDATE abasong.capabilities SET revoked_at=COALESCE(revoked_at,now()) WHERE id=ANY($1::uuid[])",
            [rows.rows.map((r) => r.id)],
          );
      }
      if (!apply) {
        await c.query("ROLLBACK");
        return {
          applied: false,
          replayed: false,
          capability_count: 2,
          valid_until: p.action === "grant" ? p.valid_until : null,
        };
      }
      await c.query(
        "INSERT INTO abasong.audit_events(id,actor_id,request_id,action,object_type,object_id,result,reason) VALUES($1,$2,$1,$3,'user',$4,'success',$5)",
        [p.operation_id, actor.userId, action, p.user_id, receipt],
      );
      await c.query("COMMIT");
      return {
        applied: true,
        replayed: false,
        capability_count: 2,
        valid_until: p.action === "grant" ? p.valid_until : null,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
