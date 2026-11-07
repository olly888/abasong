import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import { SensitiveDatabase } from "../apartments/sensitive-database";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import { ApiError } from "../common/api-error";
import type { VerifiedIdentity } from "../common/request-context";
import { UUID } from "../auth/token-verifier";
type S = components["schemas"];
type Row = {
  id: string;
  name: string;
  contact_user_id: string;
  verification_status: S["Organization"]["verification_status"];
  profile_version: number;
  active: boolean;
  contact_shared: boolean;
  carriers: string[];
  region_ids: string[];
};
const fields =
  "id,name,contact_user_id,verification_status,profile_version,active,contact_shared,carriers,region_ids";
const columns = fields
  .split(",")
  .map((k) => "o." + k)
  .join(",");
const clean = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) =>
        ![...s].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127),
    );
const input = z
  .object({
    expected_version: z.number().int().min(0).max(2147483646),
    name: clean(120).min(1),
    carriers: z
      .array(clean(80).min(1))
      .max(8)
      .refine(
        (xs) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length,
      ),
    region_ids: z
      .array(z.string().uuid())
      .max(5)
      .refine(
        (xs) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length,
      ),
    active: z.boolean(),
    contact_shared: z.boolean(),
    business_contact: z
      .object({
        phone: clean(40).refine(
          (p) =>
            !p ||
            (/^\+?[0-9 ()-]+$/.test(p) &&
              /^\d{7,15}$/.test(p.replace(/\D/g, ""))),
        ),
        wechat: clean(80),
      })
      .strict(),
  })
  .strict()
  .refine(
    (v) =>
      !v.contact_shared ||
      (v.active && !!(v.business_contact.phone || v.business_contact.wechat)),
  );
const unavailable = () =>
  new ApiError(404, "NOT_FOUND", "团队资料或联系方式暂不可见");
