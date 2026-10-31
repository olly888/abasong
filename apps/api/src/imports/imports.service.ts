import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type { components } from "@abasong/contracts";
import type { VerifiedIdentity } from "../common/request-context";
import { ApiError } from "../common/api-error";
import { SensitiveDatabase } from "../apartments/sensitive-database";
import { LocalEnvelope } from "../apartments/envelope";
import { ApartmentsService } from "../apartments/apartments.service";
import { importPolicy } from "./import-policy";
type S = components["schemas"];
const id = z.string().uuid(),
  v = z.number().int().positive();
const clean = (n: number) =>
  z
    .string()
    .trim()
    .max(n)
    .refine(
      (s) =>
        ![...s].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127),
    );
const mode = z.enum(["private_only", "private_and_share"]);
const scope = z.object({ label: clean(100).optional() }).strict();
const candidate = z
  .object({
    address_text: clean(300),
    value: clean(32),
    method: z.enum([
      "keypad",
      "front_desk",
      "digital_access",
      "no_fixed_code",
      "other",
    ]),
    scope: scope.optional(),
  })
  .strict();
const version = z.object({ expected_version: v }).strict();
const create = z
  .object({
    client_batch_id: id,
    policy_version: v,
    mode,
    origin: z.enum(["contribute", "library", "apartment"]),
    origin_apartment_id: id.optional(),
  })
  .strict();
const source = z
  .object({
    client_source_id: id,
    expected_batch_version: v,
    mime_type: z.enum(["image/jpeg", "image/png", "image/heic"]),
    byte_size: v,
    width: v,
    height: v,
  })
  .strict();
const extraction = z
  .object({
    expected_source_version: v,
    recognizer_version: clean(80).min(1),
    candidates: z.array(candidate).max(100),
  })
  .strict();
const edit = z
  .object({
    expected_revision: v,
    address_text: clean(300).optional(),
    apartment_id: id.nullable().optional(),
    method: candidate.shape.method.optional(),
    value: clean(32).optional(),
    scope: scope.optional(),
    removed: z.boolean().optional(),
  })
  .strict();
const item = z.object({ candidate_id: id, expected_revision: v }).strict();
const confirm = z
  .object({
    expected_batch_version: v,
    fields_confirmed: z.literal(true),
    items: z.array(item).min(1).max(100),
  })
  .strict();
