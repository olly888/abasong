import { localDateTime } from "../../apps/mobile/src/requests/presentation";
import { createApplicationAttempt } from "../../apps/mobile/src/requests/application-attempt";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { components } from "../../packages/contracts/src/generated";
import { deliveryFixture } from "../../apps/mobile/src/requests/delivery-fixtures";
import {
  hydrateDelivery,
  deliveryInput,
} from "../../apps/mobile/src/requests/delivery-fields";
import { createDeliveryWriter } from "../../apps/mobile/src/requests/delivery-writer";
import {
  initialApplication,
  applicationInput,
} from "../../apps/mobile/src/requests/application-input";
import {
  availabilityFields,
  availabilityPayload,
} from "../../apps/mobile/src/drivers/availability-fields";
type S = components["schemas"];
type R = S["RequestDetailV2"];
type Actor = "owner" | "driver";
let calls = 0,
  assertions = 0;
function ok(value: unknown) {
  assert(value);
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
  const f = await http<{
    owner: string;
    driver: string;
    region: string;
    pickup: string;
    isolated: boolean;
  }>("owner", "/fixture");
  ok(f.isolated);
  const own = <T>(p: string, o?: Parameters<typeof http>[2]) =>
    http<T>("owner", p, o);
  const drive = <T>(p: string, o?: Parameters<typeof http>[2]) =>
    http<T>("driver", p, o);
  const stats = () =>
    own<{ requests: number; applications: number; messages: number }>(
      "/fixture/snapshot",
    );
  const arm = (operation: string) =>
    own("/fixture/control", {
      method: "POST",
      body: { action: "fault", operation, after: true },
    });
  const input = (scenario: R["scenario"]) => {
    const seed = deliveryFixture(scenario);
    seed.region_id = f.region;
    seed.pickup_region_id = f.pickup;
    if (seed.pickup?.kind === "warehouse")
      seed.pickup = {
        ...seed.pickup,
        address_line1: "100 TEST Ave",
        city: "TEST City",
        postal_code: "90000",
        address_source: "provider_permanent",
      };
    const state = hydrateDelivery(seed, true).fields;
    state.route = "TEST AUTO EXIT";
    if (scenario === "delivery_handoff") {
      state.quantityMode = "unknown";
      state.quantity = "";
    } else {
      const start = localDateTime(null, Date.now() + 30 * 60000);
      state.date = start.date;
      state.start = start.time;
    }
    return deliveryInput(scenario, state, true);
  };
  const start = await stats(),
    body = input("warehouse_shortage"),
    writer = createDeliveryWriter(own, randomUUID);
  await arm("create");
  await assert.rejects(
    writer.save(body, true),
    (e: unknown) =>
      !!e && typeof e === "object" && "status" in e && e.status === 503,
  );
  assertions++;
  ok((await stats()).requests === start.requests + 1);
  let r = await writer.save(body, true);
  ok(r.status === "open");
  ok((await stats()).requests === start.requests + 1);
  ok(r.pickup?.kind === "warehouse" && r.pickup.point !== null);
  const initial = initialApplication(r),
    ab = applicationInput(r, initial.date, initial.time, initial.capacity),
    ak = randomUUID();
  await arm("apply");
  await assert.rejects(
    drive(`/v1/requests/${r.id}/applications`, {
      method: "POST",
      body: ab,
      key: ak,
    }),
  );
  assertions++;
  const applied = await drive<S["Application"]>(
    `/v1/requests/${r.id}/applications`,
    { method: "POST", body: ab, key: ak },
  );
  ok((await stats()).applications === start.applications + 1);
  ok(!!applied.conversation_id);
  const messagePath = `/v1/conversations/${applied.conversation_id}/messages`,
    mk = randomUUID(),
    mb = {
      client_message_id: mk,
      kind: "text",
      text: "TEST 合成消息🙂",
    };
  await arm("message");
  await assert.rejects(
    drive(messagePath, { method: "POST", body: mb, key: mk }),
  );
  assertions++;
  const message = await drive<S["Message"]>(messagePath, {
    method: "POST",
    body: mb,
    key: mk,
  });
  ok(message.text === mb.text);
  ok((await stats()).messages === start.messages + 1);
  await own(`/v1/conversations/${applied.conversation_id}/read`, {
    method: "PUT",
    body: { last_read_sequence: message.sequence },
  });
  const meta = await drive<S["Conversation"]>(
    `/v1/conversations/${applied.conversation_id}`,
  );
  ok(meta.other_last_read_sequence >= message.sequence);
  const b2 = {
    ...body,
    pickup:
      body.pickup?.kind === "warehouse"
        ? { ...body.pickup, address_line1: "200 TEST Ave" }
        : body.pickup,
  };
  r = await writer.save(b2, true);
  ok(
    r.pickup?.kind === "warehouse" &&
      r.pickup.address_line1 === "200 TEST Ave" &&
      r.pickup.address_version === 2,
  );
  await assert.rejects(
    own(`/v1/requests/${r.id}/gap`, {
      method: "PATCH",
      body: {
        request_schema_version: 2,
        expected_version: r.version - 1,
        remaining_drivers: 1,
      },
    }),
    (e: unknown) =>
      !!e && typeof e === "object" && "status" in e && e.status === 409,
  );
  assertions++;
  r = await own<R>(`/v1/requests/${r.id}/gap`, {
    method: "PATCH",
    body: {
      request_schema_version: 2,
      expected_version: r.version,
      remaining_drivers: 1,
    },
  });
  ok(r.remaining_drivers === 1);
  await own("/fixture/control", {
    method: "POST",
    body: { action: "qualification", enabled: false },
  });
  await assert.rejects(
    own("/v1/requests", { method: "POST", body, key: randomUUID() }),
    (e: unknown) =>
      !!e && typeof e === "object" && "status" in e && e.status === 403,
  );
  assertions++;
  r = await own<R>(`/v1/requests/${r.id}/close`, {
    method: "POST",
    body: { expected_version: r.version, status: "found" },
    key: randomUUID(),
  });
  ok(r.status === "found");
  const page = await drive<S["RequestPageV2"]>(
    "/v1/requests?request_schema_version=2&limit=100",
  );
  ok(!page.items.some((x) => x.id === r.id));
  ok(
    (
      await drive<S["Conversation"]>(
        `/v1/conversations/${applied.conversation_id}`,
      )
    ).can_send,
  );
  await own("/fixture/control", {
    method: "POST",
    body: { action: "qualification", enabled: true },
  });
  const handoffWriter = createDeliveryWriter(own, randomUUID);
  const handoffInput = input("delivery_handoff");
  const handoffDraft = await handoffWriter.save(handoffInput, false);
  ok(handoffDraft.status === "draft");
  ok(
    handoffDraft.quantity_mode === "unknown" &&
      handoffDraft.parcel_count === null,
  );
  const handoff = await handoffWriter.save(handoffInput, true);
  ok(handoff.id === handoffDraft.id && handoff.status === "open");
  ok(handoff.pickup?.kind === "contact_handoff");
  ok(handoff.quantity_mode === "unknown" && handoff.parcel_count === null);
  const seen = await drive<R>(`/v1/requests/${handoff.id}`);
  const planned = initialApplication(seen);
  const apply = createApplicationAttempt(seen, drive, randomUUID);
  await arm("apply");
  await assert.rejects(apply(seen, planned.date, planned.time, ""));
  assertions++;
  const handoffApplication = await apply(seen, planned.date, planned.time, "");
  ok(handoffApplication?.capacity_parcels === null);
  ok(handoffApplication?.conversation_id === applied.conversation_id);
  const myHandoff = await drive<S["ApplicationPage"]>(
    `/v1/me/applications?request_id=${handoff.id}&limit=1`,
  );
  ok(
    myHandoff.items.length === 1 &&
      myHandoff.items[0]?.id === handoffApplication?.id,
  );
  const hf = hydrateDelivery(handoff, true).fields,
    copied = await createDeliveryWriter(own, randomUUID).save(
      deliveryInput(handoff.scenario, hf, true),
      true,
    );
  ok(copied.id !== handoff.id);
  const a = availabilityFields(null);
  a.enabled = true;
  a.regions = [f.region];
  a.capacity = "";
  const av = await drive<S["Availability"]>("/v1/me/availability", {
    method: "PUT",
    body: availabilityPayload(a, 0),
  });
  ok(av.enabled && av.capacity_parcels === null);
  const off = await drive<S["Availability"]>("/v1/me/availability", {
    method: "PUT",
    body: availabilityPayload(
      { ...a, enabled: false, date: "bad" },
      av.version,
    ),
  });
  ok(!off.enabled);
  for (const item of [handoff, copied])
    await own(`/v1/requests/${item.id}/close`, {
      method: "POST",
      body: { expected_version: item.version, status: "closed" },
      key: randomUUID(),
    });
  console.log(
    `PASS: R4-10 ${assertions} actual-service assertions / ${calls} HTTP calls using mobile fields/writer; lost responses deduped, source/read state, address versions, qualification, close, unknown quantity, copy and availability; TEST only.`,
  );
}
void main().catch((e) => {
  if (e instanceof Error)
    for (const frame of e.stack
      ?.split("\n")
      .filter(
        (x) =>
          x.trim().startsWith("at ") &&
          x.includes("/scripts/d1/verify-native-exit.ts:"),
      ) ?? [])
      console.error(frame.trim());
  console.error("Native exit verification failed; private details omitted.");
  process.exitCode = 1;
});
