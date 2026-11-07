import type { PoolClient } from "pg";
import type { z } from "zod";
import { addressIdentity, type components } from "@abasong/contracts";
import { ApiError } from "../common/api-error";
import type { MapboxNearbyProvider } from "../nearby/mapbox-nearby.provider";
import {
  calendarDate,
  draftV2Input,
  prepareV2Publication,
} from "./request-v2-input";
import type { RequestRow } from "./requests.service";
type S = components["schemas"];
type Input = z.infer<typeof draftV2Input>;
export const v2Terms = [
  "request_schema_version",
  "scenario",
  "task_scope",
  "quantity_mode",
  "handoff_mode",
  "handoff_date",
  "completion_mode",
  "pickup_kind",
] as const;

export async function pickupRow(c: PoolClient, r: RequestRow) {
  if (!r.pickup_address_version) return null;
  return (
    (
      await c.query(
        `SELECT p.*, CASE WHEN s.persistent_use_approved AND s.verified_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now()) THEN extensions.ST_X(p.point::extensions.geometry) END AS lng,
  CASE WHEN s.persistent_use_approved AND s.verified_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now()) THEN extensions.ST_Y(p.point::extensions.geometry) END AS lat,
  (s.persistent_use_approved AND s.verified_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now())) AS source_valid
  FROM abasong.request_pickup_addresses p LEFT JOIN abasong.data_sources s ON s.id=p.source_id
  WHERE p.request_id=$1 AND p.address_version=$2`,
        [r.id, r.pickup_address_version],
      )
    ).rows[0] ?? null
  );
}
export async function pickupView(
  c: PoolClient,
  r: RequestRow,
): Promise<S["PickupLocationDetailV2"] | null> {
  if (r.pickup_kind === "contact_handoff") return { kind: "contact_handoff" };
  const p = await pickupRow(c, r);
  if (!p) return null;
  return {
    kind: "warehouse",
    address_version: p.address_version,
    name: p.name,
    address_line1: p.address_line1,
    city: p.city,
    state: p.state,
    postal_code: p.postal_code,
    address_confirmed: p.address_confirmed,
    address_source: p.address_source,
    point: p.lng == null || p.lat == null ? null : { lng: p.lng, lat: p.lat },
    point_source:
      p.lng == null || p.lat == null ? "unlocated" : "persistent_source",
  };
}
export async function appendPickup(
  c: PoolClient,
  r: RequestRow,
  p: Input["pickup"],
  maps: MapboxNearbyProvider,
) {
  if (!p || p.kind === "contact_handoff")
    return { pickup_kind: p?.kind ?? null, pickup_address_version: null };
  if (!p.address_source)
    throw new ApiError(422, "ADDRESS_CONFIRMATION_REQUIRED", "请确认地址来源");
  const prior = r.pickup_kind === "warehouse" ? await pickupRow(c, r) : null;
  const requestedSource =
    p.address_source === "mapbox_suggestion"
      ? "provider_permanent"
      : "publisher_entered";
  if (
    prior &&
    prior.address_source === requestedSource &&
    (requestedSource === "publisher_entered" || prior.source_valid) &&
    [
      "name",
      "address_line1",
      "city",
      "state",
      "postal_code",
      "address_confirmed",
    ].every(
      (k) =>
        (prior[k] ?? (k === "address_confirmed" ? false : null)) ===
        ((p as Record<string, unknown>)[k] ??
          (k === "address_confirmed" ? false : null)),
    )
  )
    return {
      pickup_kind: "warehouse",
      pickup_address_version: prior.address_version,
    };
  let source: string | null = null,
    point: S["Point"] | null = null;
  const address = {
    address_line1: p.address_line1 ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    postal_code: p.postal_code ?? null,
  };
  if (p.address_source === "mapbox_suggestion") {
    if (!p.address_confirmed || !addressIdentity(address))
      throw new ApiError(
        422,
        "ADDRESS_CONFIRMATION_REQUIRED",
        "请先核对仓库完整地址",
      );
    const saved = await maps.permanent(address);
    if (addressIdentity(saved.address) !== addressIdentity(address))
      throw new ApiError(
        409,
        "ADDRESS_CONFIRMATION_REQUIRED",
        "请重新核对仓库地址",
      );
    source = (
      await c.query(
        "INSERT INTO abasong.data_sources(source_type,provider,product,license_reference,persistent_use_approved,verified_at) VALUES('provider_permanent','Mapbox','geocoding-v6-permanent','Mapbox Permanent Geocoding; confirmed pickup address',true,now()) RETURNING id",
      )
    ).rows[0].id;
    point = saved.point;
  }
  const version = Number(
    (
      await c.query(
        "SELECT COALESCE(max(address_version),0)+1 AS version FROM abasong.request_pickup_addresses WHERE request_id=$1",
        [r.id],
      )
    ).rows[0].version,
  );
  await c.query(
    `INSERT INTO abasong.request_pickup_addresses(request_id,address_version,name,address_line1,city,state,postal_code,address_confirmed,address_source,source_id,point)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $11::double precision IS NULL THEN NULL ELSE extensions.ST_SetSRID(extensions.ST_MakePoint($11,$12),4326)::extensions.geography END)`,
    [
      r.id,
      version,
      p.name ?? null,
      p.address_line1 ?? null,
      p.city ?? null,
      p.state ?? null,
      p.postal_code || null,
      p.address_confirmed ?? false,
      p.address_source === "mapbox_suggestion"
        ? "provider_permanent"
        : "publisher_entered",
      source,
      point?.lng ?? null,
      point?.lat ?? null,
    ],
  );
  return { pickup_kind: "warehouse", pickup_address_version: version };
}
export async function normalizeV2(
  c: PoolClient,
  r: RequestRow,
  now: number,
  preserveStart = false,
) {
  const p = await pickupRow(c, r);
  if (
    r.pickup_kind === "warehouse" &&
    (!p ||
      p.address_source === "legacy_unclassified" ||
      (p.address_source === "provider_permanent" && !p.source_valid))
  )
    throw new ApiError(
      422,
      "ADDRESS_CONFIRMATION_REQUIRED",
      "请重新核对并确认仓库地址",
    );
  const keys = Object.keys(draftV2Input.shape);
  const input = Object.fromEntries(
    keys
      .filter((k) => r[k] != null)
      .map((k) => [
        k,
        r[k] instanceof Date ? (r[k] as Date).toISOString() : r[k],
      ]),
  );
  // DATE may arrive as a pg Date or text; keep its calendar day without UTC conversion.
  input.handoff_date = calendarDate(r.handoff_date);
  input.starts_at = r.handoff_mode === "asap" ? null : input.starts_at;
  input.pickup =
    r.pickup_kind === "contact_handoff"
      ? { kind: "contact_handoff" }
      : p
        ? {
            kind: "warehouse",
            name: p.name,
            address_line1: p.address_line1,
            city: p.city,
            state: p.state,
            postal_code: p.postal_code,
            address_confirmed: p.address_confirmed,
            address_source:
              p.address_source === "provider_permanent"
                ? "mapbox_suggestion"
                : "publisher_entered",
          }
        : null;
  return prepareV2Publication(
    input,
    now,
    preserveStart && r.starts_at instanceof Date
      ? r.starts_at.toISOString()
      : undefined,
  );
}
export async function publishingIdentity(
  c: PoolClient,
  r: RequestRow,
  teamVersion?: number,
) {
  const p = (
    await c.query(
      "SELECT display_name FROM abasong.profiles WHERE user_id=$1",
      [r.publisher_id],
    )
  ).rows[0];
  if (!p) throw new ApiError(422, "PROFILE_REQUIRED", "请先完善姓名");
  const org = r.organization_id
    ? (
        await c.query(
          `SELECT id,name,contact_user_id,verification_status,profile_version FROM abasong.organizations WHERE id=$1 AND contact_user_id=$2 AND active AND verification_status<>'rejected' FOR SHARE`,
          [r.organization_id, r.publisher_id],
        )
      ).rows[0]
    : null;
  if (r.organization_id && !org)
    throw new ApiError(403, "ORGANIZATION_REQUIRED", "不能代表这个DSP团队发布");
  if (teamVersion !== undefined && org?.profile_version !== teamVersion)
    throw new ApiError(
      409,
      "TEAM_CHANGED",
      "团队资料已更新，请重新核对发布身份",
    );
  if (r.publishing_identity) return r.publishing_identity;
  // Existing already-published legacy rows cannot acquire a fabricated publish-time identity.
  if (r.status !== "draft") return null;
  return {
    publisher_display_name: p.display_name,
    organization: org
      ? {
          id: org.id,
          name: org.name,
          contact_user_id: org.contact_user_id,
          verification_status: org.verification_status,
        }
      : null,
  };
}
