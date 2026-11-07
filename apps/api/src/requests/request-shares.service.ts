import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import { z } from "zod";
import { Database } from "../database/database.service";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import { RequestsService, type RequestRow } from "./requests.service";
import { checked, requestId } from "./request-input";
import { calendarDate } from "./request-v2-input";
type S = components["schemas"];
const missing = () => new ApiError(404, "NOT_FOUND", "分享不存在或不可用");
@Injectable()
export class RequestSharesService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  private view(r: Record<string, unknown>): S["RequestShare"] {
    let base: URL;
    try {
      base = new URL(process.env.REQUEST_SHARE_BASE_URL ?? "");
      if (
        base.protocol !== "https:" ||
        base.username ||
        base.password ||
        base.search ||
        base.hash
      )
        throw Error();
    } catch {
      throw new ApiError(503, "SHARE_NOT_CONFIGURED", "分享入口暂未开放");
    }
    return {
      id: String(r.id),
      public_url: new URL(`/support/${r.token}`, base).href,
      expires_at: (r.expires_at as Date).toISOString(),
    };
  }
  async create(a: VerifiedIdentity, id: unknown, body: unknown, key: unknown) {
    const rid = requestId(id),
      k = requestId(key),
      p = checked(
        z.object({ public_preview_confirmed: z.literal(true) }).strict(),
        body,
      );
    return this.requests.tx(a, async (c) => {
      const r = await this.requests.row(c, a, rid, true, true);
      if (r.status !== "open" || r.is_expired)
        throw new ApiError(409, "REQUEST_ENDED", "只能分享仍开放的需求");
      const route = `request.share:${rid}`,
        h = createHmac("sha256", this.crypto.hmacKey("request-shares"))
          .update(JSON.stringify(p))
          .digest();
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${a.userId}:${route}:${k}`,
      ]);
      const ttl = Number(process.env.IDEMPOTENCY_RETENTION_SECONDS);
      if (!Number.isSafeInteger(ttl) || ttl <= 0)
        throw new ApiError(503, "IDEMPOTENCY_NOT_CONFIGURED", "服务暂不可用");
      const old = (
        await c.query(
          "SELECT request_hmac,response_object_id FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at>now()",
          [a.userId, route, k],
        )
      ).rows[0];
      if (old) {
        if (
          old.request_hmac.length !== h.length ||
          !timingSafeEqual(h, old.request_hmac)
        )
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "分享请求编号冲突");
        const s = (
          await c.query(
            "SELECT * FROM abasong.request_shares WHERE id=$1 AND created_by=$2 AND revoked_at IS NULL AND expires_at>now()",
            [old.response_object_id, a.userId],
          )
        ).rows[0];
        if (!s) throw missing();
        return this.view(s);
      }
      const s = (
        await c.query(
          "INSERT INTO abasong.request_shares(request_id,created_by,expires_at) VALUES($1,$2,LEAST($3,now()+interval '1 day')) RETURNING *",
          [rid, a.userId, r.expires_at],
        )
      ).rows[0];
      const result = this.view(s);
      await c.query(
        "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
        [a.userId, route, k],
      );
      await c.query(
        "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',$5,now()+$6*interval '1 second')",
        [a.userId, route, k, h, s.id, ttl],
      );
      await c.query(
        "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'request.share','request_share',$2,'success')",
        [a.userId, s.id],
      );
      return result;
    });
  }
  async revoke(a: VerifiedIdentity, id: unknown) {
    const sid = requestId(id);
    return this.requests.tx(a, async (c) => {
      const s = (
        await c.query(
          "SELECT s.* FROM abasong.request_shares s JOIN abasong.requests r ON r.id=s.request_id WHERE s.id=$1 AND (s.created_by=$2 OR r.publisher_id=$2) FOR UPDATE OF s",
          [sid, a.userId],
        )
      ).rows[0];
      if (!s) throw missing();
      const changed = await c.query(
        "UPDATE abasong.request_shares SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id",
        [sid],
      );
      if (changed.rowCount)
        await c.query(
          "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'request.share_revoke','request_share',$2,'success')",
          [a.userId, sid],
        );
      return { ok: true as const };
    });
  }
  private async shared(c: PoolClient, token: string) {
    const r = (
      await c.query<
        RequestRow & {
          share_ended: boolean;
          region_label: string;
          public_name: string;
          org_name: string | null;
        }
      >(
        `SELECT r.*,g.label AS region_label,p.display_name AS public_name,COALESCE(o.legacy_name,o.name) AS org_name,
      (s.expires_at<=now() OR r.status<>'open' OR r.expires_at<=now()) AS share_ended
      FROM abasong.request_shares s JOIN abasong.requests r ON r.id=s.request_id JOIN abasong.users u ON u.id=r.publisher_id
      JOIN abasong.profiles p ON p.user_id=r.publisher_id JOIN abasong.regions g ON g.id=r.region_id LEFT JOIN abasong.organizations o ON o.id=r.organization_id
      WHERE s.token=$1 AND s.revoked_at IS NULL AND r.discarded_at IS NULL AND r.status<>'draft' AND u.status='active'`,
        [token],
      )
    ).rows[0];
    if (!r) throw missing();
    return r;
  }
  async public(token: unknown) {
    const t = requestId(token),
      c = await this.db.pool.connect();
    try {
      const r = await this.shared(c, t);
      if (r.share_ended)
        return {
          status: "ended" as const,
          title: "配送需求已结束",
          summary: null,
        };
      const identity = r.publishing_identity as {
        publisher_display_name: string;
        organization: S["Organization"] | null;
      } | null;
      const summary = {
        carrier: r.carrier,
        kind: r.kind,
        region_label: r.region_label,
        pickup_area: r.pickup_area,
        starts_at: (r.starts_at as Date).toISOString(),
        expires_at: r.expires_at!.toISOString(),
        parcel_count: r.parcel_count,
        drivers_needed: r.drivers_needed,
        minimum_parcels: r.minimum_parcels,
        accepts_partial: r.accepts_partial,
        price_cents: r.price_cents,
        price_unit: r.price_unit,
        currency: "USD",
        experience_requirement: r.experience_requirement,
        public_publisher_name:
          identity?.publisher_display_name ?? r.public_name,
        public_organization_name: identity
          ? (identity.organization?.name ?? null)
          : r.org_name,
      };
      return {
        status: "open" as const,
        title: "配送需求",
        summary:
          r.request_schema_version === 2
            ? {
                ...summary,
                request_schema_version: 2,
                scenario: r.scenario,
                task_scope: r.task_scope,
                quantity_mode: r.quantity_mode,
                handoff_mode: r.handoff_mode,
                handoff_date: calendarDate(r.handoff_date),
                completion_mode: r.completion_mode,
                pickup_kind: r.pickup_kind,
              }
            : summary,
      };
    } finally {
      c.release();
    }
  }
  async resolve(a: VerifiedIdentity, token: unknown) {
    const t = requestId(token);
    return this.requests.tx(a, async (c) => {
      const r = await this.shared(c, t);
      if (r.share_ended) throw missing();
      return this.requests.view(c, await this.requests.row(c, a, r.id));
    });
  }
}
