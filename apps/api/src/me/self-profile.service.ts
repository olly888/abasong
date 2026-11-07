import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import { SensitiveDatabase } from "../apartments/sensitive-database";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { UUID } from "../auth/token-verifier";
type S = components["schemas"];
const clean = (n: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(n)
    .refine(
      (s) =>
        ![...s].some(
          (c) =>
            (c.codePointAt(0)! < 32 &&
              !(multiline && ["\n", "\r"].includes(c))) ||
            c.codePointAt(0) === 127,
        ),
    );
export const selfProfileInput = z
  .object({
    close_availability_expected_version: z.number().int().positive().optional(),
    expected_version: z.number().int().min(0),
    display_name: clean(60).min(1),
    bio: clean(500, true),
    vehicle_type: clean(60),
    purposes: z
      .array(z.enum(["delivery", "dsp"]))
      .max(2)
      .refine((v) => new Set(v).size === v.length),
    familiar_region_ids: z
      .array(z.string().uuid())
      .max(5)
      .refine((v) => new Set(v).size === v.length),
    experience: z
      .array(
        z
          .object({
            carrier: clean(80).min(1),
            region_label: clean(120),
            description: clean(300, true),
          })
          .strict(),
      )
      .max(20),
    private_contact: z
      .object({
        phone: clean(40).refine(
          (v) =>
            !v ||
            (/^\+?[0-9 ()-]{7,40}$/.test(v) &&
              v.replace(/\D/g, "").length >= 7 &&
              v.replace(/\D/g, "").length <= 15),
        ),
        wechat: clean(80),
      })
      .strict(),
  })
  .strict();
@Injectable()
export class SelfProfileService {
  constructor(
    @Inject(SensitiveDatabase) private readonly db: SensitiveDatabase,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  private async tx<T>(a: VerifiedIdentity, fn: (c: PoolClient) => Promise<T>) {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('abasong.actor_id',$1,true)", [
        a.userId,
      ]);
      await this.active(c, a);
      const v = await fn(c);
      await this.active(c, a);
      await c.query("COMMIT");
      return v;
    } catch (e) {
      await c.query("ROLLBACK");
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        503,
        "PROFILE_UNAVAILABLE",
        "资料暂时无法保存或读取，请重试",
      );
    } finally {
      c.release();
    }
  }
  private async active(c: PoolClient, a: VerifiedIdentity) {
    const u = (
      await c.query(
        "SELECT status,session_invalid_before FROM abasong.users WHERE id=$1",
        [a.userId],
      )
    ).rows[0];
    if (!u || u.status !== "active")
      throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用");
    if (
      u.session_invalid_before &&
      a.issuedAt * 1000 <= u.session_invalid_before.getTime()
    )
      throw new ApiError(401, "SESSION_REVOKED", "请重新登录");
  }
  private async view(
    c: PoolClient,
    a: VerifiedIdentity,
  ): Promise<S["SelfProfile"]> {
    const p = (
      await c.query(
        "SELECT user_id,display_name,bio,vehicle_type,experience,familiar_region_ids FROM abasong.profiles WHERE user_id=$1",
        [a.userId],
      )
    ).rows[0];
    if (!p) throw new ApiError(404, "NOT_FOUND", "请先完成个人资料");
    const r = (
      await c.query(
        "SELECT version,purposes,familiar_region_ids,contact_payload FROM abasong.self_profiles WHERE user_id=$1",
        [a.userId],
      )
    ).rows[0];
    const contact = r
      ? await this.crypto.open<S["PrivateContact"]>(
          r.contact_payload,
          `self-contact:${a.userId}`,
        )
      : { phone: "", wechat: "" };
    const regions = (
      await c.query(
        "SELECT id,label FROM abasong.regions WHERE id=ANY($1::uuid[]) ORDER BY label",
        [p.familiar_region_ids],
      )
    ).rows;
    return {
      profile: {
        user_id: p.user_id,
        display_name: p.display_name,
        bio: p.bio,
        vehicle_type: p.vehicle_type,
        familiar_regions: regions,
        experience: p.experience.map((x: S["ExperienceInput"]) => ({
          ...x,
          source: "self_reported",
        })),
      },
      version: r?.version ?? 0,
      purposes: r?.purposes ?? [],
      familiar_region_ids: r?.familiar_region_ids ?? [],
      private_contact: { phone: contact.phone, wechat: contact.wechat },
    };
  }
  get(a: VerifiedIdentity) {
    return this.tx(a, (c) => this.view(c, a));
  }
  update(
    a: VerifiedIdentity,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    const p = selfProfileInput.safeParse(body);
    if (!p.success || !key || !UUID.test(key))
      throw new ApiError(400, "INVALID_INPUT", "请检查资料与请求编号");
    const input = p.data,
      route = "/v1/me/profile";
    const digest = createHmac(
      "sha256",
      this.crypto.hmacKey("self-profile-intent"),
    )
      .update(JSON.stringify(input))
      .digest();
    return this.tx(a, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `self-profile:${a.userId}`,
      ]);
      await c.query(
        "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at<=now()",
        [a.userId, route, key],
      );
      const old = (
        await c.query(
          "SELECT request_hmac,status FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
          [a.userId, route, key],
        )
      ).rows[0];
      if (old) {
        if (!timingSafeEqual(old.request_hmac, digest))
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "此请求编号已用于其他资料",
          );
        return this.view(c, a);
      }
      const current = (
        await c.query(
          "SELECT version FROM abasong.self_profiles WHERE user_id=$1 FOR UPDATE",
          [a.userId],
        )
      ).rows[0];
      if ((current?.version ?? 0) !== input.expected_version)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "资料已更新，请读取最新资料",
        );
      if (
        input.familiar_region_ids.length &&
        (
          await c.query(
            "SELECT id FROM abasong.regions WHERE id=ANY($1::uuid[])",
            [input.familiar_region_ids],
          )
        ).rowCount !== input.familiar_region_ids.length
      )
        throw new ApiError(400, "INVALID_INPUT", "请选择有效的熟悉区域");
      if (input.close_availability_expected_version !== undefined) {
        if (input.purposes.includes("delivery"))
          throw new ApiError(400, "INVALID_INPUT", "请核对接活用途");
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `availability:${a.userId}`,
        ]);
        const av = (
          await c.query(
            "SELECT version FROM abasong.availability WHERE user_id=$1 FOR UPDATE",
            [a.userId],
          )
        ).rows[0];
        if (!av || av.version !== input.close_availability_expected_version)
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "接活状态已更新，请读取最新资料",
          );
        await c.query(
          "UPDATE abasong.availability SET enabled=false,version=version+1,updated_at=now() WHERE user_id=$1",
          [a.userId],
        );
      }
      // Envelope creation precedes every write. KMS failures cannot save public-only half-results.
      const envelope = await this.crypto.seal(
        input.private_contact,
        `self-contact:${a.userId}`,
      );
      const result = await c.query(
        "UPDATE abasong.profiles SET display_name=$2,bio=$3,vehicle_type=$4,experience=$5::jsonb,familiar_region_ids=$6,updated_at=now() WHERE user_id=$1",
        [
          a.userId,
          input.display_name,
          input.bio || null,
          input.vehicle_type || null,
          JSON.stringify(input.experience),
          input.familiar_region_ids,
        ],
      );
      if (!result.rowCount)
        throw new ApiError(404, "NOT_FOUND", "请先完成个人资料");
      await c.query(
        "INSERT INTO abasong.self_profiles(user_id,version,purposes,familiar_region_ids,contact_payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET version=EXCLUDED.version,purposes=EXCLUDED.purposes,familiar_region_ids=EXCLUDED.familiar_region_ids,contact_payload=EXCLUDED.contact_payload,updated_at=now()",
        [
          a.userId,
          input.expected_version + 1,
          input.purposes,
          input.familiar_region_ids,
          JSON.stringify(envelope),
        ],
      );
      await c.query(
        "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',200,$1,now()+interval '24 hours')",
        [a.userId, route, key, digest],
      );
      await c.query(
        "INSERT INTO abasong.audit_events(actor_id,request_id,action,object_type,object_id,result) VALUES($1,$2,'profile.updated','user',$1,'success')",
        [a.userId, requestId],
      );
      return this.view(c, a);
    });
  }
}
