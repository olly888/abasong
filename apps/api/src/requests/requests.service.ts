import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import { Database } from "../database/database.service";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import {
  checked,
  requestId,
  draftInput,
  patchInput,
  versionInput,
  closeInput,
  requestPageInput,
  validatePublishing,
} from "./request-input";
type S = components["schemas"];
type Row = Record<string, unknown> & {
  id: string;
  publisher_id: string;
  organization_id: string | null;
  kind: S["Request"]["kind"];
  status: S["Request"]["status"];
  version: number;
  discarded_at: Date | null;
  expires_at: Date | null;
};
const missing = () => new ApiError(404, "NOT_FOUND", "需求不存在或不可见");
const conflict = () =>
  new ApiError(409, "VERSION_CONFLICT", "需求已更新，请重新查看");
const contentKeys = [
  "region_id",
  "pickup_region_id",
  "pickup_area",
  "carrier",
  "route_label",
  "description",
  "starts_at",
  "expires_at",
  "pickup_deadline_at",
  "delivery_deadline_at",
  "timezone",
  "parcel_count",
  "stop_count",
  "drivers_needed",
  "price_cents",
  "price_unit",
  "sorted_state",
  "handoff_requirement",
  "private_payment_terms",
  "accepts_partial",
  "minimum_parcels",
  "experience_requirement",
] as const;
@Injectable()
export class RequestsService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  private async tx<T>(
    a: VerifiedIdentity,
    fn: (c: PoolClient) => Promise<T>,
    capability?: string,
  ) {
    const c = await this.db.pool.connect();
    try {
      await c.query("BEGIN");
      const user = (
        await c.query(
          "SELECT status,session_invalid_before FROM abasong.users WHERE id=$1 FOR SHARE",
          [a.userId],
        )
      ).rows[0];
      if (!user || user.status !== "active")
        throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用");
      if (
        user.session_invalid_before &&
        a.issuedAt * 1000 <= user.session_invalid_before.getTime()
      )
        throw new ApiError(401, "SESSION_REVOKED", "请重新登录");
      if (
        capability &&
        !(
          await c.query(
            "SELECT id FROM abasong.capabilities WHERE user_id=$1 AND capability=$2 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR SHARE",
            [a.userId, capability],
          )
        ).rowCount
      )
        throw new ApiError(403, "CAPABILITY_REQUIRED", "当前未开通发布资格");
      const value = await fn(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async row(
    c: PoolClient,
    a: VerifiedIdentity,
    id: string,
    owner = false,
    lock = false,
  ): Promise<Row> {
    const r = (
      await c.query<Row>(
        `SELECT r.*,(r.status='open' AND r.expires_at<=now()) AS is_expired FROM abasong.requests r JOIN abasong.users u ON u.id=r.publisher_id WHERE r.id=$1 AND r.discarded_at IS NULL AND u.status='active' AND (r.publisher_id=$2 OR (r.status<>'draft' AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=r.publisher_id) OR (b.blocker_id=r.publisher_id AND b.blocked_id=$2)))) ${lock ? "FOR UPDATE OF r" : ""}`,
        [id, a.userId],
      )
    ).rows[0];
    if (!r || (owner && r.publisher_id !== a.userId)) throw missing();
    return r;
  }
  private async view(c: PoolClient, r: Row): Promise<S["Request"]> {
    const p = (
      await c.query(
        "SELECT user_id,display_name,bio,vehicle_type,experience FROM abasong.profiles WHERE user_id=$1",
        [r.publisher_id],
      )
    ).rows[0];
    if (!p) throw missing();
    const organization = r.organization_id
      ? (
          await c.query(
            "SELECT id,name,contact_user_id,verification_status FROM abasong.organizations WHERE id=$1",
            [r.organization_id],
          )
        ).rows[0]
      : null;
    const status =
      r.status === "open" && r.is_expired === true ? "expired" : r.status;
    const content = Object.fromEntries(
      contentKeys.map((k) => [
        k,
        r[k] instanceof Date ? (r[k] as Date).toISOString() : (r[k] ?? null),
      ]),
    );
    return {
      ...content,
      id: r.id,
      publisher: {
        ...p,
        experience: p.experience.map((e: Record<string, unknown>) => ({
          carrier: e.carrier,
          region_label: e.region_label,
          description: e.description,
          source: "self_reported",
        })),
      },
      organization,
      kind: r.kind,
      status,
      version: r.version,
      remaining_parcels: r.remaining_parcels ?? null,
      remaining_drivers: r.remaining_drivers ?? null,
      currency: "USD",
    } as S["Request"];
  }
  private async input(
    c: PoolClient,
    value: Record<string, unknown>,
    current?: Row,
  ) {
    const data = { ...value };
    delete data.expected_version;
    for (const k of ["region_id", "pickup_region_id"] as const) {
      const id = data[k];
      if (!id) continue;
      const region = (
        await c.query(
          "SELECT label,timezone FROM abasong.regions WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (!region || region.timezone !== "America/Los_Angeles")
        throw new ApiError(400, "INVALID_REGION", "请选择支持的配送区域");
      if (k === "pickup_region_id") data.pickup_area = region.label;
    }
    if (data.organization_id) {
      const org = (
        await c.query(
          "SELECT id FROM abasong.organizations WHERE id=$1 AND contact_user_id=$2 AND verification_status<>'rejected'",
          [data.organization_id, current?.publisher_id],
        )
      ).rows[0];
      if (!org)
        throw new ApiError(
          403,
          "ORGANIZATION_REQUIRED",
          "不能代表这个组织发布",
        );
    }
    if ((data.price_unit ?? current?.price_unit) === "negotiable")
      data.price_cents = null;
    if (
      data.expires_at &&
      Date.parse(String(data.expires_at)) <=
        (current?.created_at instanceof Date
          ? current.created_at.getTime()
          : Date.now())
    )
      throw new ApiError(
        400,
        "INVALID_INPUT",
        "有效截止时间已过，请更新后保存",
      );
    if ((data.kind ?? current?.kind) === "whole_route") {
      data.accepts_partial = false;
      if (data.parcel_count !== undefined || current?.parcel_count)
        data.minimum_parcels =
          data.parcel_count !== undefined
            ? data.parcel_count
            : current?.parcel_count;
    }
    const merged = { ...current, ...data };
    if (
      merged.minimum_parcels &&
      merged.parcel_count &&
      Number(merged.minimum_parcels) > Number(merged.parcel_count)
    )
      throw new ApiError(400, "INVALID_INPUT", "最低承接量不能超过本次件数");
    return data;
  }
  private async write(
    c: PoolClient,
    a: VerifiedIdentity,
    route: string,
    key: unknown,
    body: unknown,
    run: () => Promise<Row>,
  ): Promise<S["Request"]> {
    const k = requestId(key),
      retention = Number(process.env.IDEMPOTENCY_RETENTION_SECONDS);
    if (!Number.isSafeInteger(retention) || retention <= 0)
      throw new ApiError(503, "IDEMPOTENCY_NOT_CONFIGURED", "服务暂不可用");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${a.userId}:${route}:${k}`,
    ]);
    const h = createHmac("sha256", this.crypto.hmacKey("request-publishing"))
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
        old.request_hmac.length !== h.length ||
        !timingSafeEqual(h, old.request_hmac)
      )
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "请求编号已用于其他内容",
        );
      return this.view(c, await this.row(c, a, old.response_object_id, true));
    }
    const r = await run();
    await c.query(
      "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
      [a.userId, route, k],
    );
    await c.query(
      "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',$5,now()+$6*interval '1 second')",
      [a.userId, route, k, h, r.id, retention],
    );
    await c.query(
      "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,$2,'request',$3,'success')",
      [a.userId, route.split(":")[0], r.id],
    );
    return this.view(c, r);
  }
  async regions(a: VerifiedIdentity, query: unknown): Promise<S["RegionPage"]> {
    const q = checked(
      requestPageInput.pick({ cursor: true, limit: true }),
      query,
    );
    return this.tx(a, async (c) => {
      const rows = (
        await c.query(
          "SELECT id,label,timezone,extensions.ST_X(display_point::extensions.geometry) AS lng,extensions.ST_Y(display_point::extensions.geometry) AS lat FROM abasong.regions WHERE display_point IS NOT NULL AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2",
          [q.cursor ?? null, q.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, q.limit).map((r) => ({
          id: r.id,
          label: r.label,
          timezone: r.timezone,
          display_point: { lng: r.lng, lat: r.lat },
        })),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
      };
    });
  }
  async create(a: VerifiedIdentity, body: unknown, key: unknown) {
    const p = checked(draftInput, body);
    return this.tx(
      a,
      (c) =>
        this.write(c, a, "request.create", key, p, async () => {
          const data = await this.input(c, p, {
              publisher_id: a.userId,
            } as Row),
            keys = Object.keys(data);
          return (
            await c.query<Row>(
              `INSERT INTO abasong.requests(publisher_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => "$" + (i + 2)).join(",")}) RETURNING *`,
              [a.userId, ...keys.map((k) => data[k])],
            )
          ).rows[0]!;
        }),
      "request.publish",
    );
  }
  async patch(a: VerifiedIdentity, id: unknown, body: unknown) {
    const rid = requestId(id),
      p = checked(patchInput, body);
    return this.tx(
      a,
      async (c) => {
        const r = await this.row(c, a, rid, true, true);
        if (r.version !== p.expected_version) throw conflict();
        if (r.status !== "draft")
          throw new ApiError(
            409,
            "REQUEST_STATE_CONFLICT",
            "当前仅可编辑未发布草稿",
          );
        const data = await this.input(c, p, r),
          keys = Object.keys(data);
        if (!keys.length) return this.view(c, r);
        const row = (
          await c.query<Row>(
            `UPDATE abasong.requests SET ${keys.map((k, i) => k + "=$" + (i + 2)).join(",")},version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
            [rid, ...keys.map((k) => data[k])],
          )
        ).rows[0]!;
        await c.query(
          "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'request.update','request',$2,'success')",
          [a.userId, rid],
        );
        return this.view(c, row);
      },
      "request.publish",
    );
  }
  private async snapshot(c: PoolClient, r: Row) {
    const v = await this.view(c, r),
      fields = [
        "kind",
        "region_id",
        "starts_at",
        "expires_at",
        "price_cents",
        "price_unit",
        "parcel_count",
        "handoff_requirement",
        "pickup_area",
        "carrier",
        "route_label",
        "pickup_deadline_at",
        "delivery_deadline_at",
        "timezone",
        "drivers_needed",
        "stop_count",
        "sorted_state",
        "currency",
        "private_payment_terms",
        "accepts_partial",
        "minimum_parcels",
        "experience_requirement",
        "pickup_region_id",
      ] as const;
    const snapshot = {
      request_id: r.id,
      version: r.version,
      ...Object.fromEntries(fields.map((k) => [k, v[k]])),
    };
    await c.query(
      "INSERT INTO abasong.request_versions(request_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4)",
      [r.id, r.version, snapshot, r.publisher_id],
    );
  }
  async publish(a: VerifiedIdentity, id: unknown, body: unknown, key: unknown) {
    const rid = requestId(id),
      p = checked(versionInput, body);
    return this.tx(
      a,
      (c) =>
        this.write(c, a, `request.publish:${rid}`, key, p, async () => {
          const r = await this.row(c, a, rid, true, true);
          if (r.version !== p.expected_version) throw conflict();
          if (r.status !== "draft")
            throw new ApiError(
              409,
              "REQUEST_STATE_CONFLICT",
              "需求已发布或结束",
            );
          const clock = (
            await c.query("SELECT now() AS clock")
          ).rows[0].clock.getTime();
          validatePublishing(
            Object.fromEntries(
              Object.entries(r).map(([k, v]) => [
                k,
                v instanceof Date ? v.toISOString() : v,
              ]),
            ),
            clock,
          );
          const next = (
            await c.query<Row>(
              "UPDATE abasong.requests SET status='open',remaining_parcels=parcel_count,remaining_drivers=drivers_needed,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [rid],
            )
          ).rows[0]!;
          await this.snapshot(c, next);
          return next;
        }),
      "request.publish",
    );
  }
  async close(a: VerifiedIdentity, id: unknown, body: unknown, key: unknown) {
    const rid = requestId(id),
      p = checked(closeInput, body);
    return this.tx(a, (c) =>
      this.write(c, a, `request.close:${rid}`, key, p, async () => {
        const r = await this.row(c, a, rid, true, true);
        if (r.version !== p.expected_version) throw conflict();
        if (
          r.status === "draft" ||
          r.status === "closed" ||
          r.status === "found"
        )
          throw new ApiError(
            409,
            "REQUEST_STATE_CONFLICT",
            "需求当前不能再次关闭",
          );
        const next = (
          await c.query<Row>(
            "UPDATE abasong.requests SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
            [rid, p.status],
          )
        ).rows[0]!;
        await this.snapshot(c, next);
        return next;
      }),
    );
  }
  async discard(a: VerifiedIdentity, id: unknown) {
    const rid = requestId(id);
    return this.tx(a, async (c) => {
      const r = await this.row(c, a, rid, true, true);
      if (r.status !== "draft")
        throw new ApiError(409, "REQUEST_STATE_CONFLICT", "只能删除未发布草稿");
      await c.query(
        "UPDATE abasong.requests SET discarded_at=now(),updated_at=now() WHERE id=$1",
        [rid],
      );
      await c.query(
        "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'request.discard','request',$2,'success')",
        [a.userId, rid],
      );
      return { ok: true as const };
    });
  }
  async get(a: VerifiedIdentity, id: unknown) {
    const rid = requestId(id);
    return this.tx(a, async (c) => this.view(c, await this.row(c, a, rid)));
  }
  async list(
    a: VerifiedIdentity,
    query: unknown,
    mine = false,
  ): Promise<S["RequestPage"]> {
    const q = checked(
      mine
        ? requestPageInput.pick({ cursor: true, limit: true })
        : requestPageInput,
      query,
    );
    const filter = q as {
      region_id?: string;
      kind?: string;
      carrier?: string;
      query?: string;
    };
    return this.tx(a, async (c) => {
      if (q.cursor) await this.row(c, a, q.cursor, mine);
      const rows = (
        await c.query<Row>(
          `SELECT r.*,(r.status='open' AND r.expires_at<=now()) AS is_expired FROM abasong.requests r JOIN abasong.users u ON u.id=r.publisher_id WHERE r.discarded_at IS NULL AND u.status='active' AND ($2::uuid IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM abasong.requests WHERE id=$2)) AND ${mine ? "r.publisher_id=$1" : "r.status='open' AND r.expires_at>now() AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.publisher_id) OR (b.blocker_id=r.publisher_id AND b.blocked_id=$1))"} AND ($3::uuid IS NULL OR r.region_id=$3) AND ($4::text IS NULL OR r.kind=$4) AND ($5::text IS NULL OR lower(r.carrier)=lower($5)) AND ($6::text IS NULL OR strpos(lower(concat_ws(' ',r.carrier,r.route_label,r.description)),lower($6))>0) ORDER BY r.created_at DESC,r.id DESC LIMIT $7`,
          [
            a.userId,
            q.cursor ?? null,
            filter.region_id ?? null,
            filter.kind ?? null,
            filter.carrier ?? null,
            filter.query ?? null,
            q.limit + 1,
          ],
        )
      ).rows;
      return {
        items: await Promise.all(
          rows.slice(0, q.limit).map((r) => this.view(c, r)),
        ),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
      };
    });
  }
}