const empty = { phone: "", wechat: "" };
export type TeamSubject = "requests" | "drivers";
@Injectable()
export class TeamService {
  constructor(
    @Inject(SensitiveDatabase) private readonly db: SensitiveDatabase,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
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
  private async tx<T>(a: VerifiedIdentity, fn: (c: PoolClient) => Promise<T>) {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('abasong.actor_id',$1,true)", [
        a.userId,
      ]);
      await this.active(c, a);
      const result = await fn(c);
      await this.active(c, a);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      if (e instanceof ApiError) throw e;
      throw new ApiError(503, "TEAM_UNAVAILABLE", "团队资料暂不可用，请重试");
    } finally {
      c.release();
    }
  }
  // Adopt an unambiguous legacy team; multiple historical affiliations are not guessed.
  private async own(c: PoolClient, owner: string): Promise<Row | undefined> {
    const q = await c.query<Row>(
      `SELECT ${fields} FROM abasong.organizations WHERE contact_user_id=$1 AND (profile_managed OR (SELECT count(*) FROM abasong.organizations WHERE contact_user_id=$1)=1) ORDER BY profile_managed DESC LIMIT 1`,
      [owner],
    );
    return q.rows[0];
  }
  private async summary(c: PoolClient, r: Row): Promise<S["TeamSummary"]> {
    const name = (
      await c.query(
        "SELECT display_name FROM abasong.profiles WHERE user_id=$1",
        [r.contact_user_id],
      )
    ).rows[0];
    if (!name) throw unavailable();
    const regions = (
      await c.query<S["ProfileRegion"]>(
        "SELECT id,label FROM abasong.regions WHERE id=ANY($1::uuid[]) ORDER BY label,id",
        [r.region_ids],
      )
    ).rows;
    return {
      id: r.id,
      name: r.name,
      contact_display_name: name.display_name,
      carriers: r.carriers,
      regions,
      contact_available:
        r.active && r.verification_status !== "rejected" && r.contact_shared,
    };
  }
  private async ownerView(c: PoolClient, r: Row): Promise<S["OwnTeamSummary"]> {
    return {
      team: await this.summary(c, r),
      version: r.profile_version,
      active: r.active,
      can_represent: r.active && r.verification_status !== "rejected",
    };
  }
  private async readContact(c: PoolClient, r: Row) {
    const row = (
      await c.query(
        "SELECT payload FROM abasong.organization_contacts WHERE organization_id=$1",
        [r.id],
      )
    ).rows[0];
    return row
      ? await this.crypto.open<S["PrivateContact"]>(
          row.payload,
          `team-contact:${r.id}`,
        )
      : empty;
  }
  get(a: VerifiedIdentity, metadata: boolean) {
    return this.tx(a, async (c) => {
      const r = await this.own(c, a.userId);
      if (!r) throw unavailable();
      const view = await this.ownerView(c, r);
      return metadata
        ? view
        : {
            ...view,
            contact_shared: r.contact_shared,
            business_contact: await this.readContact(c, r),
          };
    });
  }
  update(
    a: VerifiedIdentity,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    const parsed = input.safeParse(body);
    if (!parsed.success || !key || !UUID.test(key))
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "请检查团队名称、区域及业务联系方式",
      );
    const v = parsed.data,
      route = "/v1/me/organization",
      digest = createHmac("sha256", this.crypto.hmacKey("team-profile-intent"))
        .update(JSON.stringify(v))
        .digest();
    return this.tx(a, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `team-profile:${a.userId}`,
      ]);
      const old = await this.own(c, a.userId);
      await c.query(
        "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at<=now()",
        [a.userId, route, key],
      );
      const attempt = (
        await c.query(
          "SELECT request_hmac FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
          [a.userId, route, key],
        )
      ).rows[0];
      if (attempt) {
        if (
          !old ||
          attempt.request_hmac.length !== digest.length ||
          !timingSafeEqual(attempt.request_hmac, digest)
        )
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "此次请求已用于其他资料",
          );
        return {
          ...(await this.ownerView(c, old)),
          contact_shared: old.contact_shared,
          business_contact: await this.readContact(c, old),
        };
      }
      if ((old?.profile_version ?? 0) !== v.expected_version)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "团队资料已更新，请重新读取",
        );
      if (
        v.region_ids.length &&
        (
          await c.query(
            "SELECT id FROM abasong.regions WHERE id=ANY($1::uuid[])",
            [v.region_ids],
          )
        ).rowCount !== v.region_ids.length
      )
        throw new ApiError(400, "INVALID_REGION", "请选择有效的主要配送区域");
      const args = [
        a.userId,
        v.name,
        v.carriers,
        v.region_ids,
        v.active,
        v.contact_shared,
      ];
      const r = (
        await (old
          ? c.query<Row>(
              `UPDATE abasong.organizations SET legacy_name=COALESCE(legacy_name,name),legacy_verification_status=COALESCE(legacy_verification_status,verification_status), name=$2,carriers=$3,region_ids=$4,active=$5,contact_shared=$6,profile_managed=true,profile_version=profile_version+1,verification_status=CASE WHEN verification_status='verified' AND (name<>$2 OR carriers<>$3 OR region_ids<>$4) THEN 'self_reported' ELSE verification_status END WHERE id=$7 AND contact_user_id=$1 AND profile_version=$8 RETURNING ${fields}`,
              [...args, old.id, v.expected_version],
            )
          : c.query<Row>(
              `INSERT INTO abasong.organizations(contact_user_id,name,carriers,region_ids,active,contact_shared,profile_managed,profile_version) VALUES($1,$2,$3,$4,$5,$6,true,1) RETURNING ${fields}`,
              args,
            ))
      ).rows[0];
      if (!r)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "团队资料已更新，请重新读取",
        );
      if (v.business_contact.phone || v.business_contact.wechat) {
        const encrypted = await this.crypto.seal(
          v.business_contact,
          `team-contact:${r.id}`,
        );
        await c.query(
          "INSERT INTO abasong.organization_contacts(organization_id,payload) VALUES($1,$2) ON CONFLICT(organization_id) DO UPDATE SET payload=EXCLUDED.payload",
          [r.id, JSON.stringify(encrypted)],
        );
      } else
        await c.query(
          "DELETE FROM abasong.organization_contacts WHERE organization_id=$1",
          [r.id],
        );
      await c.query(
        "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',200,$5,now()+interval '24 hours')",
        [a.userId, route, key, digest, r.id],
      );
      await c.query(
        "INSERT INTO abasong.audit_events(actor_id,request_id,action,object_type,object_id,result) VALUES($1,$2,'team.updated','organization',$3,'success')",
        [a.userId, requestId, r.id],
      );
      return {
        ...(await this.ownerView(c, r)),
        contact_shared: r.contact_shared,
        business_contact: v.business_contact,
      };
    });
  }
  private async related(
    c: PoolClient,
    a: VerifiedIdentity,
    subject: TeamSubject,
    id: string,
  ) {
    const from =
      subject === "requests"
        ? "abasong.requests r JOIN abasong.organizations o ON o.id=r.organization_id AND o.contact_user_id=r.publisher_id"
        : "abasong.organizations o";
    const context =
      subject === "requests"
        ? "r.id=$1 AND r.status<>'draft' AND r.discarded_at IS NULL"
        : "o.contact_user_id=$1 AND o.profile_managed";
    const r = (
      await c.query<Row>(
        `SELECT ${columns} FROM ${from}
      JOIN abasong.users u ON u.id=o.contact_user_id AND u.status='active'
      WHERE ${context} AND o.active AND o.verification_status<>'rejected'
      AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=o.contact_user_id) OR (b.blocker_id=o.contact_user_id AND b.blocked_id=$2))`,
        [id, a.userId],
      )
    ).rows[0];
    if (!r) throw unavailable();
    return r;
  }
  detail(
    a: VerifiedIdentity,
    subject: TeamSubject,
    id: string,
    contact: boolean,
  ) {
    if (!UUID.test(id))
      throw new ApiError(400, "INVALID_INPUT", "资料编号无效");
    return this.tx(a, async (c) => {
      const r = await this.related(c, a, subject, id);
      if (!contact) return this.summary(c, r);
      if (!r.contact_shared) throw unavailable();
      await c.query("SELECT set_config('abasong.team_contact_id',$1,true)", [
        r.id,
      ]);
      const value = await this.readContact(c, r);
      // Recheck after decryption: revocation, block, disable and changed contact all fail closed.
      const latest = await this.related(c, a, subject, id);
      if (
        latest.id !== r.id ||
        latest.profile_version !== r.profile_version ||
        !latest.contact_shared ||
        !(value.phone || value.wechat)
      )
        throw unavailable();
      return {
        team_id: r.id,
        business_contact: value,
      } satisfies S["TeamContact"];
    });
  }
}