const commit = z
  .object({
    expected_batch_version: v,
    mode,
    source_attested: z.literal(true),
    items: z
      .array(
        z
          .object({
            candidate_id: id,
            confirmed_revision: v,
            client_commit_id: id,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
const page = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
function parse<T>(s: z.ZodType<T>, b: unknown): T {
  const p = s.safeParse(b);
  if (!p.success) throw new ApiError(400, "INVALID_INPUT", "请检查填写内容");
  return p.data;
}
const missing = () => new ApiError(404, "NOT_FOUND", "内容不存在或不可见");
const conflict = () =>
  new ApiError(409, "IMPORT_CONFLICT", "资料已更新，请重新核对");
type Source = S["ImportSource"] & {
  client_id: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  recognizer_version?: string;
};
type Plan = {
  clientId: string;
  entryKey: string;
  recordKey: string;
  shareKey: string;
  result: S["ImportCommitResult"];
};
type Body = {
  sources: Source[];
  candidates: S["ImportCandidate"][];
  plans: Record<string, Plan>;
  replays: Record<string, { hmac: string; ids: string[] }>;
};
type Row = {
  id: string;
  owner_id: string;
  client_batch_id: string;
  create_hmac: Buffer;
  policy_version: number;
  version: number;
  generation: number;
  state: S["ImportBatch"]["state"];
  mode: S["ImportBatch"]["mode"];
  mode_locked: boolean;
  expires_at: Date;
  updated_at: Date;
  payload: unknown;
};
@Injectable()
export class ImportsService {
  private readonly crypto = new LocalEnvelope();
  constructor(
    @Inject(SensitiveDatabase) private readonly db: SensitiveDatabase,
    @Inject(ApartmentsService) private readonly apartments: ApartmentsService,
  ) {}
  private hash(body: unknown) {
    return createHmac("sha256", this.crypto.hmacKey("import-request"))
      .update(JSON.stringify(body))
      .digest("hex");
  }
  private async tx<T>(a: VerifiedIdentity, run: (c: PoolClient) => Promise<T>) {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('abasong.actor_id',$1,true)", [
        a.userId,
      ]);
      const u = (
        await c.query(
          "SELECT status,session_invalid_before FROM abasong.users WHERE id=$1",
          [a.userId],
        )
      ).rows[0]!;
      if (!u) throw missing();
      if (u.status !== "active")
        throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用");
      if (
        u.session_invalid_before &&
        a.issuedAt * 1000 <= u.session_invalid_before.getTime()
      )
        throw new ApiError(401, "SESSION_REVOKED", "请重新登录");
      const out = await run(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      if (!(e instanceof ApiError)) {
        const code =
          typeof e === "object" && e && "code" in e
            ? String(e.code)
            : "INTERNAL";
        console.error(
          "IMPORT_DB_FAILED",
          /^[A-Z0-9]{5}$/.test(code) ? code : "INTERNAL",
        );
      }
      await c.query("ROLLBACK");
      if (!(e instanceof ApiError))
        throw new ApiError(
          503,
          "IMPORT_STORAGE_UNAVAILABLE",
          "导入资料暂不可用，请重试",
        );
      throw e;
    } finally {
      c.release();
    }
  }
  private async get(c: PoolClient, a: VerifiedIdentity, rid: string) {
    parse(id, rid);
    const r = (
      await c.query<Row>(
        "SELECT * FROM abasong.import_batches WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [rid, a.userId],
      )
    ).rows[0]!;
    if (!r) throw missing();
    if (r.expires_at.getTime() <= Date.now())
      throw new ApiError(422, "IMPORT_EXPIRED", "草稿已过期");
    return r;
  }
  private open(r: Row) {
    return this.crypto.open<Body>(
      r.payload,
      `import:${r.owner_id}:${r.id}:${r.version}`,
    );
  }
  private async save(c: PoolClient, r: Row, b: Body) {
    r.version++;
    r.updated_at = new Date();
    const payload = this.crypto.seal(
      b,
      `import:${r.owner_id}:${r.id}:${r.version}`,
    );
    await c.query(
      "UPDATE abasong.import_batches SET version=$3,generation=$4,state=$5,mode=$6,mode_locked=$7,payload=$8,updated_at=$9 WHERE id=$1 AND owner_id=$2",
      [
        r.id,
        r.owner_id,
        r.version,
        r.generation,
        r.state,
        r.mode,
        r.mode_locked,
        payload,
        r.updated_at,
      ],
    );
  }
  private view(r: Row, b: Body): S["ImportBatch"] {
    const plans = Object.values(b.plans);
    return {
      id: r.id,
      state: r.state,
      version: r.version,
      generation: r.generation,
      mode: r.mode,
      mode_locked: r.mode_locked,
      policy_version: r.policy_version,
      expires_at: r.expires_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      sources_count: b.sources.length,
      candidate_count: b.candidates.length,
      private_saved_count: plans.filter(
        (p) => p.result.private_status === "saved",
      ).length,
      shared_count: plans.filter((p) =>
        ["active", "same_value"].includes(p.result.share_status),
      ).length,
      pending_count: plans.filter((p) => p.result.share_status === "pending")
        .length,
      failed_count: plans.filter(
        (p) =>
          p.result.private_status === "failed" ||
          p.result.share_status === "failed",
      ).length,
    };
  }
  private writable(r: Row) {
    if (["cancelled", "expired"].includes(r.state)) throw conflict();
  }
  private revision(r: Row, n: number) {
    if (r.version !== n) throw conflict();
  }
  private async cap(c: PoolClient, a: VerifiedIdentity) {
    if (
      !(
        await c.query(
          "SELECT 1 FROM abasong.capabilities WHERE user_id=$1 AND capability='access.contribute' AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())",
          [a.userId],
        )
      ).rowCount
    )
      throw new ApiError(403, "CAPABILITY_REQUIRED", "当前没有共享资格");
  }
  private replay(
    b: Body,
    route: string,
    key: unknown,
    input: unknown,
    ids: string[] = [],
  ) {
    parse(id, key);
    const k = route + ":" + key,
      hmac = this.hash(input),
      old = b.replays[k];
    if (old) {
      if (old.hmac !== hmac)
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "请求编号已用于其他内容",
        );
      return old.ids;
    }
    if (Object.keys(b.replays).length >= 500)
      throw new ApiError(422, "IMPORT_OPERATION_LIMIT", "请新建导入批次");
    b.replays[k] = { hmac, ids };
    return null;
  }
  private find(b: Body, rid: string) {
    parse(id, rid);
    const found = b.candidates.find((x) => x.id === rid);
    if (!found) throw missing();
    return found;
  }
  private plan(b: Body, cid: string): Plan {
    const p = b.plans[cid];
    if (!p) throw missing();
    return p;
  }
  private async confirmable(c: PoolClient, x: S["ImportCandidate"]) {
    if (
      x.state === "removed" ||
      x.state === "committed" ||
      !x.address_text ||
      !x.value ||
      x.method !== "keypad"
    )
      throw new ApiError(422, "IMPORT_REVIEW_REQUIRED", "请核对地址与密码");
    if (x.apartment_id) {
      const p = (
        await c.query(
          "SELECT address_line1,city,state,postal_code FROM abasong.apartments WHERE id=$1 AND status='active'",
          [x.apartment_id],
        )
      ).rows[0]!;
      if (!p) throw missing();
      const normalize = (s: string) =>
        s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
      const expected = normalize(
        p.address_line1 + ", " + p.city + ", " + p.state,
      );
      const actual = normalize(
        x.address_text.replace(/\s+\d{5}(?:-\d{4})?$/, ""),
      );
      if (actual !== expected)
        throw new ApiError(
          422,
          "IMPORT_ADDRESS_MISMATCH",
          "地址与所选公寓不一致",
        );
    }
  }
  async policy(a: VerifiedIdentity) {
    return this.tx(a, importPolicy);
  }
  async list(a: VerifiedIdentity, q: unknown) {
    const b = parse(page, q);
    return this.tx(a, async (c) => {
      const rs = (
        await c.query<Row>(
          "SELECT * FROM abasong.import_batches WHERE owner_id=$1 AND expires_at>now() AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3",
          [a.userId, b.cursor ?? null, b.limit + 1],
        )
      ).rows;
      return {
        items: rs.slice(0, b.limit).map((r) => this.view(r, this.open(r))),
        next_cursor: rs.length > b.limit ? rs[b.limit - 1]!.id : null,
      };
    });
  }
  async create(a: VerifiedIdentity, body: unknown, key: unknown) {
    const b = parse(create, body);
    parse(id, key);
    return this.tx(a, async (c) => {
      const policy = await importPolicy(c);
      if (b.policy_version !== policy.version) throw conflict();
      if (b.mode === "private_and_share") await this.cap(c, a);
      if (
        b.origin_apartment_id &&
        !(
          await c.query(
            "SELECT 1 FROM abasong.apartments WHERE id=$1 AND status='active'",
            [b.origin_apartment_id],
          )
        ).rowCount
      )
        throw missing();
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        a.userId + ":imports",
      ]);
      const h = this.hash(b),
        old = (
          await c.query<Row>(
            "SELECT * FROM abasong.import_batches WHERE owner_id=$1 AND client_batch_id=$2 FOR UPDATE",
            [a.userId, b.client_batch_id],
          )
        ).rows[0]!;
      const prior = (
        await c.query(
          "SELECT request_hmac,response_object_id FROM abasong.idempotency_keys WHERE actor_id=$1 AND route='import.create' AND key=$2 AND expires_at>now()",
          [a.userId, key],
        )
      ).rows[0]!;
      if (
        prior &&
        (!timingSafeEqual(prior.request_hmac, Buffer.from(h, "hex")) ||
          prior.response_object_id !== old?.id)
      )
        throw conflict();
      if (old) {
        if (old.create_hmac.toString("hex") !== h) throw conflict();
        const r = await this.get(c, a, old.id);
        return this.view(r, this.open(r));
      }
      if (
        Number(
          (
            await c.query(
              "SELECT count(*) n FROM abasong.import_batches WHERE owner_id=$1 AND expires_at>now()",
              [a.userId],
            )
          ).rows[0].n,
        ) >= 20
      )
        throw new ApiError(422, "IMPORT_BATCH_LIMIT", "请先处理已有导入");
      const rid = randomUUID(),
        data: Body = { sources: [], candidates: [], plans: {}, replays: {} };
      const r = (
        await c.query<Row>(
          `INSERT INTO abasong.import_batches(id,owner_id,client_batch_id,create_hmac,policy_version,state,mode,payload,expires_at)
   VALUES($1,$2,$3,$4,$5,'created',$6,$7,now()+$8::double precision*interval '1 second') RETURNING *`,
          [
            rid,
            a.userId,
            b.client_batch_id,
            Buffer.from(h, "hex"),
            policy.version,
            b.mode,
            this.crypto.seal(data, `import:${a.userId}:${rid}:1`),
            policy.draft_ttl_seconds,
          ],
        )
      ).rows[0]!;
      await c.query(
        "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route='import.create' AND key=$2",
        [a.userId, key],
      );
      await c.query(
        "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,'import.create',$2,$3,'completed',$4,$5)",
        [a.userId, key, Buffer.from(h, "hex"), rid, r.expires_at],
      );
      return this.view(r, data);
    });
  }
  async detail(a: VerifiedIdentity, rid: string) {
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid);
      return this.view(r, this.open(r));
    });
  }
  async sources(a: VerifiedIdentity, rid: string, q: unknown) {
    return this.collection(a, rid, q, "sources");
  }
  async candidates(a: VerifiedIdentity, rid: string, q: unknown) {
    return this.collection(a, rid, q, "candidates");
  }
  private async collection(
    a: VerifiedIdentity,
    rid: string,
    q: unknown,
    kind: "sources" | "candidates",
  ) {
    const input = parse(page, q);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r);
      const rows = b[kind]
        .filter((x) => !input.cursor || x.id > input.cursor)
        .sort((x, y) => x.id.localeCompare(y.id));
      return {
        items: rows.slice(0, input.limit).map((x) =>
          kind === "sources"
            ? {
                id: x.id,
                state: x.state,
                version: (x as Source).version,
                expires_at: (x as Source).expires_at,
                error_code: (x as Source).error_code,
              }
            : this.candidateView(b, x as S["ImportCandidate"]),
        ),
        next_cursor:
          rows.length > input.limit ? rows[input.limit - 1]!.id : null,
      };
    });
  }
  async changeMode(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
    key: unknown,
  ) {
    const input = parse(z.object({ expected_version: v, mode }).strict(), body);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r);
      if (this.replay(b, "mode", key, input)) return this.view(r, b);
      this.writable(r);
      this.revision(r, input.expected_version);
      if (r.mode_locked) throw conflict();
      if (input.mode === "private_and_share") await this.cap(c, a);
      r.mode = input.mode;
      for (const x of b.candidates) {
        x.revision++;
        x.confirmation_revision = null;
        x.state = x.state === "removed" ? "removed" : "needs_review";
      }
      await this.save(c, r, b);
      return this.view(r, b);
    });
  }
  async register(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
    key: unknown,
  ) {
    const input = parse(source, body);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r),
        policy = await importPolicy(c);
      const replay = this.replay(b, "source", key, input);
      if (replay) {
        const s = b.sources.find((x) => x.id === replay[0]);
        if (!s) throw missing();
        return this.sourceView(s);
      }
      this.writable(r);
      this.revision(r, input.expected_batch_version);
      if (r.mode_locked || r.policy_version !== policy.version)
        throw conflict();
      const old = b.sources.find((x) => x.client_id === input.client_source_id);
      if (old) {
        if (
          old.mime !== input.mime_type ||
          old.bytes !== input.byte_size ||
          old.width !== input.width ||
          old.height !== input.height
        )
          throw conflict();
        b.replays["source:" + key]!.ids = [old.id];
        await this.save(c, r, b);
        return this.sourceView(old);
      }
      if (
        b.sources.length >= policy.max_images ||
        !policy.supported_mime_types.includes(input.mime_type) ||
        input.byte_size > policy.max_image_bytes ||
        input.width * input.height > policy.max_pixels ||
        b.sources.reduce((s, x) => s + x.bytes, 0) + input.byte_size >
          policy.max_total_bytes
      )
        throw new ApiError(422, "IMPORT_LIMIT", "图片超过导入上限");
      const usage = await c.query(
        `INSERT INTO abasong.import_source_usage(owner_id,usage_day,source_count) VALUES($1,(now() AT TIME ZONE 'UTC')::date,1)
   ON CONFLICT(owner_id,usage_day) DO UPDATE SET source_count=import_source_usage.source_count+1 WHERE import_source_usage.source_count<$2 RETURNING source_count`,
        [a.userId, policy.daily_image_limit],
      );
      if (!usage.rowCount)
        throw new ApiError(429, "IMPORT_DAILY_LIMIT", "今日导入图片已达上限");
      const s: Source = {
        id: randomUUID(),
        client_id: input.client_source_id,
        mime: input.mime_type,
        bytes: input.byte_size,
        width: input.width,
        height: input.height,
        state: "registered",
        version: 1,
        expires_at: new Date(
          Math.min(
            r.expires_at.getTime(),
            Date.now() + policy.source_ttl_seconds * 1000,
          ),
        ).toISOString(),
        error_code: null,
      };
      b.sources.push(s);
      b.replays["source:" + key]!.ids = [s.id];
      await this.save(c, r, b);
      return this.sourceView(s);
    });
  }
  private candidateView(
    b: Body,
    x: S["ImportCandidate"],
  ): S["ImportCandidate"] {
    const plan = b.plans[x.id];
    return { ...x, ...(plan ? { commit_result: plan.result } : {}) };
  }
  private sourceView(s: Source): S["ImportSource"] {
    return {
      id: s.id,
      state: s.state,
      version: s.version,
      expires_at: s.expires_at,
      error_code: s.error_code,
    };
  }
  async extract(
    a: VerifiedIdentity,
    rid: string,
    sid: string,
    body: unknown,
    key: unknown,
  ) {
    const input = parse(extraction, body);
    parse(id, sid);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r);
      const replay = this.replay(b, "extract:" + sid, key, input);
      if (replay)
        return {
          items: b.candidates.filter((x) => replay.includes(x.id)),
          next_cursor: null,
        };
      this.writable(r);
      if (r.mode_locked) throw conflict();
      const s = b.sources.find((x) => x.id === sid);
      if (!s) throw missing();
      if (
        s.version !== input.expected_source_version ||
        s.state === "recognized"
      )
        throw conflict();
      if (Date.parse(s.expires_at) <= Date.now())
        throw new ApiError(422, "IMPORT_EXPIRED", "来源已过期");
      const policy = await importPolicy(c);
      if (r.policy_version !== policy.version) throw conflict();
      if (b.candidates.length + input.candidates.length > policy.max_candidates)
        throw new ApiError(422, "IMPORT_LIMIT", "候选数量超过上限");
      const rows: S["ImportCandidate"][] = input.candidates.map((x) => ({
        id: randomUUID(),
        revision: 1,
        source_ids: [sid],
        address_text: x.address_text,
        apartment_id: null,
        method: x.method,
        value: x.value,
        scope: x.scope ?? {},
        issues: [
          ...(!x.address_text ? ["missing_address" as const] : []),
          ...(!x.value ? ["missing_value" as const] : []),
          "unmatched_apartment",
          ...(x.method !== "keypad" ? ["unsupported_method" as const] : []),
        ],
        state: "needs_review",
        confirmation_revision: null,
      }));
      b.candidates.push(...rows);
      s.version++;
      s.state = "recognized";
      s.recognizer_version = input.recognizer_version;
      b.replays["extract:" + sid + ":" + key]!.ids = rows.map((x) => x.id);
      r.state = "needs_review";
      await this.save(c, r, b);
      return { items: rows, next_cursor: null };
    });
  }
  async edit(
    a: VerifiedIdentity,
    rid: string,
    cid: string,
    body: unknown,
    key: unknown,
  ) {
    const input = parse(edit, body);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r),
        x = this.find(b, cid);
      if (this.replay(b, "edit:" + cid, key, input)) return x;
      this.writable(r);
      if (x.revision !== input.expected_revision || b.plans[cid])
        throw conflict();
      Object.assign(
        x,
        Object.fromEntries(
          Object.entries(input).filter(
            ([k]) => !["expected_revision", "removed"].includes(k),
          ),
        ),
      );
      x.revision++;
      x.confirmation_revision = null;
      x.state = input.removed ? "removed" : "needs_review";
      x.issues = [
        ...(!x.address_text ? ["missing_address" as const] : []),
        ...(!x.value ? ["missing_value" as const] : []),
        ...(!x.apartment_id ? ["unmatched_apartment" as const] : []),
      ];
      await this.save(c, r, b);
      return x;
    });
  }
  async confirm(a: VerifiedIdentity, rid: string, body: unknown, key: unknown) {
    const input = parse(confirm, body);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r);
      const replay = this.replay(b, "confirm", key, input);
      if (replay)
        return {
          items: b.candidates.filter((x) => replay.includes(x.id)),
          next_cursor: null,
        };
      this.writable(r);
      this.revision(r, input.expected_batch_version);
      if (
        new Set(input.items.map((x) => x.candidate_id)).size !==
        input.items.length
      )
        throw conflict();
      const rows = input.items.map((i) => {
        const x = this.find(b, i.candidate_id);
        if (x.revision !== i.expected_revision || b.plans[x.id])
          throw conflict();
        return x;
      });
      for (const x of rows) await this.confirmable(c, x);
      for (const x of rows) {
        x.confirmation_revision = x.revision;
        x.state = "ready";
      }
      b.replays["confirm:" + key]!.ids = rows.map((x) => x.id);
      await this.save(c, r, b);
      return { items: rows, next_cursor: null };
    });
  }
  async confirmOne(
    a: VerifiedIdentity,
    rid: string,
    cid: string,
    body: unknown,
    key: unknown,
  ) {
    const input = parse(
      z
        .object({ expected_revision: v, fields_confirmed: z.literal(true) })
        .strict(),
      body,
    );
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r),
        x = this.find(b, cid);
      if (this.replay(b, "confirmOne:" + cid, key, input)) return x;
      this.writable(r);
      if (x.revision !== input.expected_revision || b.plans[cid])
        throw conflict();
      await this.confirmable(c, x);
      x.state = "ready";
      x.confirmation_revision = x.revision;
      await this.save(c, r, b);
      return x;
    });
  }
  async cancel(a: VerifiedIdentity, rid: string, body: unknown, key: unknown) {
    const input = parse(version, body);
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r);
      if (this.replay(b, "cancel", key, input)) return this.view(r, b);
      this.revision(r, input.expected_version);
      this.writable(r);
      r.state = "cancelled";
      r.generation++;
      await this.save(c, r, b);
      return this.view(r, b);
    });
  }
  async remove(a: VerifiedIdentity, rid: string, body: unknown, key: unknown) {
    const input = parse(version, body);
    parse(id, key);
    parse(id, rid);
    return this.tx(a, async (c) => {
      const route = "import.delete:" + rid,
        hmac = Buffer.from(this.hash(input), "hex");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        a.userId + ":" + route + ":" + key,
      ]);
      const old = (
        await c.query(
          "SELECT request_hmac FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3 AND expires_at>now()",
          [a.userId, route, key],
        )
      ).rows[0];
      if (old) {
        if (
          old.request_hmac.length !== hmac.length ||
          !timingSafeEqual(old.request_hmac, hmac)
        )
          throw conflict();
        return { ok: true };
      }
      const r = await this.get(c, a, rid);
      this.revision(r, input.expected_version);
      if (r.mode_locked) throw conflict();
      await c.query(
        "DELETE FROM abasong.import_batches WHERE id=$1 AND owner_id=$2",
        [rid, a.userId],
      );
      await c.query(
        "DELETE FROM abasong.idempotency_keys WHERE actor_id=$1 AND route=$2 AND key=$3",
        [a.userId, route, key],
      );
      await c.query(
        "INSERT INTO abasong.idempotency_keys(actor_id,route,key,request_hmac,status,response_object_id,expires_at) VALUES($1,$2,$3,$4,'completed',$5,$6)",
        [a.userId, route, key, hmac, rid, r.expires_at],
      );
      return { ok: true };
    });
  }
  async commit(
    a: VerifiedIdentity,
    rid: string,
    body: unknown,
    key: unknown,
  ): Promise<S["ImportCommitResponse"]> {
    const input = parse(commit, body);
    const prep = await this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r),
        replay = this.replay(b, "commit", key, input);
      if (replay)
        return { ids: replay, generation: r.generation, replay: true };
      this.writable(r);
      this.revision(r, input.expected_batch_version);
      if (input.mode !== r.mode) throw conflict();
      if (input.mode === "private_and_share") await this.cap(c, a);
      if (
        new Set(input.items.map((x) => x.candidate_id)).size !==
          input.items.length ||
        new Set(input.items.map((x) => x.client_commit_id)).size !==
          input.items.length
      )
        throw conflict();
      for (const i of input.items) {
        const x = this.find(b, i.candidate_id),
          p = b.plans[x.id];
        if (
          x.revision !== i.confirmed_revision ||
          x.confirmation_revision !== x.revision
        )
          throw conflict();
        if (
          Object.entries(b.plans).some(
            ([cid, p]) => p.clientId === i.client_commit_id && cid !== x.id,
          )
        )
          throw conflict();
        if (p && p.clientId !== i.client_commit_id) throw conflict();
        if (!p) await this.confirmable(c, x);
      }
      for (const i of input.items) {
        if (!b.plans[i.candidate_id])
          b.plans[i.candidate_id] = {
            clientId: i.client_commit_id,
            entryKey: randomUUID(),
            recordKey: randomUUID(),
            shareKey: randomUUID(),
            result: {
              candidate_id: i.candidate_id,
              confirmed_revision: i.confirmed_revision,
              client_commit_id: i.client_commit_id,
              private_status: "not_started",
              private_record_id: null,
              share_status:
                r.mode === "private_only" ? "not_requested" : "not_started",
              contribution_id: null,
              error_code: null,
              retryable: false,
            },
          };
      }
      r.mode_locked = true;
      r.state = "submitting";
      b.replays["commit:" + key]!.ids = input.items.map((x) => x.candidate_id);
      await this.save(c, r, b);
      return {
        ids: input.items.map((x) => x.candidate_id),
        generation: r.generation,
        replay: false,
      };
    });
    if (!prep.replay) {
      for (const cid of prep.ids) {
        for (const phase of ["private", "share"] as const) {
          try {
            await this.tx(a, async (c) => {
              const r = await this.get(c, a, rid),
                b = this.open(r);
              if (r.generation !== prep.generation || r.state === "cancelled")
                return;
              const x = this.find(b, cid),
                p = this.plan(b, cid),
                out = p.result;
              if (phase === "private" && out.private_status !== "saved") {
                await this.confirmable(c, x);
                const entry = await this.apartments.createEntryTx(
                  c,
                  a,
                  x.apartment_id
                    ? { apartment_id: x.apartment_id }
                    : { address: x.address_text },
                  p.entryKey,
                );
                const record = await this.apartments.createRecordTx(
                  c,
                  a,
                  entry.id,
                  { value: x.value, scope_label: x.scope.label ?? "大门" },
                  p.recordKey,
                );
                out.private_status = "saved";
                out.private_record_id = record.id;
                out.error_code = null;
                out.retryable = false;
              } else if (
                phase === "share" &&
                r.mode === "private_and_share" &&
                out.private_status === "saved" &&
                ["not_started", "failed"].includes(out.share_status)
              ) {
                if (!x.apartment_id)
                  throw new ApiError(
                    422,
                    "APARTMENT_REVIEW_REQUIRED",
                    "请先核对公寓",
                  );
                const result = await this.apartments.contributeImportTx(
                  c,
                  a,
                  x.apartment_id,
                  {
                    method: x.method,
                    value: x.value,
                    scope: x.scope,
                    source_attested: true,
                  },
                  p.shareKey,
                );
                out.share_status =
                  result.outcome === "created_active"
                    ? "active"
                    : result.outcome === "created_pending"
                      ? "pending"
                      : "same_value";
                out.contribution_id = result.record_id;
                out.error_code = null;
                out.retryable = false;
              }
              x.state =
                out.private_status === "saved" &&
                (r.mode === "private_only" ||
                  ["active", "pending", "same_value"].includes(
                    out.share_status,
                  ))
                  ? "committed"
                  : "failed";
              await this.save(c, r, b);
            });
          } catch (e) {
            await this.tx(a, async (c) => {
              const r = await this.get(c, a, rid),
                b = this.open(r);
              if (r.generation !== prep.generation || r.state === "cancelled")
                return;
              const p = this.plan(b, cid);
              if (phase === "private") p.result.private_status = "failed";
              else if (
                p.result.private_status === "saved" &&
                r.mode === "private_and_share"
              )
                p.result.share_status = "failed";
              else return;
              p.result.error_code =
                e instanceof ApiError ? e.code : "IMPORT_SAVE_UNAVAILABLE";
              p.result.retryable = !(
                e instanceof ApiError && [400, 403, 404, 422].includes(e.status)
              );
              this.find(b, cid).state = "failed";
              await this.save(c, r, b);
            });
          }
        }
      }
    }
    return this.tx(a, async (c) => {
      const r = await this.get(c, a, rid),
        b = this.open(r);
      if (!prep.replay && r.state !== "cancelled") {
        r.state = b.candidates.some((x) => x.state === "failed")
          ? "partial_failed"
          : b.candidates.every((x) =>
                ["committed", "removed"].includes(x.state),
              )
            ? "completed"
            : "needs_review";
        await this.save(c, r, b);
      }
      return {
        batch: this.view(r, b),
        results: prep.ids.map((cid) => this.plan(b, cid).result),
      };
    });
  }
}
