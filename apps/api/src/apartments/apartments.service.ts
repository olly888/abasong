import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { SensitiveDatabase } from "./sensitive-database";
import { LocalEnvelope } from "./envelope";
import { buildAccessRankingQuery } from "../access/access-ranking.query";
type S = components["schemas"];
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((x) =>
      [...x].every((c) => c.codePointAt(0)! >= 32 && c.codePointAt(0) !== 127),
    );
const id = z.string().uuid();
const createEntry = z
  .object({
    apartment_id: id.optional(),
    address: text(300).min(1).optional(),
    name: text(160).optional(),
    region: text(60).optional(),
  })
  .strict()
  .refine((x) => Boolean(x.apartment_id) !== Boolean(x.address));
const patchEntry = z
  .object({
    expected_version: z.number().int().positive(),
    name: text(160).optional(),
    region: text(60).optional(),
    favorite: z.boolean().optional(),
  })
  .strict();
const recordInput = z
  .object({
    value: text(32).min(1),
    scope_label: text(100).min(1),
    note: text(300).optional(),
  })
  .strict();
const recordPatch = recordInput
  .extend({ expected_version: z.number().int().positive() })
  .strict();
const privateShare = z
  .object({
    expected_version: z.number().int().positive(),
    source_attested: z.literal(true),
  })
  .strict();
const accessInput = z
  .object({
    method: z.literal("keypad"),
    value: text(32).min(1),
    scope: z
      .object({ label: text(100).min(1) })
      .strict()
      .optional(),
    source_attested: z.literal(true),
  })
  .strict();
