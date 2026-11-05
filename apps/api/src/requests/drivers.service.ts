import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { RequestsService } from "./requests.service";
import { checked, requestId } from "./request-input";
import { availabilityInput, driverPageInput } from "./drivers-input";
type S = components["schemas"];
@Injectable()
export class DriversService {
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
  ) {}
  private async availability(
    c: PoolClient,
    id: string,
  ): Promise<S["Availability"] | null> {
    const r = (
      await c.query("SELECT * FROM abasong.availability WHERE user_id=$1", [id])
    ).rows[0];
    if (!r) return null;
    const regions = (
      await c.query(
        "SELECT region_id FROM abasong.availability_regions WHERE user_id=$1 ORDER BY region_id",
        [id],
      )
    ).rows;
    return {
      user_id: id,
      version: r.version,
      enabled: r.enabled,
      currently_available:
        r.enabled &&
        r.starts_at.getTime() <= Date.now() &&
        r.ends_at.getTime() > Date.now(),
      starts_at: r.starts_at.toISOString(),
      ends_at: r.ends_at.toISOString(),
      region_ids: regions.map((x) => x.region_id),
      capacity_parcels: r.capacity_parcels,
      latest_finish_at: r.latest_finish_at?.toISOString() ?? null,
    };
  }
  mine(a: VerifiedIdentity) {
    return this.requests.tx(a, async (c) => {
      const r = await this.availability(c, a.userId);
      if (!r) throw new ApiError(404, "NOT_FOUND", "尚未设置可接活时段");
      return r;
    });
  }
  set(a: VerifiedIdentity, body: unknown) {
    const p = checked(availabilityInput, body);
    return this.requests.tx(a, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `availability:${a.userId}`,
      ]);
      const old = await this.availability(c, a.userId);
      if ((old?.version ?? 0) !== p.expected_version)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "可接活状态已更新，请重新读取",
        );
      let start = old?.starts_at ?? new Date().toISOString(),
        end = old?.ends_at ?? new Date(Date.now() + 3600000).toISOString(),
        finish = old?.latest_finish_at ?? null,
        regions = old?.region_ids ?? [],
        capacity = old?.capacity_parcels ?? null;
      if (p.enabled) {
        start = p.starts_at!;
        end = p.ends_at!;
        finish = p.latest_finish_at ?? null;
        regions = p.region_ids!;
        capacity = p.capacity_parcels ?? null;
        const s = Date.parse(start),
          e = Date.parse(end),
          now = Date.now();
        if (
          e <= now ||
          e <= s ||
          e - s > 86400000 ||
          s > now + 7 * 86400000 ||
          (finish !== null && Date.parse(finish) < s)
        )
          throw new ApiError(
            422,
            "INVALID_AVAILABILITY",
            "请选择尚未结束、最长24小时的本次时段，开始时间在7天内",
          );
        const valid = await c.query(
          "SELECT id FROM abasong.regions WHERE id=ANY($1::uuid[]) AND display_point IS NOT NULL",
          [regions],
        );
        if (valid.rowCount !== regions.length)
          throw new ApiError(
            422,
            "REGION_UNAVAILABLE",
            "部分区域暂不可用，请重新选择",
          );
      }
      // Saving an unchanged intent at the current version does not add a version.
      const unchanged =
        old &&
        old.enabled === p.enabled &&
        (!p.enabled ||
          (Date.parse(old.starts_at) === Date.parse(start) &&
            Date.parse(old.ends_at) === Date.parse(end) &&
            old.capacity_parcels === capacity &&
            old.latest_finish_at === finish &&
            JSON.stringify([...old.region_ids].sort()) ===
              JSON.stringify([...regions].sort())));
      if (unchanged) return old;
      await c.query(
        "INSERT INTO abasong.availability(user_id,enabled,starts_at,ends_at,capacity_parcels,latest_finish_at,version) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET enabled=$2,starts_at=$3,ends_at=$4,capacity_parcels=$5,latest_finish_at=$6,version=$7,updated_at=now()",
        [
          a.userId,
          p.enabled,
          start,
          end,
          capacity,
          finish,
          (old?.version ?? 0) + 1,
        ],
      );
      if (p.enabled) {
        await c.query(
          "DELETE FROM abasong.availability_regions WHERE user_id=$1",
          [a.userId],
        );
        await c.query(
          "INSERT INTO abasong.availability_regions(user_id,region_id) SELECT $1,unnest($2::uuid[])",
          [a.userId, regions],
        );
      }
      await c.query(
        "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'availability.updated','user',$1,'success')",
        [a.userId],
      );
      return (await this.availability(c, a.userId))!;
    });
  }
  private async drivers(
    c: PoolClient,
    a: VerifiedIdentity,
    ids: string[],
  ): Promise<S["Driver"][]> {
    if (!ids.length) return [];
    const rows = (
      await c.query(
        `SELECT p.*,av.version AS av_version,av.enabled,av.starts_at,av.ends_at,av.capacity_parcels,av.latest_finish_at FROM abasong.profiles p JOIN abasong.users u ON u.id=p.user_id AND u.status='active' LEFT JOIN abasong.availability av ON av.user_id=p.user_id WHERE p.user_id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=$2))`,
        [ids, a.userId],
      )
    ).rows;
    const places = (
      await c.query(
        `SELECT ar.user_id,r.id,r.label,r.timezone,extensions.ST_X(r.display_point::extensions.geometry) AS lng,extensions.ST_Y(r.display_point::extensions.geometry) AS lat FROM abasong.availability_regions ar JOIN abasong.regions r ON r.id=ar.region_id AND r.display_point IS NOT NULL WHERE ar.user_id=ANY($1::uuid[]) ORDER BY r.id`,
        [ids],
      )
    ).rows;
    const now = Date.now();
    return ids.flatMap((id) => {
      const r = rows.find((x) => x.user_id === id);
      if (!r) return [];
      const regions = places
        .filter((x) => x.user_id === id)
        .map((x) => ({
          id: x.id,
          label: x.label,
          timezone: x.timezone,
          display_point: { lng: x.lng, lat: x.lat },
        }));
      const visible =
        r.enabled &&
        r.ends_at &&
        r.ends_at.getTime() > now &&
        regions.length > 0;
      return [
        {
          profile: {
            user_id: id,
            display_name: r.display_name,
            bio: r.bio,
            vehicle_type: r.vehicle_type,
            experience: (Array.isArray(r.experience) ? r.experience : [])
              .slice(0, 20)
              .map((x: Record<string, unknown>) => ({
                carrier: String(x.carrier ?? "").slice(0, 80),
                region_label: String(x.region_label ?? "").slice(0, 120),
                description: String(x.description ?? "").slice(0, 300),
                source: "self_reported" as const,
              })),
          },
          availability: visible
            ? {
                user_id: id,
                version: r.av_version,
                enabled: true,
                currently_available: r.starts_at.getTime() <= now,
                starts_at: r.starts_at.toISOString(),
                ends_at: r.ends_at.toISOString(),
                region_ids: regions.map((x) => x.id),
                capacity_parcels: r.capacity_parcels,
                latest_finish_at: r.latest_finish_at?.toISOString() ?? null,
              }
            : null,
          regions: visible ? regions : [],
        },
      ];
    });
  }
  get(a: VerifiedIdentity, id: unknown) {
    const uid = requestId(id);
    return this.requests.tx(a, async (c) => {
      const d = (await this.drivers(c, a, [uid]))[0];
      if (!d) throw new ApiError(404, "NOT_FOUND", "司机资料不存在或不可见");
      return d;
    });
  }
  list(a: VerifiedIdentity, query: unknown): Promise<S["DriverPage"]> {
    const q = checked(driverPageInput, query);
    return this.requests.tx(a, async (c) => {
      const rows = (
        await c.query(
          `SELECT av.user_id FROM abasong.availability av JOIN abasong.users u ON u.id=av.user_id AND u.status='active' JOIN abasong.profiles p ON p.user_id=u.id WHERE av.enabled AND av.ends_at>now() AND EXISTS(SELECT 1 FROM abasong.availability_regions ar JOIN abasong.regions r ON r.id=ar.region_id AND r.display_point IS NOT NULL WHERE ar.user_id=av.user_id) AND av.user_id<>$1 AND ($2::uuid IS NULL OR av.user_id>$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM abasong.availability_regions ar JOIN abasong.regions r ON r.id=ar.region_id WHERE ar.user_id=av.user_id AND ar.region_id=$3 AND r.display_point IS NOT NULL)) AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.experience) x WHERE strpos(lower(x->>'carrier'),lower($4))>0)) AND ($5::date IS NULL OR (av.starts_at<(($5::date+1)::timestamp AT TIME ZONE 'America/Los_Angeles') AND av.ends_at>($5::date::timestamp AT TIME ZONE 'America/Los_Angeles'))) AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=av.user_id) OR (b.blocker_id=av.user_id AND b.blocked_id=$1)) ORDER BY av.user_id LIMIT $6`,
          [
            a.userId,
            q.cursor ?? null,
            q.region_id ?? null,
            q.carrier ?? null,
            q.day ?? null,
            q.limit + 1,
          ],
        )
      ).rows;
      return {
        items: await this.drivers(
          c,
          a,
          rows.slice(0, q.limit).map((r) => r.user_id),
        ),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1]!.user_id : null,
      };
    });
  }
}
