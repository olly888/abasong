// Real fixed HTTPS API + real SMS sessions. Never signs test JWTs, connects to
// the database or prints response bodies. TEST values originate in this run.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PILOT_API } from "../../apps/mobile/app.config";
import { readAcceptanceSession } from "./pilot-admission";
const dir = ".tooling/cloud-runtime/acceptance";
async function main() {
  if (process.argv.slice(2).join() !== "--verify-live-business")
    throw new Error("Explicit live business mode required");
  const A = readAcceptanceSession("A"),
    B = readAcceptanceSession("B");
  assert.notEqual(A.user_id, B.user_id);
  const admission = JSON.parse(readFileSync(`${dir}/admission.json`, "utf8"));
  assert.deepEqual(admission.users, [A.user_id, B.user_id]);
  assert(Date.parse(admission.valid_until) > Date.now());
  const manifest = JSON.parse(
      readFileSync(`${dir}/business-manifest.json`, "utf8"),
    ),
    aid = manifest.apartment;
  const statePath = `${dir}/business-test-state.json`;
  type State = {
    run: string;
    keys: Record<string, string>;
    library?: string;
    shared?: string;
    source?: string;
    batch?: string;
    corrected?: string;
    passed: boolean;
  };
  const state: State = existsSync(statePath)
    ? JSON.parse(readFileSync(statePath, "utf8"))
    : { run: randomUUID(), keys: {}, passed: false };
  if (state.passed)
    throw new Error("Completed acceptance is not rerun implicitly");
  const save = () =>
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  const key = (name: string) => {
    state.keys[name] ??= randomUUID();
    save();
    return state.keys[name]!;
  };
  let checks = 0,
    stage = "start";
  async function request(
    account: typeof A | undefined,
    method: string,
    path: string,
    expected: number,
    body?: unknown,
    k?: string,
  ) {
    const r = await fetch(PILOT_API + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(account ? { Authorization: "Bearer " + account.access_token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(k ? { "Idempotency-Key": k } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert(bytes.length < 524288);
    const result = bytes.length
      ? JSON.parse(Buffer.from(bytes).toString())
      : null;
    if (r.status !== expected) {
      const code = result?.error?.code ?? result?.code;
      throw new Error(
        `Business stage ${stage}: status ${r.status}; code=${typeof code === "string" && /^[A-Z_]{3,60}$/.test(code) ? code : "UNAVAILABLE"}`,
      );
    }
    checks++;
    return result;
  }
  try {
    stage = "qualification";
    for (const s of [A, B]) {
      const me = await request(s, "GET", "/v1/me", 200);
      assert.equal(me.user_id, s.user_id);
      assert.deepEqual(me.capabilities.sort(), [
        "access.contribute",
        "access.read",
      ]);
    }
    await request(
      undefined,
      "GET",
      `/v1/apartments/${aid}/access-records`,
      401,
    );
    stage = "private_kms";
    const entry = await request(
      A,
      "POST",
      "/v1/me/apartment-library",
      201,
      { apartment_id: aid, name: "TEST cloud KMS private" },
      key("library"),
    );
    state.library = entry.id;
    save();
    await request(
      A,
      "POST",
      `/v1/me/apartment-library/${entry.id}/records`,
      201,
      { value: "#0007", scope_label: "TEST cloud private" },
      key("private-record"),
    );
    const privateData = await request(
      A,
      "GET",
      `/v1/me/apartment-library/${entry.id}`,
      200,
    );
    assert(
      privateData.records.some((r: { value: string }) => r.value === "#0007"),
    );
    await request(B, "GET", `/v1/me/apartment-library/${entry.id}`, 404);
    stage = "contribution";
    const scope = { label: "TEST cloud acceptance " + state.run.slice(0, 8) },
      body = { method: "keypad", value: "#0008", scope, source_attested: true };
    const shared = await request(
      A,
      "POST",
      `/v1/apartments/${aid}/access-records`,
      201,
      body,
      key("share"),
    );
    state.shared = shared.record_id;
    save();
    assert.equal(shared.outcome, "created_active");
    const replay = await request(
      A,
      "POST",
      `/v1/apartments/${aid}/access-records`,
      201,
      body,
      key("share"),
    );
    assert.equal(replay.record_id, shared.record_id);
    stage = "read_feedback";
    const read = await request(
      B,
      "GET",
      `/v1/apartments/${aid}/access-records`,
      200,
    );
    const current = read.items.find(
      (r: { id: string }) => r.id === shared.record_id,
    );
    assert.equal(current?.value, "#0008");
    assert(current.contributor_display_name);
    const feedback = {
      client_event_id: key("feedback-event"),
      value: "useful",
    };
    await request(
      B,
      "PUT",
      `/v1/access-records/${shared.record_id}/feedback`,
      200,
      feedback,
    );
    await request(
      B,
      "PUT",
      `/v1/access-records/${shared.record_id}/feedback`,
      200,
      feedback,
    );
    const voted = await request(
      B,
      "GET",
      `/v1/apartments/${aid}/access-records`,
      200,
    );
    assert.equal(
      voted.items.find((r: { id: string }) => r.id === shared.record_id)
        ?.my_feedback,
      "useful",
    );
    stage = "owner_correction";
    const sources = await request(A, "GET", "/v1/me/contributions", 200);
    const source = sources.items.find(
      (s: { record_id: string }) => s.record_id === shared.record_id,
    );
    assert(source);
    state.source = source.id;
    save();
    await request(B, "GET", `/v1/me/contributions/${source.id}`, 404);
    const correction = {
      expected_version: source.version,
      value: "*0009#",
      scope,
      source_attested: true,
    };
    await request(
      B,
      "POST",
      `/v1/me/contributions/${source.id}/corrections`,
      404,
      correction,
      key("foreign-correction"),
    );
    const fixed = await request(
      A,
      "POST",
      `/v1/me/contributions/${source.id}/corrections`,
      200,
      correction,
      key("correction"),
    );
    assert.equal(fixed.operation, "corrected");
    state.corrected = fixed.replacement?.record_id;
    save();
    const after = await request(
      B,
      "GET",
      `/v1/apartments/${aid}/access-records`,
      200,
    );
    assert(after.items.some((r: { value: string }) => r.value === "*0009#"));
    assert(!after.items.some((r: { value: string }) => r.value === "#0008"));
    stage = "import_kms";
    const batch = await request(
      A,
      "POST",
      "/v1/me/import-batches",
      201,
      {
        client_batch_id: key("batch-client"),
        policy_version: 1,
        mode: "private_only",
        origin: "library",
      },
      key("batch"),
    );
    state.batch = batch.id;
    save();
    const image = await request(
      A,
      "POST",
      `/v1/me/import-batches/${batch.id}/sources/local`,
      201,
      {
        client_source_id: key("source-client"),
        expected_batch_version: batch.version,
        mime_type: "image/png",
        byte_size: 1000,
        width: 100,
        height: 100,
      },
      key("image"),
    );
    const candidates = await request(
      A,
      "POST",
      `/v1/me/import-batches/${batch.id}/sources/${image.id}/extractions`,
      201,
      {
        expected_source_version: image.version,
        recognizer_version: "TEST-synthetic-on-device",
        candidates: [
          {
            address_text: "2445 E Del Mar Blvd, Pasadena CA 91107",
            method: "keypad",
            value: "0000#",
            scope: { label: "TEST private candidate" },
          },
        ],
      },
      key("extraction"),
    );
    assert.equal(candidates.items[0]?.value, "0000#");
    await request(
      A,
      "GET",
      `/v1/me/import-batches/${batch.id}/candidates`,
      200,
    );
    await request(B, "GET", `/v1/me/import-batches/${batch.id}`, 404);
    state.passed = true;
    save();
    writeFileSync(
      `${dir}/business-test-result.json`,
      JSON.stringify({
        verified_at: new Date().toISOString(),
        checks,
        real_sms_accounts: 2,
        real_https_api: true,
        actual_task_role_kms: true,
        shared_private_import_roundtrips: true,
        bodies_output: false,
        synthetic_values_only: true,
      }),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        checks,
        real_sms_accounts: 2,
        real_kms_shared_private_import: true,
        contribution_feedback_correction: true,
        foreign_objects_denied: true,
        test_cleanup_pending: true,
      }),
    );
  } catch (e) {
    console.error(
      e instanceof Error && e.message.startsWith("Business stage ")
        ? e.message
        : `Cloud business acceptance stopped at ${stage}; private details omitted.`,
    );
    process.exitCode = 1;
  }
}
void main().catch(() => {
  console.error(
    "Live business acceptance refused; check protected sessions, exact admission and manifest. No private details printed.",
  );
  process.exitCode = 1;
});
