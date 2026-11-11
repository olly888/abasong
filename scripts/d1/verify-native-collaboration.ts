import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { components } from "../../packages/contracts/src/generated";
import { collaborationSeed } from "../../apps/mobile/src/design/collaboration-seed";
import { createDeliveryWriter } from "../../apps/mobile/src/requests/delivery-writer";
import { createApplicationAttempt } from "../../apps/mobile/src/requests/application-attempt";
import {
  initialApplication,
  applicationInput,
} from "../../apps/mobile/src/requests/application-input";
type S = components["schemas"];
type R = S["RequestDetailV2"];
type Actor = "owner" | "driver";
let calls = 0,
  assertions = 0;
function ok(v: unknown) {
  assert(v);
  assertions++;
}
async function http<T>(
  actor: Actor,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  },
): Promise<T> {
  const r = await fetch("http://127.0.0.1:3028" + path, {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Abasong-Test-Actor": actor,
      ...(options?.key ? { "Idempotency-Key": options.key } : {}),
    },
    body:
      options?.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options?.signal ?? AbortSignal.timeout(15000),
  });
  calls++;
  const v = await r.json();
  if (!r.ok)
    throw Object.assign(new Error("TEST_HTTP"), {
      status: r.status,
      code: v.code,
    });
  return v as T;
}
async function main() {
  const own = <T>(p: string, o?: Parameters<typeof http>[2]) =>
    http<T>("owner", p, o);
  const drive = <T>(p: string, o?: Parameters<typeof http>[2]) =>
    http<T>("driver", p, o);
  const f = await own<{
    owner: string;
    driver: string;
    region: string;
    pickup: string;
    isolated: boolean;
  }>("/fixture");
  ok(f.isolated);
  const stats = () =>
    own<{ applications: number; messages: number }>("/fixture/snapshot");
  const arm = (operation: string) =>
    own("/fixture/control", {
      method: "POST",
      body: { action: "fault", operation, after: true },
    });
  const rejects = async (
    p: Promise<unknown>,
    status: number,
    code?: string,
  ) => {
    await assert.rejects(
      p,
      (e: unknown) =>
        !!e &&
        typeof e === "object" &&
        "status" in e &&
        e.status === status &&
        (!code || ("code" in e && e.code === code)),
    );
    assertions++;
  };
  const writer = createDeliveryWriter(own, randomUUID),
    body = collaborationSeed(f);
  let r = await writer.save(body, true);
  const old = r,
    fields = initialApplication(r),
    before = await stats();
  r = await writer.save({ ...body, price_cents: 186 }, true);
  await rejects(
    drive(`/v1/requests/${r.id}/applications`, {
      method: "POST",
      body: applicationInput(old, fields.date, fields.time, fields.capacity),
      key: randomUUID(),
    }),
    409,
    "VERSION_CONFLICT",
  );
  ok((await stats()).applications === before.applications);
  let attempts = 0;
  const stale = createApplicationAttempt(
    old,
    async <T>(p: string, o?: Parameters<typeof drive>[1]) => {
      attempts++;
      return drive<T>(p, o);
    },
    randomUUID,
  );
  await assert.rejects(stale(r, fields.date, fields.time, fields.capacity));
  assertions++;
  ok(attempts === 0);
  const submit = createApplicationAttempt(r, drive, randomUUID),
    current = initialApplication(r);
  await arm("apply");
  await rejects(submit(r, current.date, current.time, current.capacity), 503);
  const a = await submit(r, current.date, current.time, current.capacity);
  ok(!!a);
  const cid = a!.conversation_id,
    messages = `/v1/conversations/${cid}/messages`,
    meta = `/v1/conversations/${cid}`;
  ok((await stats()).applications === before.applications + 1);
  const remaining = (await own<R>(`/v1/requests/${r.id}`)).remaining_drivers;
  ok(remaining === r.remaining_drivers);
  let page = await drive<S["MessagePage"]>(messages + "?limit=100");
  const card = page.items.find((m) => m.kind === "request_card")!;
  ok(!!card);
  ok(
    card.request_snapshot?.version === r.version &&
      card.request_snapshot.price_cents === 186,
  );
  ok(!JSON.stringify(card.request_snapshot).includes("100 TEST"));
  ok(
    !("pickup" in card.request_snapshot!) &&
      !("private_meeting_point" in card.request_snapshot!),
  );
  r = await writer.save({ ...body, price_cents: 190 }, true);
  page = await drive<S["MessagePage"]>(messages + "?limit=100");
  ok(
    page.items.find((m) => m.id === card.id)?.request_snapshot?.price_cents ===
      186,
  );
  ok((await drive<R>(`/v1/requests/${r.id}`)).price_cents === 190);
  const key = randomUUID(),
    mb = { client_message_id: key, kind: "text", text: "TEST R4-12 retry" };
  const n = (await stats()).messages;
  await arm("message");
  await rejects(drive(messages, { method: "POST", body: mb, key }), 503);
  const sent = await drive<S["Message"]>(messages, {
    method: "POST",
    body: mb,
    key,
  });
  ok(sent.text === mb.text);
  ok((await stats()).messages === n + 1);
  const replay = await drive<S["Message"]>(messages, {
    method: "POST",
    body: mb,
    key,
  });
  ok(replay.id === sent.id);
  await rejects(
    drive(messages, {
      method: "POST",
      body: { ...mb, text: "TEST changed" },
      key,
    }),
    409,
    "IDEMPOTENCY_CONFLICT",
  );
  ok(
    (await drive<S["Conversation"]>(meta)).other_last_read_sequence <
      sent.sequence,
  );
  await arm("read");
  await rejects(
    own(meta + "/read", {
      method: "PUT",
      body: { last_read_sequence: sent.sequence },
    }),
    503,
  );
  await own(meta + "/read", {
    method: "PUT",
    body: { last_read_sequence: sent.sequence },
  });
  ok(
    (await drive<S["Conversation"]>(meta)).other_last_read_sequence ===
      sent.sequence,
  );
  await own(meta + "/read", { method: "PUT", body: { last_read_sequence: 0 } });
  ok(
    (await drive<S["Conversation"]>(meta)).other_last_read_sequence ===
      sent.sequence,
  );
  await rejects(
    own(meta + "/read", {
      method: "PUT",
      body: { last_read_sequence: 9999999 },
    }),
    400,
    "INVALID_SEQUENCE",
  );
  r = await own<R>(`/v1/requests/${r.id}/gap`, {
    method: "PATCH",
    body: {
      request_schema_version: 2,
      expected_version: r.version,
      remaining_drivers: 1,
    },
  });
  ok(r.remaining_drivers === 1);
  r = await own<R>(`/v1/requests/${r.id}/close`, {
    method: "POST",
    body: { expected_version: r.version, status: "found" },
    key: randomUUID(),
  });
  ok(r.status === "found");
  await rejects(
    drive(`/v1/requests/${r.id}/applications`, {
      method: "POST",
      body: {
        ...applicationInput(r, current.date, current.time, current.capacity),
      },
      key: randomUUID(),
    }),
    409,
    "REQUEST_ENDED",
  );
  ok((await drive<S["Conversation"]>(meta)).can_send);
  ok(
    (await drive<S["MessagePage"]>(messages + "?limit=100")).items.some(
      (m) => m.id === sent.id,
    ),
  );
  await own("/fixture/control", {
    method: "POST",
    body: { action: "block", enabled: true },
  });
  ok(!(await drive<S["Conversation"]>(meta)).can_send);
  page = await drive<S["MessagePage"]>(messages + "?limit=100");
  ok(page.items.some((m) => m.id === sent.id && m.text === mb.text));
  ok(
    page.items
      .filter((m) => m.kind === "request_card")
      .every((m) => m.request_snapshot === null),
  );
  const blockedKey = randomUUID();
  await rejects(
    drive(messages, {
      method: "POST",
      body: { ...mb, client_message_id: blockedKey },
      key: blockedKey,
    }),
    403,
    "CONVERSATION_READ_ONLY",
  );
  ok((await stats()).messages === n + 1);
  await own("/fixture/control", {
    method: "POST",
    body: { action: "block", enabled: false },
  });
  ok((await drive<S["Conversation"]>(meta)).can_send);
  ok(
    (await drive<S["MessagePage"]>(messages + "?limit=100")).items.find(
      (m) => m.id === card.id,
    )?.request_snapshot?.price_cents === 186,
  );
  console.log(
    `PASS: R4-12 ${assertions} actual-service assertions / ${calls} HTTP calls; application version/idempotency, immutable safe source, lost message/read response, monotonic watermark, manual gap/close, block/read-only and history. TEST only.`,
  );
}
void main().catch((e: unknown) => {
  if (e instanceof Error)
    for (const frame of e.stack
      ?.split("\n")
      .filter(
        (x) =>
          x.trim().startsWith("at ") &&
          x.includes("/scripts/d1/verify-native-collaboration.ts:"),
      ) ?? [])
      console.error(frame.trim());
  if (e && typeof e === "object" && "status" in e)
    console.error(
      JSON.stringify({
        status: e.status,
        code: "code" in e ? e.code : undefined,
      }),
    );
  console.error("R4-12 verification failed; private details omitted.");
  process.exitCode = 1;
});
