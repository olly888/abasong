import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  PushFailure,
  type PushData,
  type PushProvider,
} from "./push-provider.js";
type Event = {
  id: string;
  event_key: string;
  event_type: string;
  object_id: string;
  actor_id: string;
  payload: Record<string, unknown>;
  lease_token: string;
  created_at: Date;
};
type Target = {
  user_id: string;
  kind: PushData["kind"];
  object_id: string;
  category: "chat_push" | "request_push" | "system_push";
};
const eventTypes = [
  "message_created",
  "circle_reply",
  "request_updated",
  "application_received",
  "application_withdrawn",
  "application_contacted",
  "request_source_added",
];
export class PushDispatcher {
  constructor(
    private readonly pool: Pool,
    private readonly provider: PushProvider,
  ) {}
  private async tx<T>(fn: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async targets(c: PoolClient, e: Event): Promise<Target[]> {
    if (e.created_at.getTime() < Date.now() - 86400000) return [];
    if (e.event_type === "request_source_added") return []; // version events already notify; no duplicate source-card push
    if (e.event_type === "message_created") {
      const cid = e.payload.conversation_id;
      if (typeof cid !== "string") return [];
      const rows = (
        await c.query(
          `SELECT CASE WHEN c.pair_low=$2 THEN c.pair_high ELSE c.pair_low END AS user_id FROM abasong.conversations c JOIN abasong.users sender ON sender.id=$2 AND sender.status='active' JOIN abasong.users peer ON peer.id=CASE WHEN c.pair_low=$2 THEN c.pair_high ELSE c.pair_low END AND peer.status='active' WHERE c.id=$1 AND $2 IN(c.pair_low,c.pair_high) AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=c.pair_low AND b.blocked_id=c.pair_high) OR (b.blocker_id=c.pair_high AND b.blocked_id=c.pair_low)) AND EXISTS(SELECT 1 FROM abasong.messages m LEFT JOIN abasong.conversation_reads cr ON cr.conversation_id=c.id AND cr.user_id=peer.id WHERE m.id=$3 AND m.conversation_id=c.id AND m.removed_at IS NULL AND m.sequence>COALESCE(cr.last_read_sequence,0))`,
          [cid, e.actor_id, e.object_id],
        )
      ).rows;
      return rows.map((r) => ({
        user_id: r.user_id,
        kind: "conversation",
        object_id: cid,
        category: "chat_push",
      }));
    }
    if (e.event_type === "circle_reply") {
      const rows = (
        await c.query<{ user_id: string; object_id: string }>(
          `SELECT n.user_id,n.object_id FROM abasong.notifications n
         WHERE n.event_key=$1 AND n.object_type='post' AND n.kind='circle_reply' AND n.object_id=$2
         AND n.read_at IS NULL AND abasong.circle_reply_visible(n.object_id,n.circle_comment_id,n.user_id)`,
          [e.event_key, e.object_id],
        )
      ).rows;
      return rows.map((row) => ({
        ...row,
        kind: "post",
        category: "system_push",
      }));
    }
    const rows = (
      await c.query(
        `SELECT DISTINCT n.user_id,n.object_id FROM abasong.notifications n JOIN abasong.users u ON u.id=n.user_id AND u.status='active' JOIN abasong.requests r ON r.id=n.object_id AND r.discarded_at IS NULL AND r.status<>'draft' WHERE n.event_key=$1 AND n.object_type='request' AND n.read_at IS NULL AND n.user_id<>$2 AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=n.user_id) OR (b.blocker_id=n.user_id AND b.blocked_id=$2)) LIMIT 1000`,
        [e.event_key, e.actor_id],
      )
    ).rows;
    return rows.map((r) => ({
      user_id: r.user_id,
      object_id: r.object_id,
      kind: "request",
      category: "request_push",
    }));
  }
  private async expand() {
    await this.tx(async (c) => {
      const rows = (
        await c.query(
          `UPDATE abasong.outbox o SET status='processing',lease_until=now()+interval '60 seconds',lease_token=$2,attempts=attempts+1 FROM (SELECT id FROM abasong.outbox WHERE event_type=ANY($1) AND available_at<=now() AND (status='pending' OR (status='processing' AND lease_until<now())) ORDER BY created_at,id LIMIT 5 FOR UPDATE SKIP LOCKED) q WHERE o.id=q.id RETURNING o.*`,
          [eventTypes, randomUUID()],
        )
      ).rows as Event[];
      for (const e of rows) {
        for (const t of await this.targets(c, e)) {
          const pref = (
            await c.query(
              "SELECT * FROM abasong.notification_preferences WHERE user_id=$1",
              [t.user_id],
            )
          ).rows[0];
          if (pref && pref[t.category] === false) continue;
          await c.query(
            "INSERT INTO abasong.push_deliveries(outbox_id,device_id,target_user_id,binding_version) SELECT $1,id,$2,binding_version FROM abasong.devices WHERE user_id=$2 AND enabled AND lease_until>now() AND push_token IS NOT NULL LIMIT 10 ON CONFLICT(outbox_id,device_id) DO NOTHING",
            [e.id, t.user_id],
          );
        }
        await c.query(
          "UPDATE abasong.outbox SET status='done',completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2",
          [e.id, e.lease_token],
        );
      }
    });
  }
  private async deliver(receipt: boolean) {
    return this.tx(async (c) => {
      const job = (
        await c.query(
          `SELECT * FROM abasong.push_deliveries WHERE status=$1 AND available_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [receipt ? "accepted" : "pending"],
        )
      ).rows[0];
      if (!job) return false;
      const token = randomUUID();
      await c.query(
        "UPDATE abasong.push_deliveries SET lease_until=now()+interval '60 seconds',lease_token=$2 WHERE id=$1",
        [job.id, token],
      );
      const e = (
        await c.query("SELECT * FROM abasong.outbox WHERE id=$1", [
          job.outbox_id,
        ])
      ).rows[0] as Event;
      const target = (await this.targets(c, e)).find(
        (t) => t.user_id === job.target_user_id,
      );
      const d = (
        await c.query("SELECT * FROM abasong.devices WHERE id=$1 FOR SHARE", [
          job.device_id,
        ])
      ).rows[0];
      const pref = target
        ? (
            await c.query(
              "SELECT * FROM abasong.notification_preferences WHERE user_id=$1",
              [target.user_id],
            )
          ).rows[0]
        : null;
      if (
        !target ||
        !d?.enabled ||
        d.user_id !== job.target_user_id ||
        d.binding_version !== job.binding_version ||
        !d.lease_until ||
        d.lease_until.getTime() <= Date.now() ||
        pref?.[target.category] === false
      ) {
        await c.query(
          "UPDATE abasong.push_deliveries SET status='dead',error_code='NoLongerEligible',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",
          [job.id, token],
        );
        return true;
      }
      try {
        if (receipt) {
          const result = await this.provider.receipt(job.ticket_id);
          if (result === "ok")
            await c.query(
              "UPDATE abasong.push_deliveries SET status='provider_delivered',receipt_checked_at=now(),error_code=NULL,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",
              [job.id, token],
            );
          else
            await c.query(
              "UPDATE abasong.push_deliveries SET status=CASE WHEN accepted_at<now()-interval '23 hours' THEN 'dead' ELSE 'accepted' END,available_at=now()+interval '5 minutes',receipt_checked_at=now(),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",
              [job.id, token],
            );
        } else {
          const ticket = await this.provider.send(d.push_token, {
            title: "Abasong",
            body:
              e.event_type === "message_created"
                ? "你有一条新消息"
                : e.event_type === "circle_reply"
                  ? "你的司机圈动态有新回复"
                  : "临时支援有更新",
            data: {
              version: 1,
              owner_id: target.user_id,
              kind: target.kind,
              object_id: target.object_id,
            },
          });
          await c.query(
            "UPDATE abasong.push_deliveries SET status='accepted',ticket_id=$3,accepted_at=now(),available_at=now()+interval '15 minutes',attempts=attempts+1,error_code=NULL,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",
            [job.id, token, ticket],
          );
        }
      } catch (err) {
        const e =
            err instanceof PushFailure
              ? err
              : new PushFailure("ProviderError", true),
          n = job.attempts + 1;
        if (e.code === "DeviceNotRegistered")
          await c.query(
            "UPDATE abasong.devices SET enabled=false,push_token=NULL,binding_version=binding_version+1,updated_at=now() WHERE id=$1 AND binding_version=$2",
            [d.id, job.binding_version],
          );
        await c.query(
          "UPDATE abasong.push_deliveries SET status=$3,error_code=$4,attempts=$5,available_at=now()+$6*interval '1 second',receipt_checked_at=CASE WHEN $7 THEN now() ELSE receipt_checked_at END,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",
          [
            job.id,
            token,
            e.retryable && n < 5 ? (receipt ? "accepted" : "pending") : "dead",
            e.code,
            n,
            Math.min(3600, 15 * 2 ** n),
            receipt,
          ],
        );
      }
      return true;
    });
  }
  async tick() {
    const started = Date.now();
    await this.expand();
    for (let i = 0; i < 5 && Date.now() - started < 16000; i++)
      if (!(await this.deliver(false))) break;
    if (Date.now() - started < 16000) await this.deliver(true);
  }
}
