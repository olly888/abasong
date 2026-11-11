import { Inject, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { components } from "@abasong/contracts";
import { ApiError } from "../common/api-error";
import { writeIdempotently } from "../common/idempotency";
import type { VerifiedIdentity } from "../common/request-context";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import { inboxCursor } from "../requests/messaging-input";
import { requestId } from "../requests/request-input";
import { RequestsService } from "../requests/requests.service";

import { attachCircleMedia } from "./circle-media";
import { notBlocked, postAuthor, visiblePost } from "./circle-visibility";

type S = components["schemas"];
const topic = z.enum(["delivery_question", "experience", "on_the_road"]);
const textInput = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) =>
      Array.from(value).every((character) => {
        const code = character.charCodeAt(0);
        return (
          code === 9 ||
          code === 10 ||
          code === 13 ||
          (code >= 32 && code !== 127)
        );
      }),
    );
const postInput = z
  .object({
    body: textInput(2000),
    request_id: z.uuid().optional(),
    region_id: z.uuid().optional(),
    topic: topic.optional(),
    media_ids: z
      .array(z.uuid())
      .max(3)
      .refine(
        (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
      )
      .optional(),
  })
  .strict();
const commentInput = z.object({ body: textInput(1000) }).strict();
const reportInput = z
  .object({
    object_type: z.enum(["post", "comment"]),
    object_id: z.uuid(),
    reason: textInput(1000),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "INVALID_INPUT", "请检查填写内容");
  return result.data;
}
function rejectAccessCode(body: string) {
  // Catch explicitly labeled codes. Do not reject ordinary addresses or parcel counts.
  if (
    /(?:门禁码|门禁密码|(?:门禁|大门|进门|公寓|行人门|侧门).{0,8}(?:密码|门禁码|门码)|gate\s*code|access\s*code)\s*[:：是=]?\s*[#*\d０-９＃＊]{4,}/iu.test(
      body,
    )
  )
    throw new ApiError(
      422,
      "ACCESS_CODE_NOT_ALLOWED",
      "门禁码请通过贡献入口共享",
    );
}
const unavailable = () =>
  new ApiError(404, "NOT_FOUND", "内容已删除或不可查看");

const commentAuthor = `JOIN abasong.users cu ON cu.id=c.author_id AND cu.status='active'
  JOIN abasong.profiles cp ON cp.user_id=c.author_id`;
const visibleComment = `c.status='visible' AND ${notBlocked("c.author_id")}`;
const postSelect = `SELECT p.id,p.body,p.topic,p.created_at,
  to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at,
  jsonb_build_object('user_id',p.author_id,'display_name',pp.display_name) author,
  CASE WHEN g.id IS NOT NULL THEN jsonb_build_object('id',g.id,'label',g.label) END region,
  p.request_id IS NOT NULL AS has_request,
  CASE WHEN r.id IS NOT NULL THEN jsonb_build_object(
    'id',r.id,'kind',r.kind,'status',CASE WHEN r.status='open' AND r.expires_at<=now() THEN 'expired' ELSE r.status END,
    'scenario',r.scenario,'region_label',rg.label,'pickup_region_label',pg.label,
    'price_unit',r.price_unit,'price_cents',r.price_cents,'starts_at',r.starts_at,
    'handoff_date',r.handoff_date,'handoff_mode',r.handoff_mode,'quantity_mode',r.quantity_mode,
    'parcel_count',r.parcel_count,'drivers_needed',r.drivers_needed,
    'remaining_parcels',r.remaining_parcels,'remaining_drivers',r.remaining_drivers
  ) END request,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'width',m.width,'height',m.height)
    ORDER BY m.position) FROM abasong.circle_media m WHERE m.post_id=p.id),'[]'::jsonb) media,
  (SELECT count(*)::int FROM abasong.comments c ${commentAuthor}
    WHERE c.post_id=p.id AND ${visibleComment}) reply_count
  FROM abasong.posts p ${postAuthor}
  LEFT JOIN abasong.regions g ON g.id=p.region_id
  LEFT JOIN abasong.requests r ON r.id=p.request_id AND r.publisher_id=p.author_id
    AND r.status<>'draft' AND r.discarded_at IS NULL
  LEFT JOIN abasong.regions rg ON rg.id=r.region_id
  LEFT JOIN abasong.regions pg ON pg.id=r.pickup_region_id`;
const commentSelect = `SELECT c.id,c.post_id,c.body,c.created_at,
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at,
  jsonb_build_object('user_id',c.author_id,'display_name',cp.display_name) author
  FROM abasong.comments c ${commentAuthor}
  JOIN abasong.posts p ON p.id=c.post_id ${postAuthor}`;

type Timed<T> = Omit<T, "created_at"> & {
  id: string;
  created_at: Date;
  cursor_at: string;
};
function view<T extends { id: string; created_at: string }>(r: Timed<T>) {
  const { cursor_at, created_at, ...row } = r;
  void cursor_at;
  return { ...row, created_at: created_at.toISOString() };
}
function page<T extends { id: string; created_at: string }>(
  rows: Timed<T>[],
  limit: number,
) {
  const last = rows[limit - 1];
  return {
    items: rows.slice(0, limit).map(view<T>),
    next_cursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ at: last.cursor_at, id: last.id }),
          ).toString("base64url")
        : null,
  };
}

