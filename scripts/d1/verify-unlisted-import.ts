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

function completed(out: ImportOutcome): S["ImportCommitResult"] {
  assert(!("stage" in out), "expected an actual durable commit result");
  return out;
}
async function main() {
  const own = transport("owner"),
    other = transport("driver");
  const f = await own<{ scenario: string; apartments: string[] }>("/fixture");
  check(f.scenario === "contribution");
  const apt = await own<S["Apartment"]>(`/v1/apartments/${f.apartments[0]}`);
  const source: Source = {
    id: randomUUID(),
    uri: "TEST-only",
    state: "recognized",
    width: 1,
    height: 1,
    bytes: 68,
    mime: "image/png",
  };
  const sources = [source];
  const row = (n: number, value = "*0012#"): Candidate => ({
    id: randomUUID(),
    sourceId: source.id,
    sourceAddress: "TEST independent OCR text",
    address: `${n} TEST Ave, TEST City, CA 90000`,
    confirmedAddress: {
      address_line1: `${n} TEST Ave`,
      city: "TEST City",
      state: "CA",
      postal_code: "90000",
    },
    value,
    scope: "行人门",
    issues: [],
    target: null,
    selected: true,
    revision: 1,
  });
  const before = () =>
    own<{
      apartments: number;
      private_records: number;
      access_records: number;
      contribution_sources: number;
      provider_calls: number;
    }>("/fixture/snapshot");
  const control = (action: string, enabled: boolean) =>
    own("/fixture/control", { method: "POST", body: { action, enabled } });
  const reject = async (p: Promise<unknown>, status: number, code?: string) => {
    await assert.rejects(
      p,
      (e: unknown) =>
        e instanceof AccountError &&
        e.status === status &&
        (!code || e.code === code),
    );
    checks++;
  };
  const commits: { path: string; body: unknown; key?: string }[] = [];
  const traced: ContributionRequest = async <T>(
    path: string,
    o?: Parameters<ContributionRequest>[1],
  ) => {
    if (path.endsWith("/commit"))
      commits.push({ path, body: o?.body, key: o?.key });
    return own<T>(path, o);
  };
  const client = new ImportDraft(
    traced,
    new AbortController().signal,
    randomUUID,
  );
  const known: Candidate = {
    ...row(100, "#0008*"),
    confirmedAddress: null,
    target: apt,
  };
  const fresh = row(200),
    all = [known, fresh];
  const start = await before();
  await control("address_storage", false);
  let results = await client.commit(all, all, sources, "private_and_share");
  const k = completed(results.find((x) => x.localId === known.id)!.out),
    fail = results.find((x) => x.localId === fresh.id)!.out;
  check(k.share_status === "active" && k.apartment_id === apt.id);
  check(
    "stage" in fail &&
      fail.stage === "address_preparation" &&
      fail.error_code === "ADDRESS_STORAGE_UNAVAILABLE",
  );
  check((await before()).apartments === start.apartments);
  const batch = client.batch!;
  const prepared = await own<S["ImportCandidatePage"]>(
    `/v1/me/import-batches/${batch.id}/candidates?limit=50`,
  );
  const unresolved = prepared.items.find((x) => !x.commit_result)!;
  check(
    unresolved.address_text === fresh.sourceAddress &&
      !unresolved.confirmed_address,
  );
  check(prepared.items.every((x) => !("prepared_address" in x)));

  await reject(other(`/v1/me/import-batches/${batch.id}/candidates`), 404);
  await reject(
    other(`/v1/me/import-batches/${batch.id}/commit`, {
      method: "POST",
      body: commits[0]!.body,
      key: randomUUID(),
    }),
    404,
  );
  // Private-only storage is independent of the unavailable map provider.
  const privateClient = new ImportDraft(
      own,
      new AbortController().signal,
      randomUUID,
    ),
    privateRow = { ...row(202, "#0007*"), confirmedAddress: null };
  const prePrivate = await before();
  const privateOut = completed(
    (
      await privateClient.commit(
        [privateRow],
        [privateRow],
        sources,
        "private_only",
      )
    )[0]!.out,
  );
  check(
    privateOut.private_status === "saved" &&
      privateOut.share_status === "not_requested" &&
      !privateOut.apartment_id,
  );
  check((await before()).provider_calls === prePrivate.provider_calls);
  check((await before()).apartments === prePrivate.apartments);
  await control("address_storage", true);
  results = await client.commit(all, [fresh], sources, "private_and_share");
  const saved = completed(results[0]!.out);
  check(
    saved.private_status === "saved" &&
      saved.share_status === "active" &&
      !!saved.apartment_id,
  );
  const safeCandidates = await own<S["ImportCandidatePage"]>(
    `/v1/me/import-batches/${batch.id}/candidates?limit=50`,
  );
  check(safeCandidates.items.every((x) => !("prepared_address" in x)));
  const linked = await own<S["Apartment"]>(
    `/v1/apartments/${saved.apartment_id}`,
  );
  check(linked.address_line1 === "200 TEST Ave");
  const read = await other<S["AccessList"]>(
    `/v1/apartments/${saved.apartment_id}/access-records`,
  );
  check(read.items.some((x) => x.value === "*0012#"));
  check(
    !(
      await other<S["AccessList"]>(
        `/v1/apartments/${f.apartments[1]}/access-records`,
      )
    ).items.length,
  );
  const library = await own<S["LibraryPage"]>(
    "/v1/me/apartment-library?limit=100",
  );
  const entry = library.items.find(
    (x) => x.apartment_id === saved.apartment_id,
  )!;
  check(!!entry);
  await reject(other(`/v1/me/apartment-library/${entry.id}`), 404);
  const stable = await before();
  const replay = completed(
    (await client.commit(all, [fresh], sources, "private_and_share"))[0]!.out,
  );
  check(
    replay.private_record_id === saved.private_record_id &&
      replay.apartment_id === saved.apartment_id,
  );
  const afterReplay = await before();
  check(
    afterReplay.private_records === stable.private_records &&
      afterReplay.contribution_sources === stable.contribution_sources &&
      afterReplay.provider_calls === stable.provider_calls,
  );
  // A malformed provider address leaves no private/shared effects and is editable.
  const badClient = new ImportDraft(
      traced,
      new AbortController().signal,
      randomUUID,
    ),
    bad = row(999, "#0008*");
  const beforeBad = await before();
  const badOut = (
    await badClient.commit([bad], [bad], sources, "private_and_share")
  )[0]!.out;
  check(
    "stage" in badOut &&
      badOut.stage === "address_preparation" &&
      badOut.error_code === "ADDRESS_CONFIRMATION_REQUIRED" &&
      !badOut.retryable,
  );
  check((await before()).private_records === beforeBad.private_records);
  const corrected: Candidate = {
    ...bad,
    ...row(204, "#0010*"),
    id: bad.id,
    revision: 2,
  };
  await badClient.save([corrected], sources, "private_and_share");
  // A client cannot commit the previous OCR revision after address correction.
  const correctedRemote = (
    await own<S["ImportCandidatePage"]>(
      `/v1/me/import-batches/${badClient.batch!.id}/candidates?limit=50`,
    )
  ).items[0]!;
  await reject(
    own(`/v1/me/import-batches/${badClient.batch!.id}/commit`, {
      method: "POST",
      key: randomUUID(),
      body: {
        expected_batch_version: badClient.batch!.version,
        mode: "private_and_share",
        source_attested: true,
        items: [
          {
            candidate_id: correctedRemote.id,
            confirmed_revision: correctedRemote.revision - 1,
            client_commit_id: randomUUID(),
          },
        ],
      },
    }),
    409,
    "IMPORT_CONFLICT",
  );
  const correctedOut = completed(
    (
      await badClient.commit(
        [corrected],
        [corrected],
        sources,
        "private_and_share",
      )
    )[0]!.out,
  );
  check(
    correctedOut.share_status === "active" &&
      correctedOut.apartment_id !== saved.apartment_id,
  );
  check(
    (
      await other<S["AccessList"]>(
        `/v1/apartments/${correctedOut.apartment_id}/access-records`,
      )
    ).items.some((x) => x.value === "#0010*"),
  );
  check(
    (
      await other<S["AccessList"]>(
        `/v1/apartments/${saved.apartment_id}/access-records`,
      )
    ).items.some((x) => x.value === "*0012#"),
  );
  // Immutable completed/private-saved rows cannot be edited to a new target.
  const remote = await own<S["ImportCandidatePage"]>(
    `/v1/me/import-batches/${client.batch!.id}/candidates?limit=50`,
  );
  const done = remote.items.find(
    (x) => x.commit_result?.apartment_id === saved.apartment_id,
  )!;
  await reject(
    own(`/v1/me/import-batches/${client.batch!.id}/candidates/${done.id}`, {
      method: "PATCH",
      body: {
        expected_revision: done.revision,
        confirmed_address: row(206).confirmedAddress,
      },
      key: randomUUID(),
    }),
    409,
  );
  // Both fields are untrusted; conflicting display address must fail confirmation.
  const mismatchClient = new ImportDraft(
      own,
      new AbortController().signal,
      randomUUID,
    ),
    mismatch = { ...row(206), address: "208 TEST Ave, TEST City, CA 90000" };
  const preMismatch = await before();
  const mismatchResult = (
    await mismatchClient.commit(
      [mismatch],
      [mismatch],
      sources,
      "private_and_share",
    )
  )[0]!.out;
  check(
    "stage" in mismatchResult &&
      mismatchResult.error_code === "IMPORT_ADDRESS_MISMATCH",
  );
  check(
    (await before()).apartments === preMismatch.apartments &&
      (await before()).private_records === preMismatch.private_records,
  );
  // Lost final response replays a stable plan without creating another address.
  const lostClient = new ImportDraft(
      own,
      new AbortController().signal,
      randomUUID,
    ),
    lostRow = row(210, "*0009#");
  await own("/fixture/control", {
    method: "POST",
    body: { action: "fault", operation: "import_commit", after: true },
  });
  await reject(
    lostClient.commit([lostRow], [lostRow], sources, "private_and_share"),
    503,
  );
  const afterLost = await before();
  const lostSaved = completed(
    (
      await lostClient.commit(
        [lostRow],
        [lostRow],
        sources,
        "private_and_share",
      )
    )[0]!.out,
  );
  check(lostSaved.share_status === "active" && !!lostSaved.apartment_id);
  const afterLostRetry = await before();
  check(
    afterLostRetry.apartments === afterLost.apartments &&
      afterLostRetry.private_records === afterLost.private_records &&
      afterLostRetry.contribution_sources === afterLost.contribution_sources,
  );
  // A lost address-edit response reuses its exact idempotency key and proof.
  let lostEdit = true;
  const editKeys: string[] = [];
  const lostEditTransport: ContributionRequest = async <T>(
    path: string,
    o?: Parameters<ContributionRequest>[1],
  ) => {
    const v = await own<T>(path, o);
    if (o?.method === "PATCH" && path.includes("/candidates/")) {
      editKeys.push(o.key!);
      check(!("prepared_address" in (v as object)));
      if (lostEdit) {
        lostEdit = false;
        throw new Error("TEST edit response lost");
      }
    }
    return v;
  };
  const editClient = new ImportDraft(
      lostEditTransport,
      new AbortController().signal,
      randomUUID,
    ),
    editRow = row(216);
  const firstEdit = (
    await editClient.commit([editRow], [editRow], sources, "private_and_share")
  )[0]!.out;
  check("stage" in firstEdit && firstEdit.retryable);
  const beforeEditRetry = await before();
  const secondEdit = completed(
    (
      await editClient.commit(
        [editRow],
        [editRow],
        sources,
        "private_and_share",
      )
    )[0]!.out,
  );
  check(secondEdit.share_status === "active" && editKeys[0] === editKeys[1]);
  check((await before()).provider_calls === beforeEditRetry.provider_calls);
  // Two independent owners may confirm the same address, never create two catalog IDs.
  const two = row(212, "*0002#"),
    twoOther = { ...two, id: randomUUID() };
  const n = await before();
  const [a, b] = await Promise.all([
    new ImportDraft(own, new AbortController().signal, randomUUID).commit(
      [two],
      [two],
      sources,
      "private_and_share",
    ),
    new ImportDraft(other, new AbortController().signal, randomUUID).commit(
      [twoOther],
      [twoOther],
      sources,
      "private_and_share",
    ),
  ]);
  check(
    !!completed(a[0]!.out).apartment_id &&
      completed(a[0]!.out).apartment_id === completed(b[0]!.out).apartment_id,
  );
  check((await before()).apartments === n.apartments + 1);
  const denied = new ImportDraft(own, new AbortController().signal, randomUUID),
    deniedRow = row(214);
  await denied.save(
    [
      {
        ...deniedRow,
        confirmedAddress: null,
        address: deniedRow.sourceAddress!,
      },
    ],
    sources,
    "private_and_share",
  );
  const preDenied = await before();
  await control("access_qualification", false);
  await reject(
    denied.commit([deniedRow], [deniedRow], sources, "private_and_share"),
    403,
    "CAPABILITY_REQUIRED",
  );
  check((await before()).provider_calls === preDenied.provider_calls);
  await control("access_qualification", true);
  console.log(
    `PASS: R4-13 ${checks} actual-service assertions / ${calls} HTTP calls; structured unlisted-address batches, licensed persistence/failure, private isolation, partial retry, repair/revision replay guards, concurrent address dedupe, symbols and return target; TEST only.`,
  );
}
void main().catch((e: unknown) => {
  if (e instanceof Error)
    for (const frame of e.stack
      ?.split("\n")
      .filter(
        (x) =>
          x.trim().startsWith("at ") &&
          x.includes("/scripts/d1/verify-unlisted-import.ts:"),
      ) ?? [])
      console.error(frame.trim());
  if (e instanceof AccountError)
    console.error(JSON.stringify({ status: e.status, code: e.code }));
  console.error(
    "Unlisted import verification failed; private details omitted.",
  );
  process.exitCode = 1;
});