interface EntryRow {
  id: string;
  owner_id: string;
  apartment_id: string | null;
  favorite: boolean;
  payload: unknown;
  version: number;
  updated_at: Date;
  private_record_count?: number;
}
interface RecordRow {
  id: string;
  owner_id: string;
  entry_id: string;
  payload: unknown;
  version: number;
  updated_at: Date;
}
type EntryBody = { name: string; address: string; region: string };
type RecordBody = { value: string; scope_label: string; note: string };
const invalid = () => new ApiError(400, "INVALID_INPUT", "请检查填写内容");
const missing = () => new ApiError(404, "NOT_FOUND", "内容不存在或不可见");
const conflict = () =>
  new ApiError(409, "VERSION_CONFLICT", "资料已更新，请刷新后重试");
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw invalid();
  return r.data;
}
@Injectable()
export class ApartmentsService {
  private readonly crypto = new LocalEnvelope();
  constructor(
    @Inject(SensitiveDatabase) private readonly db: SensitiveDatabase,
  ) {}
  private async tx<T>(
    actor: VerifiedIdentity,
    run: (c: PoolClient) => Promise<T>,
    cap?: string,
  ): Promise<T> {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('abasong.actor_id',$1,true)", [
        actor.userId,
      ]);
      const u = (
        await c.query(
          "SELECT status,session_invalid_before FROM abasong.users WHERE id=$1",
          [actor.userId],
        )
      ).rows[0];
      if (!u) throw missing();
      if (u.status !== "active")
        throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用");
      if (
        u.session_invalid_before &&
        actor.issuedAt * 1000 <= u.session_invalid_before.getTime()
      )
        throw new ApiError(401, "SESSION_REVOKED", "请重新登录");
      if (cap) await this.cap(c, actor, cap);
      const result = await run(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async cap(c: PoolClient, a: VerifiedIdentity, cap: string) {
    if (
      !(
        await c.query(
          "SELECT 1 FROM abasong.capabilities WHERE user_id=$1 AND capability=$2 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())",
          [a.userId, cap],
        )
      ).rowCount
    )
      throw new ApiError(403, "CAPABILITY_REQUIRED", "当前没有此操作资格");
  }
  private aad(
    kind: string,
    r: { id: string; owner_id: string; version: number },
  ) {
    return `${kind}:${r.owner_id}:${r.id}:${r.version}`;
  }
  private entryView(r: EntryRow): S["LibraryEntry"] {
    const data = this.crypto.open<EntryBody>(r.payload, this.aad("entry", r));
    return {
      id: r.id,
      apartment_id: r.apartment_id,
      ...data,
      favorite: r.favorite,
      version: r.version,
      private_record_count: r.private_record_count ?? 0,
      updated_at: r.updated_at.toISOString(),
    };
  }
  private recordView(r: RecordRow): S["PrivateRecord"] {
    return {
      id: r.id,
      entry_id: r.entry_id,
      ...this.crypto.open<RecordBody>(r.payload, this.aad("private", r)),
      version: r.version,
      updated_at: r.updated_at.toISOString(),
    };
  }
  private async entry(
    c: PoolClient,
    a: VerifiedIdentity,
    key: string,
    lock = false,
  ): Promise<EntryRow> {
    parse(id, key);
    const r = (
      await c.query<EntryRow>(
        `SELECT p.*,(SELECT count(*)::int FROM abasong.personal_access_records r WHERE r.owner_id=p.owner_id AND r.entry_id=p.id) AS private_record_count FROM abasong.personal_apartments p WHERE p.id=$1 AND p.owner_id=$2 ${lock ? "FOR UPDATE OF p" : ""}`,
        [key, a.userId],
      )
    ).rows[0];
    if (!r) throw missing();
    return r;
  }
  private async record(
    c: PoolClient,
    a: VerifiedIdentity,
    key: string,
  ): Promise<RecordRow> {
    parse(id, key);
    const r = (
      await c.query<RecordRow>(
        "SELECT * FROM abasong.personal_access_records WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [key, a.userId],
      )
    ).rows[0];
    if (!r) throw missing();
    return r;
  }
  private async write<T>(
    c: PoolClient,
    a: VerifiedIdentity,
    route: string,
    key: string | undefined,
    body: unknown,
    run: () => Promise<{ object: string; result: T }>,
    replay: (id: string) => Promise<T>,
  ): Promise<T> {
    parse(id, key);
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${a.userId}:${route}:${key}`,
    ]);
    const hash = createHmac("sha256", this.crypto.hmacKey("request"))
      .update(JSON.stringify(body))
      .digest();
    const previous = (
      await c.query(
        "SELECT request_hmac,response_object_id FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at>now()",
        [a.userId, route, key],
      )
    ).rows[0];
    if (previous) {
      if (
        previous.request_hmac.length !== hash.length ||
        !timingSafeEqual(hash, previous.request_hmac)
      )
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "请求编号已用于其他内容",
        );
      return replay(previous.response_object_id);
    }
    await c.query(
      "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
      [a.userId, route, key],
    );
    const out = await run();
    await c.query(
      "INSERT INTO abasong.audit_events(actor_id,action,object_type,object_id,result) VALUES($1,$2,'apartment_data',$3,'success')",
      [a.userId, route.split(":")[0], out.object],
    );
    const retention = Number(process.env.IDEMPOTENCY_RETENTION_SECONDS);
    if (!Number.isSafeInteger(retention) || retention <= 0)
      throw new ApiError(503, "IDEMPOTENCY_NOT_CONFIGURED", "服务暂不可用");
    await c.query(
      "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',$5,now()+$6*interval '1 second')",
      [a.userId, route, key, hash, out.object, retention],
    );
    return out.result;
  }
  async list(
    a: VerifiedIdentity,
    q: Record<string, unknown>,
  ): Promise<S["LibraryPage"]> {
    const input = parse(
      z
        .object({
          cursor: id.optional(),
          apartment_id: id.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .strict(),
      q,
    );
    return this.tx(a, async (c) => {
      const rows = (
        await c.query<EntryRow>(
          "SELECT p.*,(SELECT count(*)::int FROM abasong.personal_access_records r WHERE r.entry_id=p.id AND r.owner_id=p.owner_id) AS private_record_count FROM abasong.personal_apartments p WHERE p.owner_id=$1 AND ($2::uuid IS NULL OR p.id>$2) AND ($4::uuid IS NULL OR p.apartment_id=$4) ORDER BY p.id LIMIT $3",
          [
            a.userId,
            input.cursor ?? null,
            input.limit + 1,
            input.apartment_id ?? null,
          ],
        )
      ).rows;
      return {
        items: rows.slice(0, input.limit).map((r) => this.entryView(r)),
        next_cursor:
          rows.length > input.limit ? rows[input.limit - 1]!.id : null,
      };
    });
  }
  async detail(a: VerifiedIdentity, key: string): Promise<S["LibraryDetail"]> {
    return this.tx(a, async (c) => {
      const e = await this.entry(c, a, key);
      const rows = (
        await c.query<RecordRow>(
          "SELECT * FROM abasong.personal_access_records WHERE owner_id=$1 AND entry_id=$2 ORDER BY updated_at DESC,id DESC",
          [a.userId, key],
        )
      ).rows;
      return {
        entry: this.entryView(e),
        records: rows.map((r) => this.recordView(r)),
      };
    });
  }
  async create(
    a: VerifiedIdentity,
    body: unknown,
    key: string | undefined,
  ): Promise<S["LibraryEntry"]> {
    return this.tx(a, (c) => this.createEntryTx(c, a, body, key));
  }
  async createEntryTx(
    c: PoolClient,
    a: VerifiedIdentity,
    body: unknown,
    key: string | undefined,
  ): Promise<S["LibraryEntry"]> {
    const b = parse(createEntry, body);
    return this.write(
      c,
      a,
      "library.create",
      key,
      b,
      async () => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${a.userId}:library`,
        ]);
        let data: EntryBody = {
          name: b.name ?? "我的公寓",
          address: b.address ?? "",
          region: b.region ?? "未分类",
        };
        if (b.apartment_id) {
          const apartment = (
            await c.query(
              "SELECT name,address_line1,city,state FROM abasong.apartments WHERE id=$1 AND status='active'",
              [b.apartment_id],
            )
          ).rows[0];
          if (!apartment) throw missing();
          data = {
            ...data,
            name: b.name ?? apartment.name ?? "公寓",
            address: `${apartment.address_line1}, ${apartment.city}, ${apartment.state}`,
          };
          const old = (
            await c.query<EntryRow>(
              "SELECT * FROM abasong.personal_apartments WHERE owner_id=$1 AND apartment_id=$2",
              [a.userId, b.apartment_id],
            )
          ).rows[0];
          if (old)
            return {
              object: old.id,
              result: this.entryView(await this.entry(c, a, old.id)),
            };
        }
        if (
          Number(
            (
              await c.query(
                "SELECT count(*) FROM abasong.personal_apartments WHERE owner_id=$1",
                [a.userId],
              )
            ).rows[0].count,
          ) >= 1000
        )
          throw new ApiError(422, "LIBRARY_LIMIT", "保存数量已达当前上限");
        const rid = randomUUID(),
          payload = this.crypto.seal(data, `entry:${a.userId}:${rid}:1`);
        await c.query(
          "INSERT INTO abasong.personal_apartments(id,owner_id,apartment_id,payload) VALUES($1,$2,$3,$4)",
          [rid, a.userId, b.apartment_id ?? null, payload],
        );
        return {
          object: rid,
          result: this.entryView(await this.entry(c, a, rid)),
        };
      },
      async (rid) => this.entryView(await this.entry(c, a, rid)),
    );
  }
  async patch(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
    key: string | undefined,
  ) {
    const b = parse(patchEntry, body);
    parse(id, rid);
    return this.tx(a, (c) =>
      this.write(
        c,
        a,
        `library.patch:${rid}`,
        key,
        b,
        async () => {
          const e = await this.entry(c, a, rid, true);
          if (e.version !== b.expected_version) throw conflict();
          const old = this.entryView(e),
            payload = this.crypto.seal(
              {
                name: b.name ?? old.name,
                address: old.address,
                region: b.region ?? old.region,
              },
              `entry:${a.userId}:${rid}:${e.version + 1}`,
            );
          await c.query(
            "UPDATE abasong.personal_apartments SET payload=$3,favorite=$4,version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2",
            [rid, a.userId, payload, b.favorite ?? e.favorite],
          );
          return {
            object: rid,
            result: this.entryView(await this.entry(c, a, rid)),
          };
        },
        async (rid) => this.entryView(await this.entry(c, a, rid)),
      ),
    );
  }
  async remove(a: VerifiedIdentity, rid: string, kind: "entry" | "record") {
    parse(id, rid);
    return this.tx(a, async (c) => {
      const table =
        kind === "entry" ? "personal_apartments" : "personal_access_records";
      const r = await c.query(
        `DELETE FROM abasong.${table} WHERE id=$1 AND owner_id=$2`,
        [rid, a.userId],
      );
      if (!r.rowCount) throw missing();
      return { ok: true };
    });
  }
  async createRecord(
    a: VerifiedIdentity,
    eid: string,
    body: unknown,
    key: string | undefined,
  ) {
    return this.tx(a, (c) => this.createRecordTx(c, a, eid, body, key));
  }
  async createRecordTx(
    c: PoolClient,
    a: VerifiedIdentity,
    eid: string,
    body: unknown,
    key: string | undefined,
  ) {
    const b = parse(recordInput, body);
    parse(id, eid);
    return this.write(
      c,
      a,
      `private.create:${eid}`,
      key,
      b,
      async () => {
        await this.entry(c, a, eid, true);
        const rows = (
          await c.query<RecordRow>(
            "SELECT * FROM abasong.personal_access_records WHERE owner_id=$1 AND entry_id=$2",
            [a.userId, eid],
          )
        ).rows;
        const same = rows.find((r) => {
          const old = this.recordView(r);
          return old.value === b.value && old.scope_label === b.scope_label;
        });
        if (same) return { object: same.id, result: this.recordView(same) };
        if (rows.length >= 100)
          throw new ApiError(422, "RECORD_LIMIT", "此公寓记录已达当前上限");
        const rid = randomUUID(),
          payload = this.crypto.seal(
            { ...b, note: b.note ?? "" },
            `private:${a.userId}:${rid}:1`,
          );
        await c.query(
          "INSERT INTO abasong.personal_access_records(id,owner_id,entry_id,payload) VALUES($1,$2,$3,$4)",
          [rid, a.userId, eid, payload],
        );
        return {
          object: rid,
          result: this.recordView(await this.record(c, a, rid)),
        };
      },
      async (rid) => this.recordView(await this.record(c, a, rid)),
    );
  }
  async patchRecord(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
    key: string | undefined,
  ) {
    const b = parse(recordPatch, body);
    parse(id, rid);
    return this.tx(a, (c) =>
      this.write(
        c,
        a,
        `private.patch:${rid}`,
        key,
        b,
        async () => {
          const r = await this.record(c, a, rid);
          if (r.version !== b.expected_version) throw conflict();
          const payload = this.crypto.seal(
            { value: b.value, scope_label: b.scope_label, note: b.note ?? "" },
            `private:${a.userId}:${rid}:${r.version + 1}`,
          );
          await c.query(
            "UPDATE abasong.personal_access_records SET payload=$3,version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2",
            [rid, a.userId, payload],
          );
          return {
            object: rid,
            result: this.recordView(await this.record(c, a, rid)),
          };
        },
        async (rid) => this.recordView(await this.record(c, a, rid)),
      ),
    );
  }
  async sharePrivate(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
    key: string | undefined,
  ) {
    const b = parse(privateShare, body);
    return this.tx(
      a,
      async (c) => {
        const r = await this.record(c, a, rid);
        if (r.version !== b.expected_version) throw conflict();
        const e = await this.entry(c, a, r.entry_id);
        if (!e.apartment_id)
          throw new ApiError(
            422,
            "APARTMENT_REVIEW_REQUIRED",
            "请先核对并收录这栋公寓，再共享",
          );
        const value = this.recordView(r);
        return this.contributeTx(
          c,
          a,
          e.apartment_id,
          {
            method: "keypad",
            value: value.value,
            scope: { label: value.scope_label },
            source_attested: true,
          },
          key,
          `private.share:${rid}`,
          b,
        );
      },
      "access.contribute",
    );
  }
  async contribute(
    a: VerifiedIdentity,
    aid: string,
    body: unknown,
    key: string | undefined,
  ) {
    const b = parse(accessInput, body);
    parse(id, aid);
    return this.tx(
      a,
      (c) => this.contributeTx(c, a, aid, b, key, `contribute:${aid}`, b),
      "access.contribute",
    );
  }
  async contributeImportTx(
    c: PoolClient,
    a: VerifiedIdentity,
    aid: string,
    body: unknown,
    key: string,
  ) {
    const b = parse(accessInput, body);
    await this.cap(c, a, "access.contribute");
    return this.contributeTx(c, a, aid, b, key, `import.share:${key}`, b);
  }
  private async contributeTx(
    c: PoolClient,
    a: VerifiedIdentity,
    aid: string,
    b: z.infer<typeof accessInput>,
    key: string | undefined,
    route: string,
    intent: unknown,
  ): Promise<S["ContributionResult"]> {
    if (
      !(
        await c.query(
          "SELECT 1 FROM abasong.apartments WHERE id=$1 AND status='active'",
          [aid],
        )
      ).rowCount
    )
      throw missing();
    const label = b.scope?.label ?? "大门",
      scopeKey = `keypad:${label.normalize("NFC").toLowerCase()}`,
      hash = createHmac("sha256", this.crypto.hmacKey("shared-dedup"))
        .update(b.value)
        .digest();
    return this.write(
      c,
      a,
      route,
      key,
      intent,
      async () => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${aid}:${scopeKey}:${hash.toString("hex")}`,
        ]);
        let r = (
          await c.query(
            "SELECT id,contributed_at,status FROM abasong.access_records WHERE apartment_id=$1 AND scope_key=$2 AND hmac_key_version=$3 AND dedup_hmac=$4",
            [aid, scopeKey, "local-v1", hash],
          )
        ).rows[0];
        let outcome: S["ContributionResult"]["outcome"] =
          "same_value_validation";
        if (!r) {
          const recordId = randomUUID();
          r = (
            await c.query(
              "INSERT INTO abasong.access_records(id,apartment_id,contributor_id,method,scope_key,scope_label,dedup_hmac,hmac_key_version,source_attested_at) VALUES($1,$2,$3,'keypad',$4,$5,$6,'local-v1',now()) RETURNING id,contributed_at,status",
              [recordId, aid, a.userId, scopeKey, label, hash],
            )
          ).rows[0];
          const envelope = this.crypto.seal(
            { value: b.value },
            `shared:${recordId}:1`,
          );
          await c.query(
            "INSERT INTO abasong.access_secrets(record_id,ciphertext,nonce,auth_tag,encrypted_dek,kms_key_id,cipher_version) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              recordId,
              Buffer.from(envelope.body[1]!, "base64"),
              Buffer.from(envelope.body[0]!, "base64"),
              Buffer.from(envelope.body[2]!, "base64"),
              Buffer.from(JSON.stringify(envelope.wrapped)),
              "local-development",
              "local-envelope-v1",
            ],
          );
          outcome = "created_pending";
        } else if (!["pending", "active", "review"].includes(r.status))
          throw new ApiError(
            409,
            "RECORD_UNAVAILABLE",
            "原记录已停用，请提交复核",
          );
        const eventId = randomUUID();
        await c.query(
          "INSERT INTO abasong.access_contributions(id,record_id,user_id,event_type) VALUES($1,$2,$3,$4)",
          [
            eventId,
            r.id,
            a.userId,
            outcome === "created_pending" ? "created" : "same_value_validation",
          ],
        );
        return {
          object: eventId,
          result: {
            record_id: r.id,
            outcome,
            contributed_at: r.contributed_at.toISOString(),
          },
        };
      },
      async (eventId) => {
        const event = (
          await c.query(
            "SELECT e.event_type,r.id,r.contributed_at FROM abasong.access_contributions e JOIN abasong.access_records r ON r.id=e.record_id WHERE e.id=$1 AND e.user_id=$2",
            [eventId, a.userId],
          )
        ).rows[0];
        if (!event) throw missing();
        return {
          record_id: event.id,
          outcome:
            event.event_type === "created"
              ? "created_pending"
              : "same_value_validation",
          contributed_at: event.contributed_at.toISOString(),
        };
      },
    );
  }
  async readShared(
    a: VerifiedIdentity,
    aid: string,
    q: Record<string, unknown>,
  ): Promise<S["AccessList"]> {
    parse(id, aid);
    const input = parse(
      z
        .object({ limit: z.coerce.number().int().min(1).max(20).default(20) })
        .strict(),
      q,
    );
    return this.tx(
      a,
      async (c) => {
        if (
          !(
            await c.query(
              "SELECT 1 FROM abasong.apartments WHERE id=$1 AND status='active'",
              [aid],
            )
          ).rowCount
        )
          throw missing();
        const config = (
          await c.query(
            "SELECT version,config FROM abasong.config_versions WHERE activated_at<=now() ORDER BY version DESC LIMIT 1",
          )
        ).rows[0];
        const days = config?.config.feedback_window_days;
        if (!Number.isSafeInteger(days) || days <= 0 || days > 3650)
          throw new ApiError(503, "CONFIGURATION_REQUIRED", "资料规则尚未配置");
        const scopeRows = (
          await c.query(
            "SELECT DISTINCT scope_key FROM abasong.access_records WHERE apartment_id=$1 AND method='keypad' AND applicable_schedule IS NULL",
            [aid],
          )
        ).rows;
        if (!scopeRows.length)
          return {
            items: [],
            config_version: config.version,
            next_cursor: null,
          };
        const now = new Date(),
          rank = await c.query(
            buildAccessRankingQuery({
              apartmentId: aid,
              scopeKeys: scopeRows.map((r) => r.scope_key),
              asOf: now,
              effectiveUsefulSince: new Date(now.getTime() - days * 86400000),
              limit: input.limit,
            }),
          );
        const items: S["AccessRecord"][] = [];
        for (const row of rank.rows) {
          const r = (
            await c.query(
              "SELECT r.id,r.apartment_id,r.scope_label,r.contributed_at,r.last_success_at,r.last_failure_at,r.version,s.*,p.display_name,(SELECT value FROM abasong.access_feedback f WHERE f.record_id=r.id AND f.user_id=$2 AND f.excluded_at IS NULL) AS my_feedback FROM abasong.access_records r JOIN abasong.access_secrets s ON s.record_id=r.id LEFT JOIN abasong.profiles p ON p.user_id=r.contributor_id WHERE r.id=$1 AND r.status='active' AND r.applicable_schedule IS NULL",
              [row.id, a.userId],
            )
          ).rows[0];
          if (!r) continue;
          if (
            r.cipher_version !== "local-envelope-v1" ||
            r.kms_key_id !== "local-development"
          )
            throw new ApiError(
              503,
              "ENCRYPTION_UNAVAILABLE",
              "加密服务暂不可用",
            );
          const envelope = {
            format: r.cipher_version,
            body: [
              r.nonce.toString("base64"),
              r.ciphertext.toString("base64"),
              r.auth_tag.toString("base64"),
            ],
            wrapped: JSON.parse(r.encrypted_dek.toString()),
          };
          const body = this.crypto.open<{ value: string }>(
            envelope,
            `shared:${r.id}:${r.version}`,
          );
          items.push({
            id: r.id,
            apartment_id: r.apartment_id,
            method: "keypad",
            value: body.value,
            scope: { label: r.scope_label ?? "大门" },
            contributed_at: r.contributed_at.toISOString(),
            last_success_at: r.last_success_at?.toISOString() ?? null,
            last_failure_at: r.last_failure_at?.toISOString() ?? null,
            effective_useful: row.has_current_effective_useful,
            my_feedback: r.my_feedback ?? null,
            verification_label: "community_contribution",
            contributor_display_name: r.display_name ?? "司机",
          });
        }
        return { items, config_version: config.version, next_cursor: null };
      },
      "access.read",
    );
  }
  async feedback(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
  ): Promise<S["FeedbackResult"]> {
    parse(id, rid);
    const b = parse(
      z
        .object({
          client_event_id: id,
          value: z.enum(["useful", "not_useful", "withdrawn"]),
          reason: text(200).optional(),
        })
        .strict(),
      body,
    );
    return this.tx(
      a,
      async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${a.userId}:feedback`,
        ]);
        const target = (
          await c.query(
            "SELECT r.id FROM abasong.access_records r JOIN abasong.apartments p ON p.id=r.apartment_id AND p.status='active' WHERE r.id=$1 AND r.status='active' AND (r.expires_at IS NULL OR r.expires_at>now()) AND r.applicable_schedule IS NULL",
            [rid],
          )
        ).rows[0];
        if (!target) throw missing();
        const old = (
          await c.query(
            "SELECT record_id,value,reason,occurred_at FROM abasong.feedback_events WHERE user_id=$1 AND client_event_id=$2",
            [a.userId, b.client_event_id],
          )
        ).rows[0];
        if (old) {
          if (
            old.record_id !== rid ||
            old.value !== b.value ||
            (old.reason ?? "") !== (b.reason ?? "")
          )
            throw new ApiError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "反馈编号已用于其他内容",
            );
          return {
            record_id: rid,
            value: old.value,
            updated_at: old.occurred_at.toISOString(),
          };
        }
        const event = (
          await c.query(
            "INSERT INTO abasong.feedback_events(record_id,user_id,client_event_id,value,reason) VALUES($1,$2,$3,$4,$5) RETURNING occurred_at",
            [rid, a.userId, b.client_event_id, b.value, b.reason ?? null],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO abasong.access_feedback(record_id,user_id,value,reason,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(record_id,user_id) DO UPDATE SET value=excluded.value,reason=excluded.reason,updated_at=excluded.updated_at",
          [rid, a.userId, b.value, b.reason ?? null, event.occurred_at],
        );
        return {
          record_id: rid,
          value: b.value,
          updated_at: event.occurred_at.toISOString(),
        };
      },
      "access.read",
    );
  }
  async contributions(
    a: VerifiedIdentity,
    q: Record<string, unknown>,
  ): Promise<S["ContributionSummaryPage"]> {
    const b = parse(
      z
        .object({
          cursor: id.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        })
        .strict(),
      q,
    );
    return this.tx(a, async (c) => {
      const rows = (
        await c.query(
          "SELECT e.id,e.record_id,r.apartment_id,e.event_type,e.occurred_at,r.status AS record_status,p.address_line1,p.city,p.state FROM abasong.access_contributions e JOIN abasong.access_records r ON r.id=e.record_id JOIN abasong.apartments p ON p.id=r.apartment_id WHERE e.user_id=$1 AND ($2::uuid IS NULL OR e.id>$2) ORDER BY e.id LIMIT $3",
          [a.userId, b.cursor ?? null, b.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, b.limit).map((r) => ({
          id: r.id,
          record_id: r.record_id,
          apartment_id: r.apartment_id,
          address_label: `${r.address_line1}, ${r.city}, ${r.state}`,
          event_type: r.event_type,
          record_status: r.record_status,
          can_withdraw_record: false,
          occurred_at: r.occurred_at.toISOString(),
        })),
        next_cursor: rows.length > b.limit ? rows[b.limit - 1].id : null,
      };
    });
  }
  async mapContext(
    a: VerifiedIdentity,
    rid: string,
  ): Promise<S["ApartmentMapContext"]> {
    parse(id, rid);
    return this.tx(a, async (c) => {
      const apartment = await c.query(
        "SELECT id FROM abasong.apartments WHERE id=$1 AND status='active'",
        [rid],
      );
      if (!apartment.rowCount) throw missing();
      const result = await c.query(
        `SELECT b.id,b.street_number,b.verified_at,
        extensions.ST_AsGeoJSON(b.footprint)::json AS geometry,
        extensions.ST_X(b.label_point) AS lng,extensions.ST_Y(b.label_point) AS lat
        FROM abasong.apartment_buildings b JOIN abasong.data_sources s ON s.id=b.source_id
        WHERE b.apartment_id=$1 AND b.verified_at<=now() AND s.persistent_use_approved
        AND s.verified_at IS NOT NULL AND s.verified_at<=now()
        AND (s.expires_at IS NULL OR s.expires_at>now()) ORDER BY b.id LIMIT 100`,
        [rid],
      );
      return {
        apartment_id: rid,
        buildings: result.rows.map((b) => ({
          id: b.id,
          geometry: b.geometry,
          label_point: { lng: b.lng, lat: b.lat },
          street_number: b.street_number,
          verified_at: b.verified_at.toISOString(),
        })),
      };
    });
  }
  async resolve(
    a: VerifiedIdentity,
    body: unknown,
  ): Promise<S["ResolveResult"]> {
    const b = parse(
      z
        .object({
          point: z
            .object({
              lng: z.number().finite().min(-180).max(180),
              lat: z.number().finite().min(-90).max(90),
            })
            .strict(),
          observed_at: z.string().datetime({ offset: true }),
          accuracy_m: z.number().finite().min(0).max(100000),
          accuracy_permission: z.enum(["precise", "approximate"]),
        })
        .strict(),
      body,
    );
    return this.tx(a, async (c) => {
      const config = (
        await c.query(
          "SELECT version,config FROM abasong.config_versions WHERE activated_at<=now() ORDER BY version DESC LIMIT 1",
        )
      ).rows[0];
      const settings = z
        .object({
          auto_match: z
            .object({
              enabled: z.boolean(),
              evidence_ref: z.string().min(1).max(300),
              max_accuracy_m: z.number().finite().positive().max(50),
            })
            .strict()
            .optional(),
          radius_m: z.number().finite().positive().max(1000),
          max_age_seconds: z.number().finite().positive().max(300),
          future_tolerance_seconds: z.number().finite().min(0).max(30),
          max_accuracy_m: z.number().finite().positive().max(1000),
        })
        .strict()
        .safeParse(config?.config.apartment_resolve);
      if (!settings.success)
        throw new ApiError(
          503,
          "RESOLVE_NOT_CONFIGURED",
          "附近公寓暂不可用，请搜索地址",
        );
      const cfg = settings.data;
      const age = (Date.now() - Date.parse(b.observed_at)) / 1000;
      if (age > cfg.max_age_seconds || age < -cfg.future_tolerance_seconds)
        return {
          status: "stale_location",
          matched_id: null,
          candidates: [],
          config_version: config.version,
        };
      // Coarse fixes must never silently choose a building. No position/history is written.
      if (b.accuracy_m > cfg.max_accuracy_m)
        return {
          status: "unknown",
          matched_id: null,
          candidates: [],
          config_version: config.version,
        };
      const result = await c.query(
        `SELECT id,name,address_line1,city,state,postal_code,confidence,
        extensions.ST_X(point::extensions.geometry) AS lng,extensions.ST_Y(point::extensions.geometry) AS lat,
        CASE WHEN boundary IS NOT NULL AND extensions.ST_IsValid(boundary) THEN
          extensions.ST_Covers(boundary, extensions.ST_Buffer(extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,GREATEST($4::double precision,1))::extensions.geometry)
          ELSE false END AS inside,
        CASE WHEN boundary IS NOT NULL AND extensions.ST_IsValid(boundary) THEN
          extensions.ST_DWithin(boundary::extensions.geography,extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,GREATEST($4::double precision,1))
          ELSE extensions.ST_DWithin(point,extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,GREATEST($4::double precision,1)) END AS possible,
        EXISTS(SELECT 1 FROM abasong.data_sources s WHERE s.id=apartments.source_id
          AND s.persistent_use_approved AND s.verified_at IS NOT NULL AND s.verified_at<=now()
          AND (s.expires_at IS NULL OR s.expires_at>now())) AS source_valid
        FROM abasong.apartments WHERE status='active' AND
        (extensions.ST_DWithin(point,extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,$3)
          OR extensions.ST_DWithin(boundary::extensions.geography,extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography,$3))
        ORDER BY extensions.ST_Distance(point,extensions.ST_SetSRID(extensions.ST_MakePoint($1,$2),4326)::extensions.geography),id LIMIT 20`,
        [
          b.point.lng,
          b.point.lat,
          Math.max(cfg.radius_m, b.accuracy_m, 1),
          b.accuracy_m,
        ],
      );
      const candidates = result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        address_line1: r.address_line1,
        city: r.city,
        state: r.state,
        postal_code: r.postal_code,
        confidence: r.confidence,
        point: { lng: r.lng, lat: r.lat },
      }));
      // Only a versioned, explicitly enabled field-evidence configuration may
      // promote a unique verified boundary. Any competing boundary touching the
      // uncertainty circle (or unbounded address point within it) vetoes it.
      const contained = result.rows.filter((r) => r.inside);
      const match =
        cfg.auto_match?.enabled &&
        b.accuracy_permission === "precise" &&
        b.accuracy_m <= cfg.auto_match.max_accuracy_m &&
        contained.length === 1 &&
        result.rows.filter((r) => r.possible).length === 1 &&
        contained[0].source_valid &&
        contained[0].confidence !== "unverified" &&
        result.rows.length < 20
          ? contained[0].id
          : null;
      return {
        status: match
          ? "matched"
          : candidates.length
            ? "candidates"
            : "unknown",
        matched_id: match,
        candidates,
        config_version: config.version,
      };
    });
  }
  async apartment(a: VerifiedIdentity, rid: string): Promise<S["Apartment"]> {
    parse(id, rid);
    return this.tx(a, async (c) => {
      const r = (
        await c.query(
          "SELECT id,name,address_line1,city,state,postal_code,confidence,extensions.ST_X(point::extensions.geometry) AS lng,extensions.ST_Y(point::extensions.geometry) AS lat FROM abasong.apartments WHERE id=$1 AND status='active'",
          [rid],
        )
      ).rows[0];
      if (!r) throw missing();
      return {
        id: r.id,
        name: r.name,
        address_line1: r.address_line1,
        city: r.city,
        state: r.state,
        postal_code: r.postal_code,
        confidence: r.confidence,
        point: { lng: r.lng, lat: r.lat },
      };
    });
  }
  async search(
    a: VerifiedIdentity,
    q: Record<string, unknown>,
  ): Promise<S["ApartmentPage"]> {
    const b = parse(
      z
        .object({
          query: text(200).min(2),
          limit: z.coerce.number().int().min(1).max(20).default(20),
        })
        .strict(),
      q,
    );
    return this.tx(a, async (c) => {
      const result = await c.query(
        "SELECT id,name,address_line1,city,state,postal_code,confidence,extensions.ST_X(point::extensions.geometry) AS lng,extensions.ST_Y(point::extensions.geometry) AS lat FROM abasong.apartments WHERE status='active' AND (strpos(lower(coalesce(name,'')||' '||address_line1||' '||city),lower($1))>0) ORDER BY id LIMIT $2",
        [b.query, b.limit],
      );
      return {
        items: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          address_line1: r.address_line1,
          city: r.city,
          state: r.state,
          postal_code: r.postal_code,
          confidence: r.confidence,
          point: { lng: r.lng, lat: r.lat },
        })),
        next_cursor: null,
      };
    });
  }
}
