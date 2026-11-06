import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import { SensitiveDatabase } from "../apartments/sensitive-database";
import { RequestsService } from "./requests.service";
import { checked, requestId } from "./request-input";
import { messageQuery } from "./collaboration-input";
import {
  sendInput,
  inboxQuery,
  pageCursor,
  preferenceInput,
} from "./messaging-input";
import { conversationRow, conversationView } from "./conversation-view";
import { safeRequestSnapshot } from "./request-events";
type S = components["schemas"];
const missing = () => new ApiError(404, "NOT_FOUND", "记录不存在或不可见");
const unavailable = () =>
  new ApiError(503, "MESSAGE_UNAVAILABLE", "消息暂时无法读取，请重试");
const conflict = () =>
  new ApiError(409, "IDEMPOTENCY_CONFLICT", "此消息编号已用于其他内容");
@Injectable()
export class MessagingService {
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(SensitiveDatabase) private readonly secrets: SensitiveDatabase,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  // Outer transaction holds the existing active-account/session lock; all message
  // metadata + secret writes commit atomically on ONE inner sensitive connection.
  private tx<T>(a: VerifiedIdentity, fn: (c: PoolClient) => Promise<T>) {
    return this.requests.tx(a, async () => {
      const c = await this.secrets.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('abasong.actor_id',$1,true)", [
          a.userId,
        ]);
        const result = await fn(c);
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    });
  }
  private async message(
    c: PoolClient,
    a: VerifiedIdentity,
    id: string,
  ): Promise<S["Message"]> {
    const r = (
      await c.query(
        `SELECT m.*,s.ciphertext,s.nonce,s.auth_tag,s.encrypted_dek,s.kms_key_id,s.cipher_version FROM abasong.messages m LEFT JOIN abasong.message_secrets s ON s.message_id=m.id WHERE m.id=$1 AND m.removed_at IS NULL`,
        [id],
      )
    ).rows[0];
    if (!r) throw missing();
    await conversationRow(c, a, r.conversation_id);
    let regionLabel: string | null = null;
    let text: string | null = null,
      snapshot: S["Message"]["request_snapshot"] = null;
    if (r.kind === "text") {
      if (
        !r.ciphertext ||
        r.cipher_version !== this.crypto.format ||
        r.kms_key_id !== this.crypto.keyId
      )
        throw unavailable();
      try {
        const data = await this.crypto.open<{ text: string }>(
          {
            format: r.cipher_version,
            keyId: r.kms_key_id,
            body: [
              r.nonce.toString("base64"),
              r.ciphertext.toString("base64"),
              r.auth_tag.toString("base64"),
            ],
            wrapped: JSON.parse(r.encrypted_dek.toString()),
          },
          `message:${r.conversation_id}:${r.id}:${r.sender_id}:1`,
        );
        if (typeof data.text !== "string" || data.text.length > 2000)
          throw unavailable();
        text = data.text;
      } catch {
        throw unavailable();
      }
    } else {
      try {
        await this.requests.row(c, a, r.source_request_id);
        const v = (
          await c.query(
            "SELECT v.snapshot,g.label AS region_label FROM abasong.request_versions v LEFT JOIN abasong.regions g ON g.id::text=v.snapshot->>'region_id' WHERE v.request_id=$1 AND v.version=$2",
            [r.source_request_id, r.source_request_version],
          )
        ).rows[0];
        if (v) {
          snapshot = safeRequestSnapshot(v.snapshot);
          regionLabel = v.region_label ?? null;
        }
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
      }
    }
    return {
      id: r.id,
      client_message_id: r.client_message_id,
      request_region_label: regionLabel,
      conversation_id: r.conversation_id,
      sender_id: r.sender_id,
      sequence: Number(r.sequence),
      kind: r.kind,
      text,
      request_snapshot: snapshot,
      created_at: r.created_at.toISOString(),
    };
  }
  async send(
    a: VerifiedIdentity,
    id: unknown,
    body: unknown,
    key: unknown,
  ): Promise<S["Message"]> {
    const cid = requestId(id),
      p = checked(sendInput, body),
      k = requestId(key),
      ttl = Number(process.env.IDEMPOTENCY_RETENTION_SECONDS);
    if (!Number.isSafeInteger(ttl) || ttl <= 0) throw unavailable();
    const hash = createHmac("sha256", this.crypto.hmacKey("message-intent"))
      .update(JSON.stringify({ conversation_id: cid, ...p }))
      .digest();
    return this.tx(a, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `message-rate:${a.userId}`,
      ]);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `message-header:${a.userId}:${k}`,
      ]);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `message-client:${a.userId}:${p.client_message_id}`,
      ]);
      const pair = await conversationRow(c, a, cid, true),
        peer = pair.pair_low === a.userId ? pair.pair_high : pair.pair_low;
      if (!(await conversationView(c, a, cid)).can_send)
        throw new ApiError(
          403,
          "CONVERSATION_READ_ONLY",
          "当前仅可查看历史消息",
        );
      const route = "message.send",
        old = (
          await c.query(
            "SELECT request_hmac,response_object_id FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at>now()",
            [a.userId, route, k],
          )
        ).rows[0];
      if (old) {
        if (
          old.request_hmac.length !== hash.length ||
          !timingSafeEqual(old.request_hmac, hash)
        )
          throw conflict();
        return this.message(c, a, old.response_object_id);
      }
      const existing = (
        await c.query(
          "SELECT m.*,s.content_hmac FROM abasong.messages m LEFT JOIN abasong.message_secrets s ON s.message_id=m.id WHERE m.sender_id=$1 AND m.client_message_id=$2",
          [a.userId, p.client_message_id],
        )
      ).rows[0];
      let mid = existing?.id;
      if (existing) {
        if (existing.conversation_id !== cid || existing.kind !== p.kind)
          throw conflict();
        if (p.kind === "text") {
          if (
            !existing.content_hmac ||
            existing.content_hmac.length !== hash.length ||
            !timingSafeEqual(existing.content_hmac, hash)
          )
            throw conflict();
        } else if (
          existing.source_request_id !== p.source_request_id ||
          existing.source_request_version !== p.source_request_version
        )
          throw conflict();
      } else {
        const recent = (
          await c.query(
            "SELECT count(*) AS n FROM abasong.messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'",
            [a.userId],
          )
        ).rows[0];
        if (Number(recent.n) >= 60)
          throw new ApiError(429, "RATE_LIMITED", "发送过于频繁，请稍后再试");
        if (p.kind === "request_card") {
          const r = await this.requests.row(c, a, p.source_request_id);
          if (
            ![a.userId, peer].includes(r.publisher_id) ||
            r.status === "draft"
          )
            throw missing();
          if (r.version !== p.source_request_version)
            throw new ApiError(
              409,
              "VERSION_CONFLICT",
              "需求已更新，请重新查看",
            );
          await c.query(
            "INSERT INTO abasong.conversation_sources(conversation_id,request_id,request_version) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [cid, r.id, r.version],
          );
        }
        mid = randomUUID();
        const envelope =
          p.kind === "text"
            ? await this.crypto.seal(
                { text: p.text },
                `message:${cid}:${mid}:${a.userId}:1`,
              )
            : null;
        await c.query(
          "INSERT INTO abasong.messages(id,conversation_id,sender_id,client_message_id,kind,source_request_id,source_request_version) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            mid,
            cid,
            a.userId,
            p.client_message_id,
            p.kind,
            p.kind === "request_card" ? p.source_request_id : null,
            p.kind === "request_card" ? p.source_request_version : null,
          ],
        );
        if (envelope)
          await c.query(
            "INSERT INTO abasong.message_secrets(message_id,ciphertext,nonce,auth_tag,encrypted_dek,kms_key_id,cipher_version,content_hmac) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              mid,
              Buffer.from(envelope.body[1]!, "base64"),
              Buffer.from(envelope.body[0]!, "base64"),
              Buffer.from(envelope.body[2]!, "base64"),
              Buffer.from(JSON.stringify(envelope.wrapped)),
              this.crypto.keyId,
              envelope.format,
              hash,
            ],
          );
        await c.query(
          "INSERT INTO abasong.outbox(event_key,event_type,object_id,actor_id,payload) VALUES($1,'message_created',$2,$3,$4)",
          [`message:${mid}`, mid, a.userId, { conversation_id: cid }],
        );
        await c.query(
          "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,'message.sent','message',$2,'success')",
          [a.userId, mid],
        );
      }
      await c.query(
        "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
        [a.userId, route, k],
      );
      await c.query(
        "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',$5,now()+$6*interval '1 second')",
        [a.userId, route, k, hash, mid, ttl],
      );
      return this.message(c, a, mid);
    });
  }
  async messages(
    a: VerifiedIdentity,
    id: unknown,
    query: unknown,
  ): Promise<S["MessagePage"]> {
    const cid = requestId(id),
      q = checked(messageQuery, query);
    if (q.before_sequence !== undefined && q.after_sequence > 0)
      throw new ApiError(400, "INVALID_INPUT", "读取方向有误");
    const backwards =
      q.cursor?.startsWith("b:") || q.before_sequence !== undefined;
    const boundary = q.cursor
      ? Number(q.cursor.replace(/^b:/, ""))
      : ((backwards ? q.before_sequence : q.after_sequence) ?? 0);
    return this.tx(a, async (c) => {
      await conversationRow(c, a, cid);
      const rows = (
        await c.query(
          `SELECT id,sequence FROM abasong.messages WHERE conversation_id=$1 AND sequence${backwards ? "<" : ">"}$2 AND removed_at IS NULL ORDER BY sequence ${backwards ? "DESC" : "ASC"} LIMIT $3`,
          [cid, boundary, q.limit + 1],
        )
      ).rows;
      const selected = rows.slice(0, q.limit),
        items: S["Message"][] = [];
      if (backwards) selected.reverse();
      for (const row of selected) items.push(await this.message(c, a, row.id));
      return {
        items,
        next_cursor:
          rows.length > q.limit
            ? (backwards ? "b:" : "") + String(rows[q.limit - 1].sequence)
            : null,
      };
    });
  }
  async get(a: VerifiedIdentity, id: unknown) {
    const cid = requestId(id);
    return this.requests.tx(a, (c) => conversationView(c, a, cid));
  }
  private cursor(query: unknown) {
    const q = checked(inboxQuery, query);
    let after: { at: string; id: string } | undefined;
    if (q.cursor) {
      try {
        after = checked(
          pageCursor,
          JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new ApiError(400, "INVALID_INPUT", "列表位置有误");
      }
    }
    return { ...q, after };
  }
  async list(
    a: VerifiedIdentity,
    query: unknown,
  ): Promise<S["ConversationPage"]> {
    const q = this.cursor(query);
    return this.requests.tx(a, async (c) => {
      const rows = (
        await c.query(
          `SELECT c.id,COALESCE(max(m.created_at),c.created_at) AS at FROM abasong.conversations c LEFT JOIN abasong.messages m ON m.conversation_id=c.id AND m.removed_at IS NULL WHERE $1 IN(c.pair_low,c.pair_high) GROUP BY c.id HAVING ($2::timestamptz IS NULL OR (COALESCE(max(m.created_at),c.created_at),c.id)<($2::timestamptz,$3::uuid)) ORDER BY at DESC,c.id DESC LIMIT $4`,
          [a.userId, q.after?.at ?? null, q.after?.id ?? null, q.limit + 1],
        )
      ).rows;
      const selected = rows.slice(0, q.limit),
        items: S["Conversation"][] = [];
      for (const row of selected)
        items.push(await conversationView(c, a, row.id));
      const last = selected.at(-1);
      return {
        items,
        next_cursor:
          rows.length > q.limit
            ? Buffer.from(
                JSON.stringify({ at: last.at.toISOString(), id: last.id }),
              ).toString("base64url")
            : null,
      };
    });
  }
  async summary(a: VerifiedIdentity): Promise<S["InboxSummary"]> {
    return this.requests.tx(a, async (c) => {
      const r = (
        await c.query(
          `SELECT count(DISTINCT m.conversation_id) AS conversations,count(*) AS messages FROM abasong.messages m JOIN abasong.conversations c ON c.id=m.conversation_id LEFT JOIN abasong.conversation_reads r ON r.conversation_id=c.id AND r.user_id=$1 WHERE $1 IN(c.pair_low,c.pair_high) AND m.sender_id<>$1 AND m.removed_at IS NULL AND m.sequence>COALESCE(r.last_read_sequence,0)`,
          [a.userId],
        )
      ).rows[0];
      const n = (
        await c.query(
          "SELECT count(*) AS n FROM abasong.notifications WHERE user_id=$1 AND read_at IS NULL",
          [a.userId],
        )
      ).rows[0];
      return {
        unread_conversations: Number(r.conversations),
        unread_messages: Number(r.messages),
        unread_notifications: Number(n.n),
      };
    });
  }
  async notifications(
    a: VerifiedIdentity,
    query: unknown,
  ): Promise<S["NotificationPage"]> {
    const q = this.cursor(query);
    return this.requests.tx(a, async (c) => {
      const rows = (
          await c.query(
            "SELECT id,kind,object_type,object_id,read_at,created_at FROM abasong.notifications WHERE user_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4",
            [a.userId, q.after?.at ?? null, q.after?.id ?? null, q.limit + 1],
          )
        ).rows,
        selected = rows.slice(0, q.limit),
        last = selected.at(-1);
      return {
        items: selected.map((r) => ({
          ...r,
          read_at: r.read_at?.toISOString() ?? null,
          created_at: r.created_at.toISOString(),
        })),
        next_cursor:
          rows.length > q.limit
            ? Buffer.from(
                JSON.stringify({
                  at: last.created_at.toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      };
    });
  }
  async readNotification(a: VerifiedIdentity, id: unknown) {
    const nid = requestId(id);
    return this.requests.tx(a, async (c) => {
      if (
        !(
          await c.query(
            "UPDATE abasong.notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id",
            [nid, a.userId],
          )
        ).rowCount
      )
        throw missing();
      return { ok: true as const };
    });
  }
  async preferences(
    a: VerifiedIdentity,
    body?: unknown,
  ): Promise<S["Preferences"]> {
    const p = body === undefined ? undefined : checked(preferenceInput, body);
    return this.requests.tx(a, async (c) => {
      if (p)
        await c.query(
          "INSERT INTO abasong.notification_preferences(user_id,chat_push,request_push,system_push) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET chat_push=EXCLUDED.chat_push,request_push=EXCLUDED.request_push,system_push=EXCLUDED.system_push",
          [a.userId, p.chat_push, p.request_push, p.system_push],
        );
      const r = (
        await c.query(
          "SELECT chat_push,request_push,system_push FROM abasong.notification_preferences WHERE user_id=$1",
          [a.userId],
        )
      ).rows[0];
      return r ?? { chat_push: true, request_push: true, system_push: true };
    });
  }
}
