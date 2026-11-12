import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
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
  gapInput,
  requestPageInput,
  validatePublishing,
} from "./request-input";
import { notifyRequestChange, safeRequestSnapshot } from "./request-events";
import { MapboxNearbyProvider } from "../nearby/mapbox-nearby.provider";
import {
  calendarDate,
  draftV2Input,
  patchV2Input,
  gapV2Input,
} from "./request-v2-input";
import {
  appendPickup,
  normalizeV2,
  pickupView,
  publishingIdentity,
  v2Terms,
} from "./request-v2-store";
type S = components["schemas"];
export type RequestView =
  S["Request"] | S["RequestDetailV2"] | S["RequestSummaryV2"];
export type RequestRow = Record<string, unknown> & {
  id: string;
  publisher_id: string;
  organization_id: string | null;
  kind: S["Request"]["kind"];
  status: S["Request"]["status"];
  version: number;
  discarded_at: Date | null;
  expires_at: Date | null;
};
type Row = RequestRow;
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
    @Inject(MapboxNearbyProvider) private readonly maps: MapboxNearbyProvider,
  ) {}
  // Shared transaction and object checks for request/application services.
  async tx<T>(
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
        throw new ApiError(
          403,
          "CAPABILITY_REQUIRED",
          capability === "request.apply"
            ? "当前未开通报名资格"
            : "当前未开通发布资格",
        );
      await c.query("SELECT set_config('abasong.actor_id',$1,true)", [
        a.userId,
      ]);
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
  async row(
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
  async view(c: PoolClient, r: Row, detail = true): Promise<RequestView> {
    const p = (
      await c.query(
        "SELECT user_id,display_name,bio,vehicle_type,experience FROM abasong.profiles WHERE user_id=$1",
        [r.publisher_id],
      )
    ).rows[0];
    if (!p) throw missing();
    const identity = r.publishing_identity as {
      publisher_display_name: string;
      organization: S["Organization"] | null;
    } | null;
    const organization = identity
      ? identity.organization
      : r.organization_id
        ? (
            await c.query(
              "SELECT id,CASE WHEN $2 THEN name ELSE COALESCE(legacy_name,name) END AS name,contact_user_id,CASE WHEN $2 THEN verification_status ELSE COALESCE(legacy_verification_status,verification_status) END AS verification_status FROM abasong.organizations WHERE id=$1",
              [r.organization_id, r.status === "draft"],
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
    const result = {
      ...content,
      id: r.id,
      publisher: {
        ...p,
        display_name: identity?.publisher_display_name ?? p.display_name,
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
    if (r.request_schema_version !== 2) return result;
    const { private_payment_terms, ...summary } = result;
    const v2 = {
      ...summary,
      ...Object.fromEntries(
        v2Terms.map((k) => [
          k,
          k === "handoff_date" ? calendarDate(r[k]) : (r[k] ?? null),
        ]),
      ),
    } as S["RequestSummaryV2"];
    return detail
      ? { ...v2, private_payment_terms, pickup: await pickupView(c, r) }
      : v2;
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
          "SELECT id FROM abasong.organizations WHERE id=$1 AND contact_user_id=$2 AND active AND verification_status<>'rejected'",
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
    if (
      (data.kind ?? current?.kind) === "whole_route" &&
      (data.request_schema_version ?? current?.request_schema_version) !== 2
    ) {
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
      merged.quantity_mode !== "estimate" &&
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
  ): Promise<RequestView> {
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
    if (
      body &&
      typeof body === "object" &&
      "request_schema_version" in body &&
      body.request_schema_version === 2
    )
      return this.createV2(a, body, key);
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
  private normalizedV2(
    p: Awaited<ReturnType<typeof normalizeV2>>,
  ): Record<string, unknown> {
    const { pickup, ...data } = p;
    void pickup;
    return data;
  }
  private async updateV2(
    c: PoolClient,
    id: string,
    data: Record<string, unknown>,
  ) {
    const keys = Object.keys(data);
    return (
      await c.query<Row>(
        `UPDATE abasong.requests SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(",")},version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [id, ...keys.map((k) => data[k])],
      )
    ).rows[0]!;
  }
  private async createV2(a: VerifiedIdentity, body: unknown, key: unknown) {
    const p = checked(draftV2Input, body);
    return this.tx(
      a,
      (c) =>
        this.write(c, a, "request.create", key, p, async () => {
          const { pickup, ...fields } = p;
          const data = await this.input(
            c,
            {
              ...fields,
              kind:
                p.scenario === "warehouse_shortage"
                  ? "extra_drivers"
                  : p.task_scope === "whole_route"
                    ? "whole_route"
                    : "partial_route",
            },
            { publisher_id: a.userId } as Row,
          );
          const keys = Object.keys(data);
          const r = (
            await c.query<Row>(
              `INSERT INTO abasong.requests(publisher_id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => `$${i + 2}`).join(",")}) RETURNING *`,
              [a.userId, ...keys.map((k) => data[k])],
            )
          ).rows[0]!;
          if (!pickup) return r;
          const ref = await appendPickup(c, r, pickup, this.maps);
          return (
            await c.query<Row>(
              "UPDATE abasong.requests SET pickup_kind=$2,pickup_address_version=$3 WHERE id=$1 RETURNING *",
              [r.id, ref.pickup_kind, ref.pickup_address_version],
            )
          ).rows[0]!;
        }),
      "request.publish",
    );
  }
  private async patchV2(
    c: PoolClient,
    a: VerifiedIdentity,
    r: Row,
    p: z.infer<typeof patchV2Input>,
  ) {
    const { pickup, expected_version, request_schema_version, ...fields } = p;
    void expected_version;
    void request_schema_version;
    if (r.status !== "draft" && fields.organization_id !== undefined)
      throw new ApiError(
        409,
        "PUBLISHING_IDENTITY_LOCKED",
        "已发布需求不能更换发布身份",
      );
    let data: Record<string, unknown> = await this.input(c, fields, r);
    if (!Object.keys(data).length && pickup === undefined)
      return this.view(c, r);
    if (pickup !== undefined) {
      Object.assign(data, await appendPickup(c, r, pickup, this.maps));
      // A new pickup never silently retains a region derived for a previous address.
      if (
        !p.pickup_region_id &&
        (data.pickup_kind !== r.pickup_kind ||
          data.pickup_address_version !== r.pickup_address_version)
      ) {
        data.pickup_region_id = null;
        data.pickup_area = null;
      }
    }
    const merged = { ...r, ...data } as Row;
    data.kind =
      r.scenario === "warehouse_shortage"
        ? "extra_drivers"
        : merged.task_scope === "whole_route"
          ? "whole_route"
          : "partial_route";
    if (r.status !== "draft") {
      await publishingIdentity(c, r);
      const normalized = await normalizeV2(
        // Historical display identity is fixed; current authority is not.
        c,
        { ...merged, kind: data.kind } as Row,
        (await c.query("SELECT now() AS clock")).rows[0].clock.getTime(),
        !["starts_at", "handoff_date", "handoff_mode"].some((k) =>
          Object.hasOwn(fields, k),
        ),
      );
      const next = this.normalizedV2(normalized);
      delete next.organization_id;
      next.remaining_parcels =
        merged.quantity_mode !== "exact"
          ? null
          : r.quantity_mode !== "exact" || merged.task_scope === "whole_route"
            ? r.remaining_parcels === 0
              ? 0
              : normalized.parcel_count
            : r.remaining_parcels;
      next.remaining_drivers =
        normalized.drivers_needed == null
          ? null
          : r.drivers_needed == null
            ? normalized.drivers_needed
            : r.remaining_drivers;
      if (
        next.remaining_parcels != null &&
        Number(next.remaining_parcels) > Number(normalized.parcel_count)
      )
        throw new ApiError(409, "GAP_CONFLICT", "请先调整当前件数缺口");
      if (
        next.remaining_drivers != null &&
        (normalized.drivers_needed == null ||
          Number(next.remaining_drivers) > normalized.drivers_needed)
      )
        throw new ApiError(409, "GAP_CONFLICT", "请先调整当前人数缺口");
      data = { ...data, ...next };
      if (r.is_expired) data.status = "expired";
    }
    const row = await this.updateV2(c, r.id, data);
    if (r.status !== "draft") {
      await this.snapshot(c, row);
      await notifyRequestChange(c, row.id, row.version, a.userId);
    }
    await c.query(
      "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'request.update','request',$2,'success')",
      [a.userId, r.id],
    );
    return this.view(c, row);
  }
  async patch(a: VerifiedIdentity, id: unknown, body: unknown) {
    const rid = requestId(id),
      p =
        body && typeof body === "object" && "request_schema_version" in body
          ? checked(patchV2Input, body)
          : checked(patchInput, body);
    return this.tx(
      a,
      async (c) => {
        const r = await this.row(c, a, rid, true, true);
        if (r.version !== p.expected_version) throw conflict();
        if (r.request_schema_version === 2)
          return this.patchV2(c, a, r, checked(patchV2Input, body));
        if ("request_schema_version" in p)
          throw new ApiError(400, "INVALID_INPUT", "需求版本不一致");
        const data = await this.input(c, p, r),
          keys = Object.keys(data);
        if (!keys.length) return this.view(c, r);
        if (r.status !== "draft") {
          validatePublishing(
            Object.fromEntries(
              Object.entries({ ...r, ...data }).map(([k, v]) => [
                k,
                v instanceof Date ? v.toISOString() : v,
              ]),
            ),
            (await c.query("SELECT now() AS clock")).rows[0].clock.getTime(),
          );
          if (
            data.parcel_count !== undefined &&
            Number(data.parcel_count) < Number(r.remaining_parcels ?? 0) &&
            r.kind !== "whole_route"
          )
            throw new ApiError(
              409,
              "GAP_CONFLICT",
              "总件数不能少于当前缺口，请先调整缺口",
            );
          if (
            data.drivers_needed !== undefined &&
            Number(data.drivers_needed) < Number(r.remaining_drivers ?? 0)
          )
            throw new ApiError(
              409,
              "GAP_CONFLICT",
              "总人数不能少于当前缺口，请先调整缺口",
            );
          if (
            r.kind === "whole_route" &&
            data.parcel_count !== undefined &&
            Number(r.remaining_parcels) > 0
          )
            data.remaining_parcels = data.parcel_count;
          // Expiry must not be silently reversed by editing future dates.
          if (r.is_expired === true) data.status = "expired";
        }
        const updateKeys = Object.keys(data);
        const row = (
          await c.query<Row>(
            `UPDATE abasong.requests SET ${updateKeys.map((k, i) => k + "=$" + (i + 2)).join(",")},version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
            [rid, ...updateKeys.map((k) => data[k])],
          )
        ).rows[0]!;
        if (r.status !== "draft") {
          await this.snapshot(c, row);
          await notifyRequestChange(c, row.id, row.version, a.userId);
        }
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
    if (r.request_schema_version === 2) {
      const v = await this.view(c, r, false);
      const snapshot = safeRequestSnapshot({
        ...v,
        request_id: r.id,
        pickup_address_version: r.pickup_address_version,
        publisher_display_name: (v as S["RequestSummaryV2"]).publisher
          .display_name,
        organization_name: v.organization?.name ?? null,
      });
      await c.query(
        "INSERT INTO abasong.request_versions(request_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4)",
        [r.id, r.version, snapshot, r.publisher_id],
      );
      return;
    }
    const v = (await this.view(c, r)) as S["Request"],
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
      p = checked(
        versionInput.extend({
          expected_team_version: z
            .number()
            .int()
            .min(0)
            .max(2147483647)
            .optional(),
        }),
        body,
      );
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
          if (r.request_schema_version === 2) {
            const normalized = await normalizeV2(c, r, clock);
            const next = await this.updateV2(c, r.id, {
              ...this.normalizedV2(normalized),
              status: "open",
              publishing_identity: await publishingIdentity(
                c,
                r,
                p.expected_team_version,
              ),
            });
            await this.snapshot(c, next);
            return next;
          }
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
              "UPDATE abasong.requests SET status='open',remaining_parcels=parcel_count,remaining_drivers=drivers_needed,version=version+1,updated_at=now(),publishing_identity=$2 WHERE id=$1 RETURNING *",
              [rid, await publishingIdentity(c, r, p.expected_team_version)],
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
        await notifyRequestChange(c, next.id, next.version, a.userId);
        return next;
      }),
    );
  }
  async reopen(a: VerifiedIdentity, id: unknown, body: unknown, key: unknown) {
    const rid = requestId(id),
      p = checked(versionInput, body);
    return this.tx(
      a,
      (c) =>
        this.write(c, a, `request.reopen:${rid}`, key, p, async () => {
          const r = await this.row(c, a, rid, true, true);
          if (r.version !== p.expected_version) throw conflict();
          if (r.status === "draft" || (r.status === "open" && !r.is_expired))
            throw new ApiError(
              409,
              "REQUEST_STATE_CONFLICT",
              "只能重开已结束的需求",
            );
          if (r.request_schema_version === 2) {
            const normalized = await normalizeV2(
              c,
              r,
              (await c.query("SELECT now() AS clock")).rows[0].clock.getTime(),
            );
            const next = await this.updateV2(c, r.id, {
              ...this.normalizedV2(normalized),
              status: "open",
              publishing_identity: await publishingIdentity(c, r),
            });
            await this.snapshot(c, next);
            await notifyRequestChange(c, next.id, next.version, a.userId);
            return next;
          }
          validatePublishing(
            Object.fromEntries(
              Object.entries(r).map(([k, v]) => [
                k,
                v instanceof Date ? v.toISOString() : v,
              ]),
            ),
            (await c.query("SELECT now() AS clock")).rows[0].clock.getTime(),
          );
          const next = (
            await c.query<Row>(
              "UPDATE abasong.requests SET status='open',remaining_parcels=parcel_count,remaining_drivers=drivers_needed,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [rid],
            )
          ).rows[0]!;
          await this.snapshot(c, next);
          await notifyRequestChange(c, next.id, next.version, a.userId);
          return next;
        }),
      "request.publish",
    );
  }
  async gap(a: VerifiedIdentity, id: unknown, body: unknown) {
    const rid = requestId(id),
      p =
        body && typeof body === "object" && "request_schema_version" in body
          ? checked(gapV2Input, body)
          : checked(gapInput, body);
    return this.tx(a, async (c) => {
      const r = await this.row(c, a, rid, true, true);
      if (r.version !== p.expected_version) throw conflict();
      if (r.status !== "open" || r.is_expired)
        throw new ApiError(
          409,
          "REQUEST_STATE_CONFLICT",
          "只能更新开放需求的缺口",
        );
      if (r.request_schema_version === 2) {
        const v = checked(gapV2Input, body);
        if (
          (r.quantity_mode !== "exact" &&
            v.remaining_parcels !== undefined &&
            v.remaining_parcels !== null) ||
          (r.quantity_mode === "exact" && v.remaining_parcels === null)
        )
          throw new ApiError(
            422,
            "INVALID_CAPACITY",
            "待确认或约数不能填写精确件数缺口",
          );
      } else if ("request_schema_version" in p)
        throw new ApiError(400, "INVALID_INPUT", "需求版本不一致");
      for (const [value, total] of [
        [p.remaining_parcels, r.parcel_count],
        [p.remaining_drivers, r.drivers_needed],
      ])
        if (
          value !== undefined &&
          value !== null &&
          (typeof total !== "number" || Number(value) > total)
        )
          throw new ApiError(400, "INVALID_INPUT", "缺口不能超过本次总量");
      if (
        (r.kind === "whole_route" ||
          (r.request_schema_version === 2 && r.task_scope === "whole_route")) &&
        p.remaining_parcels !== undefined &&
        p.remaining_parcels !== 0 &&
        p.remaining_parcels !== r.parcel_count
      )
        throw new ApiError(400, "INVALID_INPUT", "整条线路须整线承接");
      if (["vehicle_help", "other_help"].includes(r.kind))
        throw new ApiError(400, "INVALID_INPUT", "此类求助无需件数缺口");
      const next = (
        await c.query<Row>(
          "UPDATE abasong.requests SET remaining_parcels=COALESCE($2,remaining_parcels),remaining_drivers=COALESCE($3,remaining_drivers),version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
          [rid, p.remaining_parcels ?? null, p.remaining_drivers ?? null],
        )
      ).rows[0]!;
      await this.snapshot(c, next);
      await notifyRequestChange(c, next.id, next.version, a.userId);
      await c.query(
        "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'request.gap','request',$2,'success')",
        [a.userId, rid],
      );
      return this.view(c, next);
    });
  }
  async versions(a: VerifiedIdentity, id: unknown, query: unknown) {
    const rid = requestId(id),
      q = checked(
        requestPageInput
          .pick({ limit: true })
          .extend({
            cursor: z.coerce
              .number()
              .int()
              .positive()
              .max(2147483647)
              .optional(),
          })
          .strict(),
        query,
      );
    return this.tx(a, async (c) => {
      const r = await this.row(c, a, rid);
      if (
        r.publisher_id !== a.userId &&
        !(
          await c.query(
            "SELECT id FROM abasong.applications WHERE request_id=$1 AND applicant_id=$2",
            [rid, a.userId],
          )
        ).rowCount
      )
        throw missing();
      const rows = (
        await c.query(
          "SELECT snapshot,version FROM abasong.request_versions WHERE request_id=$1 AND ($2::integer IS NULL OR version<$2) ORDER BY version DESC LIMIT $3",
          [rid, q.cursor ?? null, q.limit + 1],
        )
      ).rows;
      return {
        items: rows
          .slice(0, q.limit)
          .map((x) => safeRequestSnapshot(x.snapshot)),
        next_cursor:
          rows.length > q.limit ? String(rows[q.limit - 1].version) : null,
      };
    });
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
  async list(a: VerifiedIdentity, query: unknown, mine = false) {
    const q = checked(
      mine
        ? requestPageInput.pick({
            cursor: true,
            limit: true,
            request_schema_version: true,
          })
        : requestPageInput,
      query,
    );
    const filter = q as {
      region_id?: string;
      kind?: string;
      scenario?: string;
      carrier?: string;
      query?: string;
      day?: string;
    };
    return this.tx(a, async (c) => {
      if (q.cursor) {
        const cursor = await this.row(c, a, q.cursor, mine);
        if (cursor.request_schema_version !== (q.request_schema_version ?? 1))
          throw missing();
      }
      const rows = (
        await c.query<Row & { updated_at: Date }>(
          `SELECT r.*,(r.status='open' AND r.expires_at<=now()) AS is_expired FROM abasong.requests r JOIN abasong.users u ON u.id=r.publisher_id WHERE r.request_schema_version=$9 AND r.discarded_at IS NULL AND u.status='active' AND ($2::uuid IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM abasong.requests WHERE id=$2)) AND ${mine ? "r.publisher_id=$1" : "r.status='open' AND r.expires_at>now() AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=r.publisher_id) OR (b.blocker_id=r.publisher_id AND b.blocked_id=$1))"} AND ($3::uuid IS NULL OR r.region_id=$3) AND ($4::text IS NULL OR r.kind=$4) AND ($5::text IS NULL OR lower(r.carrier)=lower($5)) AND ($6::text IS NULL OR strpos(lower(concat_ws(' ',r.carrier,r.route_label,r.description,(SELECT label FROM abasong.regions WHERE id=r.region_id))),lower($6))>0) AND ($7::date IS NULL OR CASE WHEN r.request_schema_version=2 THEN r.handoff_date=$7::date ELSE (r.starts_at<(($7::date+1)::timestamp AT TIME ZONE 'America/Los_Angeles') AND r.expires_at>($7::date::timestamp AT TIME ZONE 'America/Los_Angeles')) END) AND ($10::text IS NULL OR r.scenario=$10) ORDER BY r.created_at DESC,r.id DESC LIMIT $8`,
          [
            a.userId,
            q.cursor ?? null,
            filter.region_id ?? null,
            filter.kind ?? null,
            filter.carrier ?? null,
            filter.query ?? null,
            filter.day ?? null,
            q.limit + 1,
            q.request_schema_version ?? 1,
            filter.scenario ?? null,
          ],
        )
      ).rows;
      return {
        items: await Promise.all(
          rows.slice(0, q.limit).map(async (r) => {
            const summary = await this.view(c, r, false);
            return mine && r.request_schema_version === 2
              ? { ...summary, updated_at: r.updated_at.toISOString() }
              : summary;
          }),
        ),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
      };
    });
  }
}
