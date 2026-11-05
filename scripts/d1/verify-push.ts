import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import { PushDispatcher } from "../../apps/worker/src/push-dispatcher";
import {
  PushFailure,
  type PushPayload,
} from "../../apps/worker/src/push-provider";
type S = components["schemas"];
type Http = (
  path: string,
  method?: string,
  token?: string,
  status?: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;
export async function verifyPush(p: {
  db: Client;
  http: Http;
  auth: string;
  other: string;
  strangerToken: string;
  owner: string;
  reader: string;
  stranger: string;
  body: Record<string, unknown>;
  workerUrl: string;
  runtimeUrl: string;
}) {
  const { db, http, auth, other, owner, reader } = p;
  const call = async <T>(...args: Parameters<Http>) =>
    (await http(...args)) as T;
  const draft = await call<S["Request"]>(
    "/v1/requests",
    "POST",
    auth,
    201,
    p.body,
    randomUUID(),
  );
  await http(
    `/v1/requests/${draft.id}/publish`,
    "POST",
    auth,
    200,
    { expected_version: draft.version },
    randomUUID(),
  );
  const request = await call<S["Request"]>(
    `/v1/requests/${draft.id}`,
    "GET",
    auth,
  );
  const conversation = await call<S["Conversation"]>(
    "/v1/conversations",
    "POST",
    other,
    201,
    {
      other_user_id: owner,
      source_request_id: request.id,
      source_request_version: request.version,
    },
    randomUUID(),
  );
  // Removed from the first version: no special meeting endpoints remain.
  await http(
    `/v1/requests/${request.id}/meeting-shares`,
    "POST",
    auth,
    404,
    { details: "TEST" },
    randomUUID(),
  );
  await http(
    `/v1/requests/${request.id}/meeting-shares/${conversation.id}`,
    "GET",
    other,
    404,
  );
  await http(
    `/v1/requests/${request.id}/meeting-shares/${conversation.id}`,
    "DELETE",
    auth,
    404,
    { expected_share_version: 1 },
  );
  await http(
    `/v1/conversations/${conversation.id}/meeting-shares`,
    "GET",
    other,
    404,
  );
  const apiDb = new Client({ connectionString: p.runtimeUrl }),
    worker = new Pool({ connectionString: p.workerUrl, max: 1 });
  await apiDb.connect();
  try {
    assert.equal(
      (
        await db.query(
          "SELECT has_table_privilege('abasong_sensitive','abasong.meeting_share_secrets','SELECT') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await http("/v1/device-installations/revoke", "POST", "", 400, {
      installation_id: randomUUID(),
      installation_secret: randomBytes(32).toString("hex"),
      binding_version: 2147483648,
    });
    await assert.rejects(
      apiDb.query("SELECT * FROM abasong.meeting_share_secrets"),
    );
    await assert.rejects(
      worker.query("SELECT * FROM abasong.meeting_share_secrets"),
    );
    await assert.rejects(
      apiDb.query("UPDATE abasong.meeting_shares SET revoked_at=NULL"),
    );
    const installation = {
      installation_id: randomUUID(),
      installation_secret: randomBytes(32).toString("hex"),
      platform: "ios",
      enabled: true,
      push_token: "ExpoPushToken[TEST_PUSHTOKEN_1234]",
    };
    const device = await call<S["Device"]>(
      "/v1/me/devices",
      "POST",
      other,
      201,
      installation,
      randomUUID(),
    );
    assert(
      !JSON.stringify(device).includes(installation.push_token) &&
        !JSON.stringify(device).includes(installation.installation_secret),
    );
    await http(
      "/v1/me/devices",
      "POST",
      auth,
      409,
      { ...installation, installation_secret: randomBytes(32).toString("hex") },
      randomUUID(),
    );
    await http(`/v1/me/devices/${device.id}`, "DELETE", auth);
    assert(
      (
        await db.query("SELECT enabled FROM abasong.devices WHERE id=$1", [
          device.id,
        ])
      ).rows[0].enabled,
    );
    await http("/v1/me/notification-preferences", "PUT", other, 200, {
      chat_push: true,
      request_push: true,
      system_push: true,
    });
    await db.query(
      "UPDATE abasong.outbox SET status='done',completed_at=now()",
    ); // isolate this delivery batch from earlier tested events
    const sent: PushPayload[] = [],
      receipts: string[] = [];
    let fail: PushFailure | null = null;
    const dispatcher = new PushDispatcher(worker, {
      send: async (_token, payload) => {
        if (fail) throw fail;
        sent.push(payload);
        return "TEST-ticket-" + randomUUID();
      },
      receipt: async (ticket) => {
        receipts.push(ticket);
        return "ok";
      },
    });
    const message = () =>
      call<S["Message"]>(
        `/v1/conversations/${conversation.id}/messages`,
        "POST",
        auth,
        201,
        {
          kind: "text",
          client_message_id: randomUUID(),
          text: "TEST · 不得出现在通知预览",
        },
        randomUUID(),
      );
    const m = await message();
    await dispatcher.tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.data.owner_id, reader);
    assert.equal(sent[0]!.data.object_id, conversation.id);
    assert(!JSON.stringify(sent).includes("不得出现在通知预览"));
    assert.equal(receipts.length, 0);
    let delivery = (
      await db.query(
        "SELECT d.* FROM abasong.push_deliveries d JOIN abasong.outbox o ON o.id=d.outbox_id WHERE o.object_id=$1",
        [m.id],
      )
    ).rows[0];
    assert.equal(delivery.status, "accepted");
    await db.query(
      "UPDATE abasong.push_deliveries SET available_at=now(),accepted_at=now()-interval '16 minutes' WHERE id=$1",
      [delivery.id],
    );
    await dispatcher.tick();
    assert.equal(receipts.length, 1);
    assert.equal(
      (
        await db.query(
          "SELECT status FROM abasong.push_deliveries WHERE id=$1",
          [delivery.id],
        )
      ).rows[0].status,
      "provider_delivered",
    );
    await dispatcher.tick();
    assert.equal(sent.length, 1);
    await http("/v1/me/notification-preferences", "PUT", other, 200, {
      chat_push: false,
      request_push: true,
      system_push: true,
    });
    const muted = await message();
    await dispatcher.tick();
    assert.equal(sent.length, 1);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM abasong.push_deliveries d JOIN abasong.outbox o ON o.id=d.outbox_id WHERE o.object_id=$1",
          [muted.id],
        )
      ).rows[0].n,
      0,
    );
    await http("/v1/me/notification-preferences", "PUT", other, 200, {
      chat_push: true,
      request_push: true,
      system_push: true,
    });
    const blocked = await message();
    await db.query(
      "INSERT INTO abasong.blocks(blocker_id,blocked_id) VALUES($1,$2)",
      [reader, owner],
    );
    await dispatcher.tick();
    assert.equal(sent.length, 1);
    await db.query(
      "DELETE FROM abasong.blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [reader, owner],
    );
    assert.equal(
      (
        await db.query("SELECT status FROM abasong.outbox WHERE object_id=$1", [
          blocked.id,
        ])
      ).rows[0].status,
      "done",
    );
    const queued = await message();
    const event = (
      await db.query("SELECT id FROM abasong.outbox WHERE object_id=$1", [
        queued.id,
      ])
    ).rows[0];
    await db.query(
      "INSERT INTO abasong.push_deliveries(outbox_id,device_id,target_user_id,binding_version) VALUES($1,$2,$3,$4)",
      [event.id, device.id, reader, device.binding_version],
    );
    const rebound = await call<S["Device"]>(
      "/v1/me/devices",
      "POST",
      auth,
      201,
      installation,
      randomUUID(),
    );
    await dispatcher.tick();
    assert.equal(sent.length, 1);
    assert.equal(
      (
        await db.query(
          "SELECT status FROM abasong.push_deliveries WHERE outbox_id=$1",
          [event.id],
        )
      ).rows[0].status,
      "dead",
    );
    await http("/v1/device-installations/revoke", "POST", "", 200, {
      installation_id: installation.installation_id,
      installation_secret: installation.installation_secret,
      binding_version: device.binding_version,
    });
    assert(
      (
        await db.query("SELECT enabled FROM abasong.devices WHERE id=$1", [
          device.id,
        ])
      ).rows[0].enabled,
    );
    assert(rebound.binding_version > device.binding_version);
    const current = await call<S["Device"]>(
      "/v1/me/devices",
      "POST",
      other,
      201,
      installation,
      randomUUID(),
    );
    const retry = await message();
    fail = new PushFailure("NetworkError", true);
    await dispatcher.tick();
    delivery = (
      await db.query(
        "SELECT d.* FROM abasong.push_deliveries d JOIN abasong.outbox o ON o.id=d.outbox_id WHERE o.object_id=$1",
        [retry.id],
      )
    ).rows[0];
    assert.equal(delivery.status, "pending");
    assert.equal(delivery.attempts, 1);
    fail = null;
    await db.query(
      "UPDATE abasong.push_deliveries SET available_at=now() WHERE id=$1",
      [delivery.id],
    );
    await dispatcher.tick();
    assert.equal(sent.length, 2);
    await message();
    fail = new PushFailure("DeviceNotRegistered", false);
    await dispatcher.tick();
    assert.equal(
      (
        await db.query("SELECT enabled FROM abasong.devices WHERE id=$1", [
          current.id,
        ])
      ).rows[0].enabled,
      false,
    );
    // A fresh token is a new binding; old revocations cannot disable it.
    const restored = await call<S["Device"]>(
      "/v1/me/devices",
      "POST",
      other,
      201,
      { ...installation, push_token: "ExpoPushToken[TEST_FRESH_TOKEN_5678]" },
      randomUUID(),
    );
    await http("/v1/device-installations/revoke", "POST", "", 200, {
      installation_id: installation.installation_id,
      installation_secret: installation.installation_secret,
      binding_version: restored.binding_version,
    });
    await http("/v1/device-installations/revoke", "POST", "", 200, {
      installation_id: installation.installation_id,
      installation_secret: installation.installation_secret,
      binding_version: restored.binding_version,
    });
    assert.equal(
      (
        await db.query(
          "SELECT enabled,push_token FROM abasong.devices WHERE id=$1",
          [current.id],
        )
      ).rows[0].push_token,
      null,
    );
  } finally {
    await apiDb.end();
    await worker.end();
  }
  console.log(
    "PASS: isolated device binding, push ticket/receipt/preferences/rebinding/retry boundaries and retired meeting endpoints404; synthetic transport only.",
  );
}
