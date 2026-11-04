import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import { ApiError } from "../common/api-error";
export async function enqueueCollaboration(
  c: PoolClient,
  eventKey: string,
  eventType:
    | "request_updated"
    | "application_received"
    | "application_withdrawn"
    | "application_contacted"
    | "request_source_added",
  objectId: string,
  actor: string,
  payload: { request_id?: string; version?: number; conversation_id?: string },
) {
  await c.query(
    "INSERT INTO abasong.outbox(event_key,event_type,object_id,actor_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING",
    [eventKey, eventType, objectId, actor, payload],
  );
}
export function safeRequestSnapshot(
  value: Record<string, unknown>,
): components["schemas"]["RequestVersion"] {
  const fields = [
    "request_id",
    "version",
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
  return Object.fromEntries(
    fields.map((k) => [k, value[k] ?? null]),
  ) as components["schemas"]["RequestVersion"];
}
export async function publicProfile(
  c: PoolClient,
  userId: string,
): Promise<components["schemas"]["Profile"]> {
  const p = (
    await c.query(
      "SELECT p.user_id,p.display_name,p.bio,p.vehicle_type,p.experience FROM abasong.profiles p JOIN abasong.users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.status='active'",
      [userId],
    )
  ).rows[0];
  if (!p) throw new ApiError(404, "NOT_FOUND", "用户当前不可见");
  return {
    user_id: p.user_id,
    display_name: p.display_name,
    bio: p.bio,
    vehicle_type: p.vehicle_type,
    experience: p.experience.map((e: Record<string, unknown>) => ({
      carrier: e.carrier,
      region_label: e.region_label,
      description: e.description,
      source: "self_reported",
    })),
  };
}
export async function blocked(c: PoolClient, a: string, b: string) {
  return !!(
    await c.query(
      "SELECT 1 FROM abasong.blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
      [a, b],
    )
  ).rowCount;
}
export async function ensureConversation(c: PoolClient, a: string, b: string) {
  if (a === b) throw new ApiError(400, "INVALID_INPUT", "不能联系自己");
  await publicProfile(c, b);
  if (await blocked(c, a, b))
    throw new ApiError(404, "NOT_FOUND", "当前无法联系此用户");
  const [low, high] = [a, b].sort();
  await c.query(
    "INSERT INTO abasong.conversations(pair_low,pair_high) VALUES($1,$2) ON CONFLICT(pair_low,pair_high) DO NOTHING",
    [low, high],
  );
  return (
    await c.query(
      "SELECT id,pair_low,pair_high,created_at FROM abasong.conversations WHERE pair_low=$1 AND pair_high=$2 FOR UPDATE",
      [low, high],
    )
  ).rows[0];
}
export async function attachRequestSource(
  c: PoolClient,
  conversationId: string,
  requestId: string,
  version: number,
  actor: string,
) {
  // The conversation row is locked by callers; one immutable card per source version.
  const added = await c.query(
    "INSERT INTO abasong.conversation_sources(conversation_id,request_id,request_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING conversation_id",
    [conversationId, requestId, version],
  );
  if (added.rowCount) {
    const message = await c.query(
      "INSERT INTO abasong.messages(conversation_id,sender_id,client_message_id,kind,source_request_id,source_request_version) VALUES($1,$2,$3,'request_card',$4,$5) RETURNING id",
      [conversationId, actor, randomUUID(), requestId, version],
    );
    await enqueueCollaboration(
      c,
      `message:${message.rows[0].id}`,
      "request_source_added",
      message.rows[0].id,
      actor,
      { request_id: requestId, version, conversation_id: conversationId },
    );
  }
}
export async function notifyRequestChange(
  c: PoolClient,
  requestId: string,
  version: number,
  owner: string,
) {
  await enqueueCollaboration(
    c,
    `request:${requestId}:version:${version}`,
    "request_updated",
    requestId,
    owner,
    { version },
  );
  const recipients = (
    await c.query(
      "SELECT a.applicant_id,c.id AS conversation_id FROM abasong.applications a JOIN abasong.users u ON u.id=a.applicant_id JOIN abasong.conversations c ON c.pair_low=LEAST($2::uuid,a.applicant_id) AND c.pair_high=GREATEST($2::uuid,a.applicant_id) WHERE a.request_id=$1 AND a.status='applied' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=a.applicant_id) OR (b.blocker_id=a.applicant_id AND b.blocked_id=$2)) ORDER BY c.id",
      [requestId, owner],
    )
  ).rows;
  for (const r of recipients) {
    await c.query(
      "SELECT id FROM abasong.conversations WHERE id=$1 FOR UPDATE",
      [r.conversation_id],
    );
    await attachRequestSource(c, r.conversation_id, requestId, version, owner);
    await c.query(
      "INSERT INTO abasong.notifications(user_id,event_key,kind,object_type,object_id) VALUES($1,$2,'request_updated','request',$3) ON CONFLICT DO NOTHING",
      [r.applicant_id, `request:${requestId}:version:${version}`, requestId],
    );
  }
}
