import { decodeJwt } from "jose";
import type { PoolClient } from "pg";
import type { TokenVerifier } from "../auth/token-verifier";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";

export async function verifyReviewIdentity(
  verifier: Pick<TokenVerifier, "verify">,
  authorization: string,
) {
  const actor = await verifier.verify(authorization);
  if (decodeJwt(authorization.slice(7)).aal !== "aal2")
    throw new ApiError(403, "STAFF_MFA_REQUIRED", "管理员必须完成MFA");
  return actor;
}

export async function requireReviewAccess(
  c: PoolClient,
  actor: VerifiedIdentity,
) {
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
  const grant = await c.query(
    "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND capability='ops.review' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR SHARE",
    [actor.userId],
  );
  if (!grant.rowCount)
    throw new ApiError(403, "STAFF_REQUIRED", "无管理员权限");
}
