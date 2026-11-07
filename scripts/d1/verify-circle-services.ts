import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { PushDispatcher } from "../../apps/worker/src/push-dispatcher";
import type { PushPayload } from "../../apps/worker/src/push-provider";

type S = components["schemas"];
type Http = (
  path: string,
  method?: string,
  token?: string,
  status?: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;
export async function verifyCircleServices(
  args: Parameters<typeof checkCircle>[0],
) {
  try {
    return await checkCircle(args);
  } catch (e) {
    const code =
      e &&
      typeof e === "object" &&
      "code" in e &&
      /^[A-Z0-9_]{3,40}$/.test(String(e.code))
        ? e.code
        : "unknown";
    console.error(
      "Circle verification failed",
      code,
      e instanceof Error
        ? e.stack
            ?.split("\n")
            .find(
              (line) =>
                line.trim().startsWith("at ") &&
                line.includes("verify-circle-services.ts") &&
                !line.includes("at check ("),
            )
        : undefined,
    );
    throw e;
  }
}
async function checkCircle({
  db,
  http,
  auth,
  other,
  noRights,
  owner,
  reader,
  region,
  workerUrl,
}: {
  db: Client;
  http: Http;
  auth: string;
  other: string;
  noRights: string;
  owner: string;
  reader: string;
  region: string;
  workerUrl: string;
}) {
  const call = async <T>(...args: Parameters<Http>) =>
    (await http(...args)) as T;
  const create = (
    body: unknown,
    key = randomUUID(),
    token = auth,
    status = 201,
  ) => call<S["Post"]>("/v1/posts", "POST", token, status, body, key);
  const list = (token: string, mine = false, suffix = "") =>
    call<S["PostPage"]>(`/v1/${mine ? "me/" : ""}posts${suffix}`, "GET", token);
  const notices = async (token: string) =>
    (
      await call<S["NotificationPage"]>(
        "/v1/me/notifications?limit=100",
        "GET",
        token,
      )
    ).items.filter((n) => n.kind === "circle_reply");
  let assertions = 0;
  function check(value: boolean) {
    assert(value, `circle assertion ${assertions + 1}`);
    assertions++;
  }
  await http("/v1/posts", "GET", "", 401);
  await http("/v1/posts?cursor=bad", "GET", auth, 400);
  await create({ body: "  " }, randomUUID(), auth, 400);
  await create({ body: "a".repeat(2001) }, randomUUID(), auth, 400);
  await create({ body: "TEST", images: [] }, randomUUID(), auth, 400);
  await create(
    { body: "TEST", region_id: randomUUID() },
    randomUUID(),
    auth,
    400,
  );
  await create({ body: "TEST 门禁码：＃１２３４" }, randomUUID(), auth, 422);
  const source = (
    await db.query<{ id: string }>(
      `INSERT INTO abasong.requests(publisher_id,kind,status,region_id,pickup_region_id,pickup_area,price_cents,price_unit,starts_at,expires_at)
     VALUES($1,'other_help','open',$2,$2,'TEST private pickup sentinel',100,'per_parcel',now(),now()+interval '1 hour') RETURNING id`,
      [owner, region],
    )
  ).rows[0]!;
  await create(
    { body: "TEST other owner", request_id: source.id },
    randomUUID(),
    other,
    404,
  );
  const input = {
    body: "TEST circle lesson",
    topic: "experience",
    region_id: region,
    request_id: source.id,
  };
  const key = randomUUID();
  const [post, replay] = await Promise.all([
    create(input, key),
    create(input, key),
  ]);
  check(
    post.id === replay.id &&
      post.region?.id === region &&
      post.topic === "experience",
  );
  check(
    post.request?.id === source.id &&
      post.request.price_cents === 100 &&
      post.reply_count === 0,
  );
  check(
    !JSON.stringify(post).includes("private pickup sentinel") &&
      Object.keys(post.author).length === 2,
  );
  await create({ ...input, body: "TEST changed intent" }, key, auth, 409);
  const plain = await create(
    { body: "TEST general question" },
    randomUUID(),
    noRights,
  );
  check(plain.region === null && !plain.has_request && plain.request === null);
  check(
    (await list(auth, true)).items.every((p) => p.author.user_id === owner),
  );
  await db.query(
    `UPDATE abasong.posts SET created_at=CASE WHEN id=$1 THEN '2026-11-05 10:00:00.000987Z'::timestamptz
    ELSE '2026-11-05 10:00:00.000123Z'::timestamptz END WHERE id IN($1,$2)`,
    [post.id, plain.id],
  );
  const first = await list(other, false, "?limit=1");
  check(first.items[0]?.id === post.id && !!first.next_cursor);
  const second = await list(
    other,
    false,
    "?limit=1&cursor=" + encodeURIComponent(first.next_cursor!),
  );
  check(second.items[0]?.id === plain.id);
  const detail = "/v1/posts/" + post.id,
    replies = detail + "/comments";
  await db.query(
    "UPDATE abasong.requests SET price_cents=245,status='found' WHERE id=$1",
    [source.id],
  );
  const updated = await call<S["Post"]>(detail, "GET", other);
  check(
    updated.request?.price_cents === 245 && updated.request?.status === "found",
  );
  await db.query("UPDATE abasong.requests SET status='draft' WHERE id=$1", [
    source.id,
  ]);
  const removedSource = await call<S["Post"]>(detail, "GET", other);
  check(removedSource.has_request && removedSource.request === null);
  await create(
    { body: "TEST draft reference", request_id: source.id },
    randomUUID(),
    auth,
    422,
  );
  await http(detail, "DELETE", other, 404);
  const reply = (
    t: string,
    message: string,
    attempt = randomUUID(),
    status = 201,
  ) =>
    call<S["Comment"]>(replies, "POST", t, status, { body: message }, attempt);
  await reply(other, " ", randomUUID(), 400);
  await reply(other, "TEST Access Code = 1234", randomUUID(), 422);
  const replyKey = randomUUID();
  const [comment, repeat] = await Promise.all([
    reply(other, "TEST peer reply", replyKey),
    reply(other, "TEST peer reply", replyKey),
  ]);
  check(comment.id === repeat.id);
  await reply(other, "TEST changed reply", replyKey, 409);
  await reply(auth, "TEST self reply");
  const n = (await notices(auth))[0]!;
  check(
    n.comment_id === comment.id &&
      n.object_id === post.id &&
      n.object_type === "post" &&
      n.read_at === null,
  );
  check(
    (await notices(auth)).length === 1 && (await notices(other)).length === 0,
  );
  check(
    Object.keys(n).every((x) =>
      [
        "id",
        "kind",
        "object_type",
        "object_id",
        "comment_id",
        "read_at",
        "created_at",
      ].includes(x),
    ),
  );
  check((await call<S["Post"]>(detail, "GET", auth)).reply_count === 2);
  const reportKey = randomUUID();
  const reportData = {
    object_type: "comment",
    object_id: comment.id,
    reason: "TEST report",
  };
  const report = await call<S["Report"]>(
    "/v1/reports",
    "POST",
    auth,
    201,
    reportData,
    reportKey,
  );
  check(
    report.id ===
      (
        await call<S["Report"]>(
          "/v1/reports",
          "POST",
          auth,
          201,
          reportData,
          reportKey,
        )
      ).id,
  );
  await http("/v1/reports", "POST", other, 400, reportData, randomUUID());
  await http("/v1/comments/" + comment.id, "DELETE", auth, 404);
  await http("/v1/me/notifications/" + n.id + "/read", "PUT", other, 404);

  const worker = new Pool({ connectionString: workerUrl, max: 1 });
  try {
    await assert.rejects(
      worker.query("SELECT body FROM abasong.posts LIMIT 1"),
      { code: "42501" },
    );
    await assert.rejects(
      worker.query("SELECT body FROM abasong.comments LIMIT 1"),
      { code: "42501" },
    );
    assertions += 2;
    const token = "ExpoPushToken[TEST_CIRCLE_DEVICE]";
    await db.query(
      `INSERT INTO abasong.devices(user_id,installation_id,platform,enabled,push_token,lease_until)
       VALUES($1,$2,'ios',true,$3,now()+interval '1 hour')`,
      [owner, randomUUID(), token],
    );
    await http("/v1/me/notification-preferences", "PUT", auth, 200, {
      chat_push: false,
      request_push: false,
      system_push: true,
    });
    const sent: PushPayload[] = [];
    const dispatcher = new PushDispatcher(worker, {
      send: async (destination, payload) => {
        if (destination === token && payload.data.kind === "post")
          sent.push(payload);
        return "TEST_RECEIPT";
      },
      receipt: async () => "ok",
    });
    for (let i = 0; i < 20 && !sent.length; i++) await dispatcher.tick();
    if (!sent.length) {
      const state = await db.query(
        `SELECT o.status AS event_status,d.status AS delivery_status,d.error_code
         FROM abasong.outbox o LEFT JOIN abasong.push_deliveries d ON d.outbox_id=o.id
         WHERE o.event_type='circle_reply' AND o.object_id=$1`,
        [post.id],
      );
      console.error("TEST push states", state.rows);
    }
    check(
      sent.length === 1 &&
        sent[0]!.data.object_id === post.id &&
        sent[0]!.body === "你的司机圈动态有新回复" &&
        Object.keys(sent[0]!.data).length === 4,
    );
    await http("/v1/me/notifications/" + n.id + "/read", "PUT", auth);
    check((await notices(auth))[0]?.read_at !== null);
    const toRemove = await reply(other, "TEST deleted reply");
    await http("/v1/comments/" + toRemove.id, "DELETE", other);
    await http("/v1/comments/" + toRemove.id, "DELETE", other);
    await reply(other, "TEST blocked reply");
    const block = "/v1/me/blocks/" + reader;
    await http(block, "PUT", auth);
    const ownBlocks = await call<S["BlockedUserPage"]>(
      "/v1/me/blocks",
      "GET",
      auth,
    );
    const peerBlocks = await call<S["BlockedUserPage"]>(
      "/v1/me/blocks",
      "GET",
      other,
    );
    check(
      ownBlocks.items.some((user) => user.user_id === reader) &&
        peerBlocks.items.every((user) => user.user_id !== owner),
    );

    check((await call<S["Post"]>(detail, "GET", auth)).reply_count === 1);
    check(
      (await call<S["CommentPage"]>(replies, "GET", auth)).items.every(
        (c) => c.author.user_id === owner,
      ),
    );
    check(
      (await notices(auth)).length === 0 &&
        (await list(other)).items.every((p) => p.id !== post.id),
    );
    await http(detail, "GET", other, 404);
    await http(replies, "GET", other, 404);
    await reply(other, "TEST peer reply", replyKey, 404);
    await reply(other, "TEST no longer visible", randomUUID(), 404);
    await http("/v1/me/notifications/" + n.id + "/read", "PUT", auth, 404);
    await http("/v1/reports", "POST", auth, 404, reportData, randomUUID());
    for (let i = 0; i < 3; i++) await dispatcher.tick();
    check(sent.length === 1);
    await http(block, "DELETE", auth);
    check((await notices(auth)).length === 2);
    await http(detail, "DELETE", auth);
    await http(detail, "DELETE", auth);
    await http(detail, "GET", auth, 404);
    await reply(other, "TEST no reply to deleted post", randomUUID(), 404);
    check((await notices(auth)).length === 0);
    check(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM abasong.outbox WHERE event_type='circle_reply' AND object_id=$1
       AND jsonb_typeof(payload)='object' AND payload ? 'comment_id' AND payload-'comment_id'='{}'`,
          [post.id],
        )
      ).rows[0].n === 3,
    );
  } finally {
    await worker.end();
  }
  console.log(
    `PASS: B5-03 circle text, permission, notification, provider and storage checks (${assertions} assertions).`,
  );
  return assertions;
}
