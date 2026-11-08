import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import type { Client } from "pg";
import type { components } from "../../packages/contracts/src/generated";
import {
  createVisibleAccessReader,
  type AccessRowState,
} from "../../apps/mobile/src/apartments/visible-access-reader";
type S = components["schemas"];
type Request = (
  method: string,
  path: string,
  token: string | undefined,
  status: number,
  body?: unknown,
  key?: string,
) => Promise<unknown>;

// Production mobile read coordinator + real authenticated HTTP/PostgreSQL.
// Only identities, codes, positions and network delay are synthetic. No cloud.
export async function verifyVisibleAccess(
  db: Client,
  req: Request,
  token: (id: string) => Promise<string>,
  base: string,
) {
  assert.match(
    (await db.query("SELECT current_database() AS n")).rows[0].n,
    /^abasong_d1_library_test_[a-f0-9]{16}$/,
  );
  const [writerId, readerId, strangerId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  await db.query("INSERT INTO abasong.users(id) SELECT unnest($1::uuid[])", [
    [writerId, readerId, strangerId],
  ]);
  await db.query(
    "INSERT INTO abasong.capabilities(user_id,capability,reason) VALUES($1,'access.contribute','TEST visible write'),($1,'access.read','TEST own contribution detail'),($2,'access.read','TEST visible read')",
    [writerId, readerId],
  );
  const [writer, reader, stranger] = await Promise.all(
    [writerId, readerId, strangerId].map(token),
  );
  const source = (
    await db.query(
      "INSERT INTO abasong.data_sources(source_type,provider,license_reference,persistent_use_approved) VALUES('own_field','synthetic','TEST visible isolation',true) RETURNING id",
    )
  ).rows[0].id;
  const apartments: string[] = [];
  for (const n of [100, 102, 104]) {
    const row = await db.query(
      "INSERT INTO abasong.apartments(name,address_line1,city,source_id,point,status) VALUES('TEST visible',$1,'TEST Visible City',$2,'SRID=4326;POINT(-118.7 34.7)'::extensions.geography,'active') RETURNING id",
      [n + " TEST Visible Ave", source],
    );
    apartments.push(row.rows[0].id);
  }
  const [a, b, empty] = apartments as [string, string, string];
  const path = (id: string) => `/v1/apartments/${id}/access-records`;
  const call = <T>(
    method: string,
    path: string,
    auth: string,
    status: number,
    body?: unknown,
    key?: string,
  ) => req(method, path, auth, status, body, key) as Promise<T>;
  const share = (value: string) => ({
    method: "keypad",
    value,
    scope: { label: "行人门" },
    source_attested: true,
  });
  const shareKey = randomUUID(),
    contribution = await call<S["ContributionResult"]>(
      "POST",
      path(a),
      writer!,
      201,
      share("*0012#"),
      shareKey,
    );
  const replay = await call<S["ContributionResult"]>(
    "POST",
    path(a),
    writer!,
    201,
    share("*0012#"),
    shareKey,
  );
  assert.equal(replay.record_id, contribution.record_id);
  await call("POST", path(b), writer!, 201, share("#0008*"), randomUUID());

  let snapshot: ReadonlyMap<string, AccessRowState> = new Map();
  const calls: string[] = [];
  let release: (() => void) | undefined,
    held = false,
    holdNext = false,
    failNext = false;
  const coordinator = createVisibleAccessReader(
    async (id, signal) => {
      calls.push(id);
      if (failNext) {
        failNext = false;
        throw new Error("TEST offline");
      }
      const response = await fetch(base + path(id), {
        headers: { Authorization: `Bearer ${reader}` },
        signal,
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
      const result = await response.json();
      if (!response.ok) throw { status: response.status, code: result.code };
      if (holdNext && id === a) {
        holdNext = false;
        held = true;
        // Deliberately ignore cancellation after HTTP completion to exercise a
        // delayed pre-correction response, not merely fetch's abort behaviour.
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return result as S["AccessList"];
    },
    (state) => {
      snapshot = state;
    },
  );
  async function until(test: () => boolean) {
    for (let i = 0; i < 100; i++) {
      if (test()) return;
      await pause(50);
    }
    throw new Error("TEST visible-access timeout");
  }
  const values = (id: string) => snapshot.get(id)?.records.map((r) => r.value);
  try {
    coordinator.update(apartments, true);
    await until(() =>
      apartments.every((id) => snapshot.get(id)?.status === "ready"),
    );
    assert.deepEqual(values(a), ["*0012#"]);
    assert.deepEqual(values(b), ["#0008*"]);
    assert.deepEqual(values(empty), []);
    assert.equal(calls.length, 3);
    for (const [id, state] of snapshot)
      assert(state.records.every((r) => r.apartment_id === id));

    // Failed reads keep address identity and require an explicit retry.
    failNext = true;
    coordinator.refresh(a);
    await until(() => snapshot.get(a)?.status === "error");
    assert.deepEqual(values(a), []);
    assert.deepEqual(values(b), ["#0008*"]);
    const beforeRetry = calls.length;
    coordinator.retry(a);
    coordinator.retry(a);
    await until(() => snapshot.get(a)?.status === "ready");
    assert.equal(calls.length, beforeRetry + 1);

    // An old successful HTTP response is held across a real correction.
    holdNext = true;
    coordinator.refresh(a);
    await until(() => held);
    const sources = await call<S["ContributionSummaryPage"]>(
      "GET",
      "/v1/me/contributions",
      writer!,
      200,
    );
    const old = sources.items.find(
      (s) => s.record_id === contribution.record_id,
    )!;
    assert(old);
    await call("GET", "/v1/me/contributions/" + old.id, reader!, 404);
    const correction = {
        expected_version: old.version,
        value: "#0010*",
        scope: { label: "车库门" },
        source_attested: true,
      },
      key = randomUUID();
    const changed = await call<S["ContributionChangeResult"]>(
      "POST",
      `/v1/me/contributions/${old.id}/corrections`,
      writer!,
      200,
      correction,
      key,
    );
    // Discarding the first receipt and retrying the same intent is safe.
    const repeated = await call<S["ContributionChangeResult"]>(
      "POST",
      `/v1/me/contributions/${old.id}/corrections`,
      writer!,
      200,
      correction,
      key,
    );
    assert.equal(changed.replacement?.id, repeated.replacement?.id);
    coordinator.refresh(a);
    await until(() => snapshot.get(a)?.status === "ready");
    assert.deepEqual(values(a), ["#0010*"]);
    assert.equal(snapshot.get(a)?.records[0]?.scope.label, "车库门");
    release?.();
    await pause(30);
    assert.deepEqual(values(a), ["#0010*"]);
    assert.deepEqual(values(b), ["#0008*"]);
    assert.equal(calls.filter((id) => id === b).length, 1);
    const history = await call<S["ContributionDetail"]>(
      "GET",
      `/v1/me/contributions/${old.id}`,
      writer!,
      200,
    );
    assert.equal(history.source.status, "corrected");
    assert.equal(history.value, null);

    // Feedback refresh is one targeted read and the server supplies its rank.
    const record = snapshot.get(a)!.records[0]!;
    await call(
      "PUT",
      `/v1/access-records/${record.id}/feedback`,
      reader!,
      200,
      { client_event_id: randomUUID(), value: "useful" },
    );
    const beforeFeedback = calls.length;
    coordinator.refresh(a);
    await until(() => snapshot.get(a)?.status === "ready");
    assert.equal(calls.length, beforeFeedback + 1);
    assert.equal(snapshot.get(a)?.records[0]?.my_feedback, "useful");

    // Same valid JWT, expired database grant: the service must deny new reads.
    await db.query(
      "UPDATE abasong.capabilities SET valid_from=now()-interval '2 hours',valid_until=now()-interval '1 hour' WHERE user_id=$1",
      [readerId],
    );
    coordinator.refresh(a);
    await until(() => snapshot.get(a)?.status === "denied");
    assert(
      [...snapshot.values()].every(
        (row) => row.status === "denied" && row.records.length === 0,
      ),
    );
    const beforeDenied = calls.length;
    coordinator.retry(a);
    coordinator.update(apartments, true);
    assert.equal(calls.length, beforeDenied);
    await call("GET", path(a), stranger!, 403);
    await call(
      "POST",
      path(a),
      stranger!,
      403,
      share("TEST-DENIED#"),
      randomUUID(),
    );

    await db.query(
      "UPDATE abasong.capabilities SET valid_until=NULL WHERE user_id=$1",
      [readerId],
    );
    coordinator.update([a], false);
    coordinator.update([a], true);
    await until(() => snapshot.get(a)?.status === "ready");
    assert.deepEqual(values(a), ["#0010*"]);
    assert.equal(snapshot.size, 1);
    coordinator.update([], true);
    assert.equal(snapshot.size, 0);
    coordinator.update([b], true);
    await until(() => snapshot.get(b)?.status === "ready");
    assert.deepEqual(values(b), ["#0008*"]);
    assert(!snapshot.has(a));
    console.log(
      "PASS: M3 mobile coordinator + real HTTP/DB; row isolation, retry, literal codes, correction replay, late response, feedback, expired grant and stranger denial",
    );
  } finally {
    coordinator.dispose();
    release?.();
  }
}