@Injectable()
export class CircleService {
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  private get intentKey() {
    return this.crypto.hmacKey("circle-text");
  }
  private async post(c: PoolClient, actor: VerifiedIdentity, id: string) {
    const row = (
      await c.query<Timed<S["Post"]>>(
        `${postSelect} WHERE p.id=$2 AND ${visiblePost}`,
        [actor.userId, id],
      )
    ).rows[0];
    if (!row) throw unavailable();
    return view<S["Post"]>(row);
  }
  private async comment(c: PoolClient, actor: VerifiedIdentity, id: string) {
    const row = (
      await c.query<Timed<S["Comment"]>>(
        `${commentSelect} WHERE c.id=$2 AND ${visiblePost} AND ${visibleComment}`,
        [actor.userId, id],
      )
    ).rows[0];
    if (!row) throw unavailable();
    return view<S["Comment"]>(row);
  }
  private async requirePost(
    c: PoolClient,
    actor: VerifiedIdentity,
    id: string,
    lock = false,
  ) {
    const row = (
      await c.query<{ author_id: string }>(
        `SELECT p.author_id FROM abasong.posts p ${postAuthor}
        WHERE p.id=$2 AND ${visiblePost} ${lock ? "FOR UPDATE OF p" : ""}`,
        [actor.userId, id],
      )
    ).rows[0];
    if (!row) throw unavailable();
    return row;
  }
  async posts(
    actor: VerifiedIdentity,
    query: unknown,
    mine: boolean,
  ): Promise<S["PostPage"]> {
    const q = inboxCursor(query);
    return this.requests.tx(actor, async (c) =>
      page<S["Post"]>(
        (
          await c.query<Timed<S["Post"]>>(
            `${postSelect} WHERE ${visiblePost} ${mine ? "AND p.author_id=$1" : ""}
        AND ($2::timestamptz IS NULL OR (p.created_at,p.id)<($2::timestamptz,$3::uuid))
        ORDER BY p.created_at DESC,p.id DESC LIMIT $4`,
            [
              actor.userId,
              q.after?.at ?? null,
              q.after?.id ?? null,
              q.limit + 1,
            ],
          )
        ).rows,
        q.limit,
      ),
    );
  }
  get(actor: VerifiedIdentity, id: unknown) {
    return this.requests.tx(actor, (c) => this.post(c, actor, requestId(id)));
  }
  async create(actor: VerifiedIdentity, body: unknown, key: unknown) {
    const input = parse(postInput, body);
    rejectAccessCode(input.body);
    return this.requests.tx(actor, (c) =>
      writeIdempotently(
        this.intentKey,
        c,
        actor,
        "circle.post",
        key,
        input,
        async () => {
          if (input.request_id) {
            const request = await this.requests.row(
              c,
              actor,
              input.request_id,
              true,
              true,
            );
            if (request.status === "draft")
              throw new ApiError(
                422,
                "CIRCLE_REQUEST_UNAVAILABLE",
                "请选择本人已发布的需求",
              );
          }
          if (
            input.region_id &&
            !(
              await c.query(
                "SELECT 1 FROM abasong.regions WHERE id=$1 AND timezone='America/Los_Angeles'",
                [input.region_id],
              )
            ).rowCount
          )
            throw new ApiError(400, "INVALID_REGION", "请选择可用的配送区域");
          const { id } = (
            await c.query<{ id: string }>(
              `INSERT INTO abasong.posts(author_id,body,topic,region_id,request_id)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
              [
                actor.userId,
                input.body,
                input.topic ?? null,
                input.region_id ?? null,
                input.request_id ?? null,
              ],
            )
          ).rows[0]!;
          await attachCircleMedia(c, actor.userId, id, input.media_ids ?? []);
          return { id, value: await this.post(c, actor, id) };
        },
        (id) => this.post(c, actor, id),
      ),
    );
  }
  async comments(
    actor: VerifiedIdentity,
    rawId: unknown,
    query: unknown,
  ): Promise<S["CommentPage"]> {
    const id = requestId(rawId),
      q = inboxCursor(query);
    return this.requests.tx(actor, async (c) => {
      await this.requirePost(c, actor, id);
      return page<S["Comment"]>(
        (
          await c.query<Timed<S["Comment"]>>(
            `${commentSelect} WHERE p.id=$2 AND ${visiblePost} AND ${visibleComment}
          AND ($3::timestamptz IS NULL OR (c.created_at,c.id)<($3::timestamptz,$4::uuid))
          ORDER BY c.created_at DESC,c.id DESC LIMIT $5`,
            [
              actor.userId,
              id,
              q.after?.at ?? null,
              q.after?.id ?? null,
              q.limit + 1,
            ],
          )
        ).rows,
        q.limit,
      );
    });
  }
  async reply(
    actor: VerifiedIdentity,
    rawId: unknown,
    body: unknown,
    key: unknown,
  ) {
    const postId = requestId(rawId),
      input = parse(commentInput, body);
    rejectAccessCode(input.body);
    return this.requests.tx(actor, (c) =>
      writeIdempotently(
        this.intentKey,
        c,
        actor,
        `circle.reply:${postId}`,
        key,
        input,
        async () => {
          const post = await this.requirePost(c, actor, postId, true);
          const { id } = (
            await c.query<{ id: string }>(
              "INSERT INTO abasong.comments(post_id,author_id,body) VALUES($1,$2,$3) RETURNING id",
              [postId, actor.userId, input.body],
            )
          ).rows[0]!;
          if (post.author_id !== actor.userId) {
            const event = `circle-reply:${id}`;
            const notice = await c.query(
              `INSERT INTO abasong.notifications(user_id,event_key,kind,object_type,object_id,circle_comment_id)
              SELECT $1,$2,'circle_reply','post',$3,$4
              WHERE abasong.circle_reply_visible($3,$4,$1)
              ON CONFLICT DO NOTHING`,
              [post.author_id, event, postId, id],
            );
            if (notice.rowCount)
              await c.query(
                `INSERT INTO abasong.outbox(event_key,event_type,object_id,actor_id,payload)
               VALUES($1,'circle_reply',$2,$3,jsonb_build_object('comment_id',$4::uuid)) ON CONFLICT DO NOTHING`,
                [event, postId, actor.userId, id],
              );
          }
          return { id, value: await this.comment(c, actor, id) };
        },
        (id) => this.comment(c, actor, id),
      ),
    );
  }
  remove(actor: VerifiedIdentity, rawId: unknown, type: "post" | "comment") {
    const id = requestId(rawId);
    return this.requests.tx(actor, async (c) => {
      const table = type === "post" ? "posts" : "comments";
      const result = await c.query(
        `UPDATE abasong.${table} SET status='removed'${type === "post" ? ",updated_at=now()" : ""}
         WHERE id=$1 AND author_id=$2 AND status<>'removed'`,
        [id, actor.userId],
      );
      if (
        !result.rowCount &&
        !(
          await c.query(
            `SELECT 1 FROM abasong.${table} WHERE id=$1 AND author_id=$2 AND status='removed'`,
            [id, actor.userId],
          )
        ).rowCount
      )
        throw unavailable();
      return { ok: true as const };
    });
  }
  report(actor: VerifiedIdentity, body: unknown, key: unknown) {
    const input = parse(reportInput, body);
    rejectAccessCode(input.reason);
    return this.requests.tx(actor, async (c) => {
      const target =
        input.object_type === "post"
          ? await this.post(c, actor, input.object_id)
          : await this.comment(c, actor, input.object_id);
      if (target.author.user_id === actor.userId)
        throw new ApiError(400, "INVALID_INPUT", "不能举报自己的内容");
      return writeIdempotently(
        this.intentKey,
        c,
        actor,
        "circle.report",
        key,
        input,
        async () => {
          const row = (
            await c.query<S["Report"] & { created_at: Date }>(
              `INSERT INTO abasong.reports(reporter_id,object_type,object_id,reason)
             VALUES($1,$2,$3,$4) RETURNING id,object_type,object_id,status,created_at`,
              [actor.userId, input.object_type, input.object_id, input.reason],
            )
          ).rows[0]!;
          return {
            id: row.id,
            value: { ...row, created_at: row.created_at.toISOString() },
          };
        },
        async (id) => {
          const row = (
            await c.query<S["Report"] & { created_at: Date }>(
              `SELECT id,object_type,object_id,status,created_at FROM abasong.reports WHERE id=$1 AND reporter_id=$2`,
              [id, actor.userId],
            )
          ).rows[0];
          if (!row) throw unavailable();
          return { ...row, created_at: row.created_at.toISOString() };
        },
      );
    });
  }
  async blockedUsers(
    actor: VerifiedIdentity,
    query: unknown,
  ): Promise<S["BlockedUserPage"]> {
    const q = inboxCursor(query);
    return this.requests.tx(actor, async (c) => {
      const rows = (
        await c.query<Timed<S["BlockedUser"] & { id: string }>>(
          `SELECT b.blocked_id AS id,b.blocked_id AS user_id,b.created_at,
           to_char(b.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at,
           COALESCE(p.display_name,'不可用账号') display_name
         FROM abasong.blocks b
         LEFT JOIN abasong.users u ON u.id=b.blocked_id AND u.status='active'
         LEFT JOIN abasong.profiles p ON p.user_id=u.id
         WHERE b.blocker_id=$1
           AND ($2::timestamptz IS NULL OR (b.created_at,b.blocked_id)<($2::timestamptz,$3::uuid))
         ORDER BY b.created_at DESC,b.blocked_id DESC LIMIT $4`,
          [actor.userId, q.after?.at ?? null, q.after?.id ?? null, q.limit + 1],
        )
      ).rows;
      const result = page<S["BlockedUser"] & { id: string }>(rows, q.limit);
      return {
        ...result,
        items: result.items.map(({ user_id, display_name, created_at }) => ({
          user_id,
          display_name,
          created_at,
        })),
      };
    });
  }
  block(actor: VerifiedIdentity, rawId: unknown, enabled: boolean) {
    const user = requestId(rawId);
    if (user === actor.userId)
      throw new ApiError(400, "INVALID_INPUT", "不能屏蔽自己");
    return this.requests.tx(actor, async (c) => {
      if (enabled) {
        if (
          !(
            await c.query(
              "SELECT 1 FROM abasong.users WHERE id=$1 AND status='active'",
              [user],
            )
          ).rowCount
        )
          throw unavailable();
        await c.query(
          "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [actor.userId, user],
        );
      } else {
        await c.query(
          "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
          [actor.userId, user],
        );
      }
      return { ok: true as const };
    });
  }
}
