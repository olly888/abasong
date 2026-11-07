import { conversationView as projectConversation } from "./conversation-view";
import { Inject, Injectable } from "@nestjs/common";
import { writeIdempotently } from "../common/idempotency";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import { z } from "zod";
import { ENVELOPE_CRYPTO } from "../encryption/provider";
import type { EnvelopeCrypto } from "../encryption/envelope";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { RequestsService, type RequestView } from "./requests.service";
import { checked, requestId, requestPageInput } from "./request-input";
import {
  applyInput,
  conversationInput,
  readInput,
  validateApplication,
} from "./collaboration-input";
import {
  blocked,
  publicProfile,
  ensureConversation,
  attachRequestSource,
  enqueueCollaboration,
} from "./request-events";
type S = components["schemas"];
type AppRow = {
  id: string;
  request_id: string;
  applicant_id: string;
  status: "applied" | "withdrawn";
  expected_arrival_at: Date;
  capacity_parcels: number | null;
  observed_request_version: number;
  contacted_at: Date | null;
};
const missing = () => new ApiError(404, "NOT_FOUND", "记录不存在或不可见");
@Injectable()
export class CollaborationService {
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(ENVELOPE_CRYPTO) private readonly crypto: EnvelopeCrypto,
  ) {}
  private idem<T>(
    c: PoolClient,
    a: VerifiedIdentity,
    route: string,
    key: unknown,
    body: unknown,
    run: () => Promise<{ id: string; value: T }>,
    replay: (id: string) => Promise<T>,
  ) {
    return writeIdempotently(
      this.crypto.hmacKey("request-collaboration"),
      c,
      a,
      route,
      key,
      body,
      run,
      replay,
    );
  }
  private async app(
    c: PoolClient,
    a: VerifiedIdentity,
    id: string,
    ownerOnly = false,
    lock = false,
  ): Promise<AppRow> {
    const row = (
      await c.query(
        `SELECT a.*,r.publisher_id FROM abasong.applications a JOIN abasong.requests r ON r.id=a.request_id WHERE a.id=$1 AND (a.applicant_id=$2 OR r.publisher_id=$2) ${lock ? "FOR UPDATE OF a" : ""}`,
        [id, a.userId],
      )
    ).rows[0];
    if (!row || (ownerOnly && row.publisher_id !== a.userId)) throw missing();
    return row;
  }
  private async appView(
    c: PoolClient,
    a: VerifiedIdentity,
    row: AppRow,
  ): Promise<S["Application"]> {
    const owner = (
      await c.query("SELECT publisher_id FROM abasong.requests WHERE id=$1", [
        row.request_id,
      ])
    ).rows[0]?.publisher_id;
    const conversation = (
      await c.query(
        "SELECT id FROM abasong.conversations WHERE pair_low=LEAST($1::uuid,$2::uuid) AND pair_high=GREATEST($1::uuid,$2::uuid)",
        [owner, row.applicant_id],
      )
    ).rows[0];
    if (!conversation)
      throw new ApiError(
        503,
        "APPLICATION_LINK_UNAVAILABLE",
        "报名关联暂不可用",
      );
    let summary: RequestView | null = null,
      profile: S["Profile"] | null = null;
    try {
      summary = await this.requests.view(
        c,
        await this.requests.row(c, a, row.request_id),
        false,
      );
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    if (summary && !(await blocked(c, owner, row.applicant_id))) {
      try {
        profile = await publicProfile(c, row.applicant_id);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 404) throw e;
      }
    }
    return {
      id: row.id,
      request_id: row.request_id,
      applicant_id: row.applicant_id,
      status: row.status,
      expected_arrival_at: row.expected_arrival_at.toISOString(),
      capacity_parcels: row.capacity_parcels,
      observed_request_version: row.observed_request_version,
      contacted_at: row.contacted_at?.toISOString() ?? null,
      conversation_id: conversation.id,
      request_summary: summary,
      applicant_profile: profile,
    };
  }
  async apply(a: VerifiedIdentity, id: unknown, body: unknown, key: unknown) {
    const rid = requestId(id),
      p = checked(applyInput, body);
    return this.requests.tx(
      a,
      (c) =>
        this.idem(
          c,
          a,
          `application.create:${rid}`,
          key,
          p,
          async () => {
            const r = await this.requests.row(c, a, rid, false, true);
            if (r.publisher_id === a.userId)
              throw new ApiError(400, "OWN_REQUEST", "不能报名自己的需求");
            await publicProfile(c, a.userId);
            validateApplication(
              r,
              p,
              (await c.query("SELECT now() AS clock")).rows[0].clock.getTime(),
            );
            const existing = (
              await c.query<AppRow>(
                "SELECT * FROM abasong.applications WHERE request_id=$1 AND applicant_id=$2 FOR UPDATE",
                [rid, a.userId],
              )
            ).rows[0];
            if (existing?.status === "applied") {
              if (
                existing.observed_request_version !== r.version ||
                existing.expected_arrival_at.getTime() !==
                  Date.parse(p.expected_arrival_at) ||
                existing.capacity_parcels !== (p.capacity_parcels ?? null)
              )
                throw new ApiError(
                  409,
                  "ALREADY_APPLIED",
                  "你已报名，请先查看或撤回原报名",
                );
              return {
                id: existing.id,
                value: await this.appView(c, a, existing),
              };
            }
            const conversation = await ensureConversation(
              c,
              a.userId,
              r.publisher_id,
            );
            const row = (
              await c.query<AppRow>(
                "INSERT INTO abasong.applications(request_id,applicant_id,expected_arrival_at,capacity_parcels,observed_request_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(request_id,applicant_id) DO UPDATE SET status='applied',contacted_at=NULL,expected_arrival_at=EXCLUDED.expected_arrival_at,capacity_parcels=EXCLUDED.capacity_parcels,observed_request_version=EXCLUDED.observed_request_version,updated_at=now() RETURNING *",
                [
                  rid,
                  a.userId,
                  p.expected_arrival_at,
                  p.capacity_parcels ?? null,
                  p.observed_request_version,
                ],
              )
            ).rows[0]!;
            await attachRequestSource(
              c,
              conversation.id,
              rid,
              r.version,
              a.userId,
            );
            const event = (
              await c.query(
                "INSERT INTO abasong.application_events(application_id,actor_id,event_type) VALUES($1,$2,'applied') RETURNING id",
                [row.id, a.userId],
              )
            ).rows[0];
            await c.query(
              "INSERT INTO abasong.notifications(user_id,event_key,kind,object_type,object_id) VALUES($1,$2,'application_received','request',$3)",
              [r.publisher_id, `application:${event.id}`, rid],
            );
            await enqueueCollaboration(
              c,
              `application:${event.id}`,
              "application_received",
              row.id,
              a.userId,
              { request_id: rid, version: r.version },
            );
            await this.audit(c, a, "application.applied", row.id);
            return { id: row.id, value: await this.appView(c, a, row) };
          },
          async (applicationId) =>
            this.appView(c, a, await this.app(c, a, applicationId)),
        ),
      "request.apply",
    );
  }
  async applications(
    a: VerifiedIdentity,
    query: unknown,
    request?: unknown,
  ): Promise<S["ApplicationPage"]> {
    const q = checked(
        request === undefined
          ? requestPageInput
              .pick({ cursor: true, limit: true })
              .extend({
                request_id: z
                  .uuid()
                  .transform((v) => v.toLowerCase())
                  .optional(),
              })
              .strict()
          : requestPageInput.pick({ cursor: true, limit: true }),
        query,
      ),
      rid = request === undefined ? null : requestId(request),
      filter = (q as { request_id?: string }).request_id ?? null;
    return this.requests.tx(a, async (c) => {
      if (rid) await this.requests.row(c, a, rid, true);
      if (q.cursor) {
        const cursor = await this.app(c, a, q.cursor, !!rid);
        if (
          (rid && cursor.request_id !== rid) ||
          (!rid && cursor.applicant_id !== a.userId) ||
          (filter && cursor.request_id !== filter)
        )
          throw missing();
      }
      const rows = (
        await c.query<AppRow>(
          "SELECT a.* FROM abasong.applications a WHERE (($2::uuid IS NOT NULL AND a.request_id=$2) OR ($2::uuid IS NULL AND a.applicant_id=$1)) AND ($3::uuid IS NULL OR (a.created_at,a.id)<(SELECT created_at,id FROM abasong.applications WHERE id=$3)) AND ($5::uuid IS NULL OR a.request_id=$5) ORDER BY a.created_at DESC,a.id DESC LIMIT $4",
          [a.userId, rid, q.cursor ?? null, q.limit + 1, filter],
        )
      ).rows;
      return {
        items: await Promise.all(
          rows.slice(0, q.limit).map((r) => this.appView(c, a, r)),
        ),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
      };
    });
  }
  async withdraw(a: VerifiedIdentity, id: unknown) {
    const aid = requestId(id);
    return this.requests.tx(a, async (c) => {
      const row = await this.app(c, a, aid, false, true);
      if (row.applicant_id !== a.userId) throw missing();
      const updated = await c.query(
        "UPDATE abasong.applications SET status='withdrawn',updated_at=now() WHERE id=$1 AND status='applied' RETURNING id",
        [aid],
      );
      if (updated.rowCount) {
        const event = await c.query(
          "INSERT INTO abasong.application_events(application_id,actor_id,event_type) VALUES($1,$2,'withdrawn') RETURNING id",
          [aid, a.userId],
        );
        await enqueueCollaboration(
          c,
          `application:${event.rows[0].id}`,
          "application_withdrawn",
          aid,
          a.userId,
          { request_id: row.request_id },
        );
        await c.query(
          "INSERT INTO abasong.notifications(user_id,event_key,kind,object_type,object_id) SELECT publisher_id,$1,'application_withdrawn','request',id FROM abasong.requests WHERE id=$2 AND NOT EXISTS(SELECT 1 FROM abasong.blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=publisher_id) OR (b.blocker_id=publisher_id AND b.blocked_id=$3)) ON CONFLICT DO NOTHING",
          [`application:${event.rows[0].id}`, row.request_id, a.userId],
        );
        await this.audit(c, a, "application.withdrawn", aid);
      }
      return { ok: true as const };
    });
  }
  async contacted(a: VerifiedIdentity, id: unknown) {
    const aid = requestId(id);
    return this.requests.tx(a, async (c) => {
      const row = await this.app(c, a, aid, true, true);
      await this.requests.row(c, a, row.request_id, true);
      if (await blocked(c, a.userId, row.applicant_id)) throw missing();
      const updated = await c.query(
        "UPDATE abasong.applications SET contacted_at=now(),updated_at=now() WHERE id=$1 AND status='applied' AND contacted_at IS NULL RETURNING id",
        [aid],
      );
      if (row.status !== "applied")
        throw new ApiError(409, "APPLICATION_WITHDRAWN", "此报名已撤回");
      if (updated.rowCount) {
        const event = await c.query(
          "INSERT INTO abasong.application_events(application_id,actor_id,event_type) VALUES($1,$2,'contacted') RETURNING id",
          [aid, a.userId],
        );
        await enqueueCollaboration(
          c,
          `application:${event.rows[0].id}`,
          "application_contacted",
          aid,
          a.userId,
          { request_id: row.request_id },
        );
        await c.query(
          "INSERT INTO abasong.notifications(user_id,event_key,kind,object_type,object_id) VALUES($1,$2,'application_contacted','request',$3) ON CONFLICT DO NOTHING",
          [row.applicant_id, `application:${event.rows[0].id}`, row.request_id],
        );
        await this.audit(c, a, "application.contacted", aid);
      }
      return { ok: true as const };
    });
  }
  private async conversation(c: PoolClient, a: VerifiedIdentity, id: string) {
    const r = (
      await c.query(
        "SELECT * FROM abasong.conversations WHERE id=$1 AND $2 IN (pair_low,pair_high)",
        [id, a.userId],
      )
    ).rows[0];
    if (!r) throw missing();
    return r;
  }
  private conversationView(c: PoolClient, a: VerifiedIdentity, id: string) {
    return projectConversation(c, a, id);
  }
  async createConversation(a: VerifiedIdentity, body: unknown, key: unknown) {
    const p = checked(conversationInput, body);
    return this.requests.tx(a, (c) =>
      this.idem(
        c,
        a,
        "conversation.create",
        key,
        p,
        async () => {
          if (p.source_request_id) {
            const r = await this.requests.row(
              c,
              a,
              p.source_request_id,
              false,
              true,
            );
            if (
              r.publisher_id !== a.userId &&
              r.publisher_id !== p.other_user_id
            )
              throw missing();
            if (r.status === "draft") throw missing();
            if (r.version !== p.source_request_version)
              throw new ApiError(
                409,
                "VERSION_CONFLICT",
                "需求已更新，请重新查看",
              );
            if (
              r.publisher_id === a.userId &&
              !(
                await c.query(
                  "SELECT id FROM abasong.applications WHERE request_id=$1 AND applicant_id=$2",
                  [r.id, p.other_user_id],
                )
              ).rowCount
            )
              throw missing();
            // Ended requests retain old conversations but cannot create new contact intent.
            if (r.status !== "open" || r.is_expired)
              throw new ApiError(
                409,
                "REQUEST_ENDED",
                "这条需求已结束，请从已有会话联系",
              );
          }
          const conversation = await ensureConversation(
            c,
            a.userId,
            p.other_user_id,
          );
          if (p.source_request_id)
            await attachRequestSource(
              c,
              conversation.id,
              p.source_request_id,
              p.source_request_version!,
              a.userId,
            );
          await this.audit(c, a, "conversation.created", conversation.id);
          return {
            id: conversation.id,
            value: await this.conversationView(c, a, conversation.id),
          };
        },
        async (id) => {
          const r = await this.conversation(c, a, id),
            peer = r.pair_low === a.userId ? r.pair_high : r.pair_low;
          if (await blocked(c, a.userId, peer)) throw missing();
          return this.conversationView(c, a, id);
        },
      ),
    );
  }
  async read(a: VerifiedIdentity, id: unknown, body: unknown) {
    const cid = requestId(id),
      p = checked(readInput, body);
    return this.requests.tx(a, async (c) => {
      await this.conversation(c, a, cid);
      if (
        p.last_read_sequence &&
        !(
          await c.query(
            "SELECT id FROM abasong.messages WHERE conversation_id=$1 AND sequence=$2",
            [cid, p.last_read_sequence],
          )
        ).rowCount
      )
        throw new ApiError(400, "INVALID_SEQUENCE", "读取位置不属于本会话");
      await c.query(
        "INSERT INTO abasong.conversation_reads(conversation_id,user_id,last_read_sequence) VALUES($1,$2,$3) ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_sequence=GREATEST(abasong.conversation_reads.last_read_sequence,EXCLUDED.last_read_sequence),updated_at=now()",
        [cid, a.userId, p.last_read_sequence],
      );
      return { ok: true as const };
    });
  }
  private async audit(
    c: PoolClient,
    a: VerifiedIdentity,
    action: string,
    id: string,
  ) {
    await c.query(
      "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,$2,$3,$4,'success')",
      [
        a.userId,
        action,
        action.startsWith("application.") ? "application" : "conversation",
        id,
      ],
    );
  }
}
