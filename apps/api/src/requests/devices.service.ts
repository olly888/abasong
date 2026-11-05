import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Database } from "../database/database.service";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { RequestsService } from "./requests.service";
import { checked, requestId } from "./request-input";
const proof = z
  .object({
    installation_id: z.uuid(),
    installation_secret: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const deviceInput = proof
  .extend({
    platform: z.enum(["ios", "android"]),
    enabled: z.boolean(),
    push_token: z
      .string()
      .regex(/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,200}\]$/)
      .optional(),
  })
  .strict();
@Injectable()
export class DevicesService {
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(Database) private readonly db: Database,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  private hash(secret: string) {
    return createHmac("sha256", this.crypto.hmacKey("device-installation"))
      .update(secret)
      .digest();
  }
  private matches(a: Buffer | null, b: Buffer) {
    return !!a && a.length === b.length && timingSafeEqual(a, b);
  }
  register(a: VerifiedIdentity, body: unknown, key: unknown) {
    requestId(key);
    const p = checked(deviceInput, body),
      h = this.hash(p.installation_secret);
    if (p.enabled && !p.push_token)
      throw new ApiError(400, "INVALID_INPUT", "请先启用系统通知");
    return this.requests.tx(a, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `device:${p.installation_id}`,
      ]);
      const old = (
        await c.query(
          "SELECT * FROM abasong.devices WHERE installation_id=$1 FOR UPDATE",
          [p.installation_id],
        )
      ).rows[0];
      if (old && !this.matches(old.installation_hmac, h))
        throw new ApiError(
          409,
          "DEVICE_CONFLICT",
          "设备注册信息已变化，请重试",
        );
      const n = (
        await c.query(
          "SELECT count(*) AS n FROM abasong.devices WHERE user_id=$1 AND enabled AND lease_until>now() AND installation_id<>$2",
          [a.userId, p.installation_id],
        )
      ).rows[0];
      if (p.enabled && Number(n.n) >= 10)
        throw new ApiError(429, "DEVICE_LIMIT", "已启用通知的设备过多");
      // Invalidate the previous account/token binding; stale deliveries retain its version.
      const changed =
        !old ||
        old.user_id !== a.userId ||
        old.push_token !== (p.enabled ? p.push_token : null) ||
        old.enabled !== p.enabled;
      const v = old ? old.binding_version + (changed ? 1 : 0) : 1;
      const r = (
        await c.query(
          "INSERT INTO abasong.devices(user_id,installation_id,installation_hmac,platform,push_token,enabled,binding_version,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours') ON CONFLICT(installation_id) DO UPDATE SET user_id=$1,installation_hmac=$3,platform=$4,push_token=$5,enabled=$6,binding_version=$7,lease_until=now()+interval '24 hours',updated_at=now() RETURNING id,installation_id,platform,enabled,binding_version",
          [
            a.userId,
            p.installation_id,
            h,
            p.platform,
            p.enabled ? p.push_token : null,
            p.enabled,
            v,
          ],
        )
      ).rows[0];
      return r;
    });
  }
  unbind(a: VerifiedIdentity, id: unknown) {
    const did = requestId(id);
    return this.requests.tx(a, async (c) => {
      await c.query(
        "UPDATE abasong.devices SET enabled=false,push_token=NULL,binding_version=binding_version+1,lease_until=now(),updated_at=now() WHERE id=$1 AND user_id=$2 AND enabled",
        [did, a.userId],
      );
      return { ok: true };
    });
  }
  // Narrow proof capability: can only disable this installation, never read or bind.
  // Enables retry after local logout without retaining an account bearer token.
  async revokeInstallation(body: unknown) {
    const p = checked(
        proof
          .extend({
            binding_version: z.number().int().positive().max(2147483647),
          })
          .strict(),
        body,
      ),
      h = this.hash(p.installation_secret);
    await this.db.pool.query(
      "UPDATE abasong.devices SET enabled=false,push_token=NULL,binding_version=binding_version+1,lease_until=now(),updated_at=now() WHERE installation_id=$1 AND installation_hmac=$2 AND binding_version=$3 AND enabled",
      [p.installation_id, h, p.binding_version],
    );
    return { ok: true };
  }
}
