import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { safeRequestSnapshot } from "./request-events";
export async function conversationRow(
  c: PoolClient,
  a: VerifiedIdentity,
  id: string,
  lock = false,
) {
  const r = (
    await c.query(
      `SELECT * FROM abasong.conversations WHERE id=$1 AND $2 IN (pair_low,pair_high) ${lock ? "FOR UPDATE" : ""}`,
      [id, a.userId],
    )
  ).rows[0];
  if (!r) throw new ApiError(404, "NOT_FOUND", "会话不存在或不可见");
  return r;
}
export async function conversationView(
  c: PoolClient,
  a: VerifiedIdentity,
  id: string,
): Promise<components["schemas"]["Conversation"]> {
  const r = await conversationRow(c, a, id),
    peer = r.pair_low === a.userId ? r.pair_high : r.pair_low;
  const profile = (
    await c.query(
      "SELECT p.*,u.status FROM abasong.profiles p JOIN abasong.users u ON u.id=p.user_id WHERE p.user_id=$1",
      [peer],
    )
  ).rows[0];
  const isBlocked = !!(
    await c.query(
      "SELECT 1 FROM abasong.blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
      [a.userId, peer],
    )
  ).rowCount;
  const stats = (
    await c.query(
      `SELECT count(*) FILTER(WHERE m.sender_id<>$2 AND m.sequence>COALESCE(cr.last_read_sequence,0)) AS unread_count,COALESCE(max(m.sequence),0) AS last_sequence,max(m.created_at) AS updated_at FROM abasong.messages m LEFT JOIN abasong.conversation_reads cr ON cr.conversation_id=m.conversation_id AND cr.user_id=$2 WHERE m.conversation_id=$1 AND m.removed_at IS NULL`,
      [id, a.userId],
    )
  ).rows[0];
  const reads = (
    await c.query(
      "SELECT user_id,last_read_sequence FROM abasong.conversation_reads WHERE conversation_id=$1",
      [id],
    )
  ).rows;
  const source = (
    await c.query(
      `SELECT v.snapshot,g.label AS region_label FROM abasong.messages m JOIN abasong.request_versions v ON v.request_id=m.source_request_id AND v.version=m.source_request_version LEFT JOIN abasong.regions g ON g.id::text=v.snapshot->>'region_id' JOIN abasong.requests q ON q.id=v.request_id JOIN abasong.users u ON u.id=q.publisher_id WHERE m.conversation_id=$1 AND m.kind='request_card' AND m.removed_at IS NULL AND q.discarded_at IS NULL AND q.status<>'draft' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=q.publisher_id) OR (b.blocker_id=q.publisher_id AND b.blocked_id=$2)) ORDER BY m.sequence DESC LIMIT 1`,
      [id, a.userId],
    )
  ).rows[0];
  return {
    id,
    other_profile: {
      user_id: peer,
      display_name:
        profile?.status === "active" ? profile.display_name : "司机",
      bio: null,
      vehicle_type: null,
      experience: [],
    },
    unread_count: Number(stats.unread_count),
    last_sequence: Number(stats.last_sequence),
    my_last_read_sequence: Number(
      reads.find((x) => x.user_id === a.userId)?.last_read_sequence ?? 0,
    ),
    other_last_read_sequence: Number(
      reads.find((x) => x.user_id === peer)?.last_read_sequence ?? 0,
    ),
    can_send: !isBlocked && profile?.status === "active",
    last_request_region_label: source?.region_label ?? null,
    last_request_snapshot: source ? safeRequestSnapshot(source.snapshot) : null,
    updated_at: (stats.updated_at ?? r.created_at).toISOString(),
  };
}
