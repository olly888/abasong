import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import type { VerifiedIdentity } from "./request-context";
import { ApiError } from "./api-error";
import { requestId } from "../requests/request-input";

export async function writeIdempotently<T>(
  secret: Buffer,
  c: PoolClient,
  a: VerifiedIdentity,
  route: string,
  key: unknown,
  body: unknown,
  run: () => Promise<{ id: string; value: T }>,
  replay: (id: string) => Promise<T>,
): Promise<T> {
  const k = requestId(key),
    ttl = Number(process.env.IDEMPOTENCY_RETENTION_SECONDS);
  if (!Number.isSafeInteger(ttl) || ttl <= 0)
    throw new ApiError(503, "IDEMPOTENCY_NOT_CONFIGURED", "服务暂不可用");
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${a.userId}:${route}:${k}`,
  ]);
  const hash = createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest();
  const old = (
    await c.query(
      "SELECT request_hmac,response_object_id FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at>now()",
      [a.userId, route, k],
    )
  ).rows[0];
  if (old) {
    if (
      old.request_hmac.length !== hash.length ||
      !timingSafeEqual(hash, old.request_hmac)
    )
      throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "请求编号已用于其他内容");
    return replay(old.response_object_id);
  }
  const result = await run();
  await c.query(
    "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
    [a.userId, route, k],
  );
  await c.query(
    "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',$5,now()+$6*interval '1 second')",
    [a.userId, route, k, hash, result.id, ttl],
  );
  return result.value;
}
