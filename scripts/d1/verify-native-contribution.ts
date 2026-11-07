import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { components } from "../../packages/contracts/src/generated";
import type {
  Candidate,
  Source,
  ImportOutcome,
} from "../../apps/mobile/src/imports/types";
import type { ContributionRequest } from "../../apps/mobile/src/apartments/contribution-address-search";
import { ImportDraft } from "../../apps/mobile/src/imports/server-draft-core";
import { AccountError } from "../../apps/mobile/src/auth/errors";
type S = components["schemas"];
let calls = 0,
  checks = 0;
const check = (v: unknown) => {
  assert(v);
  checks++;
};
const transport =
  (actor: "owner" | "driver"): ContributionRequest =>
  async <T>(path: string, o?: Parameters<ContributionRequest>[1]) => {
    const r = await fetch("http://127.0.0.1:3028" + path, {
      method: o?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Abasong-Test-Actor": actor,
        ...(o?.key ? { "Idempotency-Key": o.key } : {}),
      },
      body: o?.body === undefined ? undefined : JSON.stringify(o.body),
      signal: o?.signal ?? AbortSignal.timeout(15000),
    });
    calls++;
    const v = await r.json();
    if (!r.ok) throw new AccountError(r.status, v.code, "TEST request failed");
    return v as T;
  };
function committed(out: ImportOutcome) {
  assert(!("stage" in out));
  return out;
}
async function main() {
  const own = transport("owner"),
    other = transport("driver");
  const f = await own<{ scenario: string; apartments: string[] }>("/fixture");
  check(f.scenario === "contribution" && f.apartments.length === 3);
  const apartments = await Promise.all(
    f.apartments.map((id) => own<S["Apartment"]>(`/v1/apartments/${id}`)),
  );
  const path = (i: number) =>
    `/v1/apartments/${apartments[i]!.id}/access-records`;
  const read = (i: number) => other<S["AccessList"]>(path(i));
  const snapshot = () =>
    own<{
      access_records: number;
      private_records: number;
      contribution_sources: number;
    }>("/fixture/snapshot");
  const arm = (operation: string) =>
    own("/fixture/control", {
      method: "POST",
      body: { action: "fault", operation, after: true },
    });
  const contribution = {
    method: "keypad",
    value: "*0012#",
    scope: { label: "行人门" },
    source_attested: true,
  };
  const key = randomUUID(),
    before = await snapshot();
  await arm("contribute");
  await assert.rejects(
    own(path(0), { method: "POST", body: contribution, key }),
    (e: unknown) => e instanceof AccountError && e.status === 503,
  );
  checks++;
  const saved = await own<S["ContributionResult"]>(path(0), {
    method: "POST",
    body: contribution,
    key,
  });
  check((await snapshot()).access_records === before.access_records + 1);
  check((await read(0)).items[0]?.value === "*0012#");
  check((await read(1)).items.length === 0);
  await assert.rejects(
    own(path(0), {
      method: "POST",
      body: { ...contribution, value: 12 },
      key: randomUUID(),
    }),
    (e: unknown) => e instanceof AccountError && e.status === 400,
  );
  checks++;
  await other(path(0), {
    method: "POST",
    body: contribution,
    key: randomUUID(),
  });
  await other(`/v1/access-records/${saved.record_id}/feedback`, {
    method: "PUT",
    body: { client_event_id: randomUUID(), value: "useful" },
    key: randomUUID(),
  });
  const list = await own<S["ContributionSummaryPage"]>(
    "/v1/me/contributions?limit=100",
  );
  const original = list.items.find((s) => s.record_id === saved.record_id)!;
  check(original.other_source_count === 1);
  const oldTime = original.occurred_at;
  const corrected = {
    expected_version: original.version,
    value: "#0007*",
    scope: { label: "行人门" },
    source_attested: true,
  };
  const correctionPath = `/v1/me/contributions/${original.id}/corrections`,
    correctionKey = randomUUID();
  await arm("correct");
  await assert.rejects(
    own(correctionPath, {
      method: "POST",
      body: corrected,
      key: correctionKey,
    }),
    (e: unknown) => e instanceof AccountError && e.status === 503,
  );
  checks++;
  const result = await own<S["ContributionChangeResult"]>(correctionPath, {
    method: "POST",
    body: corrected,
    key: correctionKey,
  });
  check(
    result.source.status === "corrected" &&
      result.source.occurred_at === oldTime,
  );
  check(result.replacement?.apartment_id === apartments[0]!.id);
  const values = (await read(0)).items.map((r) => r.value);
  check(values.includes("*0012#") && values.includes("#0007*"));
  const oldSummary = await own<S["ContributionSummary"]>(
    `/v1/me/contributions/${original.id}/summary`,
  );
  check(oldSummary.useful_count === 1);
  await assert.rejects(
    other(`/v1/me/contributions/${original.id}/summary`),
    (e: unknown) => e instanceof AccountError && e.status === 404,
  );
  checks++;
  await assert.rejects(
    own(correctionPath, { method: "POST", body: corrected, key: randomUUID() }),
    (e: unknown) => e instanceof AccountError && e.status === 409,
  );
  checks++;
  const rows: Candidate[] = apartments.slice(1).map((a, i) => ({
    id: randomUUID(),
    sourceId: "TEST-screenshot",
    address: `${a.address_line1}, ${a.city}, ${a.state} ${a.postal_code}`,
    value: i ? "*0020#" : "0018#",
    scope: i ? "TEST 恢复门" : "行人门",
    issues: [],
    target: a,
    selected: true,
    revision: 1,
  }));
  const sources: Source[] = [
    {
      id: "TEST-screenshot",
      uri: "file:///TEST-only.png",
      width: 1,
      height: 1,
      bytes: 68,
      mime: "image/png",
      state: "recognized",
    },
  ];
  const draft = new ImportDraft(own, new AbortController().signal, randomUUID);
  const begin = await snapshot();
  await own("/fixture/control", {
    method: "POST",
    body: { action: "share_failure", enabled: true },
  });
  const partial = await draft.commit(rows, rows, sources, "private_and_share");
  check(
    committed(partial[0]!.out).share_status === "active" &&
      committed(partial[1]!.out).share_status === "failed",
  );
  check(partial.every((r) => committed(r.out).private_status === "saved"));
  const failed = committed(partial[1]!.out).private_record_id;
  check((await snapshot()).private_records === begin.private_records + 2);
  check((await read(1)).items[0]?.value === "0018#");
  check((await read(2)).items.length === 0);
  await own("/fixture/control", {
    method: "POST",
    body: { action: "share_failure", enabled: false },
  });
  const retried = await draft.commit(
    rows,
    [rows[1]!],
    sources,
    "private_and_share",
  );
  check(
    retried.length === 1 &&
      committed(retried[0]!.out).private_record_id === failed &&
      committed(retried[0]!.out).share_status === "active",
  );
  check((await snapshot()).private_records === begin.private_records + 2);
  check((await read(2)).items[0]?.value === "*0020#");
  const lostRows = [
      { ...rows[0]!, id: randomUUID(), value: "#0003*", sourceId: "TEST-next" },
    ],
    lostSources = [{ ...sources[0]!, id: "TEST-next" }];
  const next = new ImportDraft(own, new AbortController().signal, randomUUID),
    count = await snapshot();
  await arm("import_commit");
  await assert.rejects(
    next.commit(lostRows, lostRows, lostSources, "private_and_share"),
    (e: unknown) => e instanceof AccountError && e.status === 503,
  );
  checks++;
  const replay = await next.commit(
    lostRows,
    lostRows,
    lostSources,
    "private_and_share",
  );
  check(committed(replay[0]!.out).share_status === "active");
  check((await snapshot()).private_records === count.private_records + 1);
  check((await read(1)).items.some((r) => r.value === "#0003*"));
  const wrong = new ImportDraft(own, new AbortController().signal, randomUUID);
  await assert.rejects(
    wrong.save(
      [{ ...rows[0]!, id: randomUUID(), sourceId: "missing" }],
      sources,
      "private_only",
    ),
    /截图来源/,
  );
  checks++;
  console.log(
    `PASS: R4-11 ${checks} actual mobile contribution/import/correction assertions / ${calls} HTTP calls; literal strings, wrong-apartment isolation, partial retry, lost replies and retained independent sources/feedback; synthetic only.`,
  );
}
void main().catch((e: unknown) => {
  if (e instanceof AccountError)
    console.error(`TEST HTTP status=${e.status} code=${e.code}`);
  if (e instanceof Error)
    for (const line of e.stack
      ?.split("\n")
      .filter(
        (x) =>
          x.trim().startsWith("at ") &&
          x.includes("/scripts/d1/verify-native-contribution.ts:"),
      ) ?? [])
      console.error(line.trim());
  console.error(
    "Contribution protection verification failed; private details omitted.",
  );
  process.exitCode = 1;
});
