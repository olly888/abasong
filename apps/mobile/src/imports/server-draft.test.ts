import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
import type { Candidate } from "./ImportScreen";
const mock = vi.hoisted(() => ({ request: vi.fn(), counter: 0 }));
vi.mock("../apartments/client", () => ({ dataRequest: mock.request }));
vi.mock("expo-crypto", () => ({
  randomUUID: () =>
    `00000000-0000-4000-8000-${String(++mock.counter).padStart(12, "0")}`,
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../auth/supabase", () => ({ supabase: null }));
import { AccountError } from "../auth/api-client";
import { ServerDraft } from "./server-draft";
import { restoreDraftView } from "./restore-draft";
type S = components["schemas"];
const batch: S["ImportBatch"] = {
  id: "b",
  state: "partial_failed",
  version: 7,
  generation: 1,
  mode: "private_and_share",
  mode_locked: true,
  policy_version: 1,
  expires_at: "2099-01-01T00:00:00Z",
  updated_at: "2026-10-30T00:00:00Z",
  sources_count: 1,
  candidate_count: 1,
  private_saved_count: 1,
  shared_count: 0,
  pending_count: 0,
  failed_count: 1,
};
const phase: S["ImportCommitResult"] = {
  candidate_id: "c",
  confirmed_revision: 2,
  client_commit_id: "retry-id",
  private_status: "saved",
  private_record_id: "private-id",
  share_status: "failed",
  contribution_id: null,
  error_code: "IMPORT_STORAGE_UNAVAILABLE",
  retryable: true,
};
const remote: S["ImportCandidate"] = {
  id: "c",
  revision: 2,
  source_ids: ["source"],
  address_text: "1 Example St",
  apartment_id: null,
  method: "keypad",
  value: "TEST",
  scope: { label: "gate" },
  issues: [],
  state: "failed",
  confirmation_revision: 2,
  commit_result: phase,
};
const local: Candidate = {
  id: "c",
  sourceId: "source",
  address: "1 Example St",
  value: "TEST",
  scope: "gate",
  issues: [],
  target: null,
  selected: true,
  revision: 2,
  privateId: "private-id",
};
const session = {
  access_token: "test-session",
  user: { id: "owner" },
} as Session;
beforeEach(() => {
  mock.counter = 0;
  mock.request.mockReset();
});
describe("server import draft safety", () => {
  it("restores a durable private result and reuses its commit id for share retry", async () => {
    mock.request.mockImplementation(async (_session, path, options) => {
      if (path.includes("/candidates?"))
        return { items: [remote], next_cursor: null };
      if (path.endsWith("/commit"))
        return {
          batch: { ...batch, state: "completed" },
          results: [{ ...phase, share_status: "pending" }],
        };
      if (!options.method || options.method === "GET") return batch;
      throw new Error("Unexpected mutation");
    });
    const signal = new AbortController().signal,
      client = new ServerDraft(session, signal);
    await client.restore("b");
    const result = await client.commit(
      [local],
      [local],
      [],
      "private_and_share",
    );
    expect(result[0].out.private_record_id).toBe("private-id");
    const call = mock.request.mock.calls.find((c) => c[1].endsWith("/commit"))!;
    expect(call[2].body.items[0].client_commit_id).toBe("retry-id");
    expect(mock.request.mock.calls.some((c) => c[1].includes("/sources"))).toBe(
      false,
    );
    expect(mock.request.mock.calls.every((c) => c[2].signal === signal)).toBe(
      true,
    );
  });
  it("refuses to overwrite another device content revision", async () => {
    let changed = false;
    mock.request.mockImplementation(async (_s, path) =>
      path.includes("/candidates?")
        ? {
            items: [{ ...remote, revision: changed ? 3 : 2 }],
            next_cursor: null,
          }
        : batch,
    );
    const client = new ServerDraft(session, new AbortController().signal);
    await client.restore("b");
    changed = true;
    await expect(client.save([local], [], "private_and_share")).rejects.toThrow(
      "其他设备",
    );
    expect(mock.request.mock.calls.some((c) => c[2].method === "PATCH")).toBe(
      false,
    );
  });
  it("never fabricates image metadata when a draft has no local screenshot source", async () => {
    mock.request.mockImplementation(async (_s, path) =>
      path.endsWith("/import-policy")
        ? { version: 1 }
        : path.includes("/candidates?")
          ? { items: [], next_cursor: null }
          : { ...batch, mode: "private_only", mode_locked: false },
    );
    const client = new ServerDraft(session, new AbortController().signal);
    await expect(
      client.save([{ ...local, privateId: undefined }], [], "private_only"),
    ).rejects.toThrow("截图来源");
    expect(mock.request.mock.calls.some((c) => c[1].includes("/sources"))).toBe(
      false,
    );
  });
  it("retries a lost extraction response with the original key and no duplicate source", async () => {
    let extracted = false;
    let fail = true;
    const fresh = {
      ...remote,
      id: "server-c",
      revision: 1,
      state: "needs_review",
      confirmation_revision: null,
      commit_result: undefined,
    };
    mock.request.mockImplementation(async (_s, path, options) => {
      if (path.endsWith("/import-policy")) return { version: 1 };
      if (path.endsWith("/sources/local"))
        return { id: "source", version: 1, state: "registered" };
      if (path.endsWith("/extractions")) {
        extracted = true;
        if (fail) {
          fail = false;
          throw new Error("response lost");
        }
        return { items: [fresh], next_cursor: null };
      }
      if (path.includes("/candidates?"))
        return { items: extracted ? [fresh] : [], next_cursor: null };
      if (options.method === "PATCH") throw new Error("Unexpected edit");
      return { ...batch, mode: "private_only", mode_locked: false };
    });
    const client = new ServerDraft(session, new AbortController().signal),
      row = { ...local, privateId: undefined };
    const sources = [
      {
        id: "source",
        uri: "file:///TEST.png",
        state: "recognized" as const,
        width: 100,
        height: 100,
        bytes: 100,
        mime: "image/png" as const,
      },
    ];
    await expect(client.save([row], sources, "private_only")).rejects.toThrow(
      "response lost",
    );
    await client.save([row], sources, "private_only");
    expect(
      mock.request.mock.calls.filter((c) => c[1].endsWith("/sources/local")),
    ).toHaveLength(1);
    const calls = mock.request.mock.calls.filter((c) =>
      c[1].endsWith("/extractions"),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0][2]).toEqual(calls[1][2]);
  });
  it("lists only unfinished metadata and does not fetch candidate plaintext in discovery", async () => {
    mock.request.mockResolvedValue({
      items: [
        batch,
        { ...batch, id: "done", state: "completed" },
        { ...batch, id: "cancel", state: "cancelled" },
      ],
      next_cursor: null,
    });
    const client = new ServerDraft(session, new AbortController().signal);
    expect((await client.available()).map((b) => b.id)).toEqual(["b"]);
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
});

describe("lost draft mutation responses", () => {
  const fresh = {
    ...remote,
    commit_result: undefined,
    confirmation_revision: null,
    state: "needs_review" as const,
  };
  it("replays a saved edit with its original key before comparing revisions", async () => {
    let row = { ...fresh },
      lost = true;
    mock.request.mockImplementation(async (_s, path, o) => {
      if (path.includes("/candidates?"))
        return { items: [row], next_cursor: null };
      if (o.method === "PATCH") {
        row = { ...row, value: "TEST-corrected", revision: 3 };
        if (lost) {
          lost = false;
          throw new Error("response lost");
        }
        return row;
      }
      return { ...batch, mode: "private_only", mode_locked: false };
    });
    const client = new ServerDraft(session, new AbortController().signal);
    await client.restore("b");
    const edited = { ...local, value: "TEST-corrected", privateId: undefined };
    await expect(client.save([edited], [], "private_only")).rejects.toThrow(
      "response lost",
    );
    await client.save([edited], [], "private_only");
    const writes = mock.request.mock.calls.filter(
      (c) => c[2].method === "PATCH",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0][2]).toEqual(writes[1][2]);
  });
  it("recovers a mode response lost after the server invalidated confirmations", async () => {
    let mode: S["ImportBatch"]["mode"] = "private_only",
      revision = 2,
      lost = true;
    mock.request.mockImplementation(async (_s, path, o) => {
      if (path.includes("/candidates?"))
        return { items: [{ ...fresh, revision }], next_cursor: null };
      if (o.method === "PATCH") {
        mode = "private_and_share";
        revision = 3;
        if (lost) {
          lost = false;
          throw new Error("response lost");
        }
      }
      return { ...batch, mode, mode_locked: false };
    });
    const client = new ServerDraft(session, new AbortController().signal);
    await client.restore("b");
    await expect(client.save([local], [], "private_and_share")).rejects.toThrow(
      "response lost",
    );
    await client.save([local], [], "private_and_share");
    const writes = mock.request.mock.calls.filter(
      (c) => c[2].method === "PATCH",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0][2]).toEqual(writes[1][2]);
  });
  it("rejects another device edit during mode-response recovery", async () => {
    let modified = false;
    mock.request.mockImplementation(async (_s, path, o) => {
      if (path.includes("/candidates?"))
        return {
          items: [
            {
              ...fresh,
              revision: modified ? 4 : 2,
              value: modified ? "TEST-other" : fresh.value,
            },
          ],
          next_cursor: null,
        };
      if (o.method === "PATCH") modified = true;
      return {
        ...batch,
        mode: modified ? "private_and_share" : "private_only",
        mode_locked: false,
      };
    });
    const client = new ServerDraft(session, new AbortController().signal);
    await client.restore("b");
    await expect(client.save([local], [], "private_and_share")).rejects.toThrow(
      "其他设备",
    );
  });
  it("recovers a completed commit after a lost reply using its durable item ID", async () => {
    let completed = false,
      lost = true;
    mock.request.mockImplementation(async (_s, path, o) => {
      if (path.includes("/candidates?"))
        return {
          items: [
            {
              ...remote,
              commit_result: {
                ...phase,
                share_status: completed ? "pending" : "failed",
              },
            },
          ],
          next_cursor: null,
        };
      if (path.endsWith("/commit")) {
        completed = true;
        if (lost) {
          lost = false;
          throw new Error("commit response lost");
        }
        return { batch, results: [{ ...phase, share_status: "pending" }] };
      }
      if (o.method === "PATCH") throw new Error("Unexpected edit");
      return batch;
    });
    const client = new ServerDraft(session, new AbortController().signal);
    await client.restore("b");
    await expect(
      client.commit([local], [local], [], "private_and_share"),
    ).rejects.toThrow("response lost");
    const result = await client.commit(
      [local],
      [local],
      [],
      "private_and_share",
    );
    expect(result[0].out.private_record_id).toBe("private-id");
    const writes = mock.request.mock.calls.filter((c) =>
      c[1].endsWith("/commit"),
    );
    expect(
      writes.every((c) => c[2].body.items[0].client_commit_id === "retry-id"),
    ).toBe(true);
    expect(
      mock.request.mock.calls.some((c) => c[1].endsWith("/sources/local")),
    ).toBe(false);
  });
  it("stops after expiry without silently creating a replacement draft", async () => {
    mock.request.mockRejectedValue(
      new AccountError(422, "IMPORT_EXPIRED", "草稿已过期"),
    );
    const client = new ServerDraft(session, new AbortController().signal);
    await expect(client.restore("b")).rejects.toMatchObject({
      code: "IMPORT_EXPIRED",
    });
    expect(mock.request.mock.calls.every((c) => !c[2].method)).toBe(true);
  });
  it("stops source/edit mutations when the screen has been cancelled", async () => {
    const control = new AbortController(),
      client = new ServerDraft(session, control.signal);
    control.abort();
    await expect(client.save([local], [], "private_only")).rejects.toThrow(
      "已取消",
    );
    expect(mock.request).not.toHaveBeenCalled();
  });
});

describe("draft apartment availability recovery", () => {
  it.each([401, 503])(
    "preserves the previous batch and durable retry after a %i apartment restore failure",
    async (status) => {
      mock.request.mockImplementation(async (_s, path) => {
        if (path.startsWith("/v1/apartments/"))
          throw new AccountError(status, "TEST-error", "暂不可用");
        if (path.startsWith("/v1/me/import-batches/other/candidates?"))
          return {
            items: [
              { ...remote, id: "other-row", apartment_id: "TEST-target" },
            ],
            next_cursor: null,
          };
        if (path.includes("/candidates?"))
          return { items: [remote], next_cursor: null };
        if (path === "/v1/me/import-batches/other")
          return { ...batch, id: "other" };
        if (path.endsWith("/commit"))
          return { batch, results: [{ ...phase, share_status: "pending" }] };
        return batch;
      });
      const client = new ServerDraft(session, new AbortController().signal);
      await client.restore("b");
      await expect(restoreDraftView(client, "other")).rejects.toMatchObject({
        status,
      });
      expect(client.batch?.id).toBe("b");
      await client.commit([local], [local], [], "private_and_share");
      const writes = mock.request.mock.calls.filter((c) => c[2].method);
      expect(writes).toHaveLength(1);
      expect(writes[0][1]).toBe("/v1/me/import-batches/b/commit");
      expect(writes[0][2].body.items[0].client_commit_id).toBe("retry-id");
    },
  );
  it("keeps a restorable draft when its old apartment has been removed", async () => {
    mock.request.mockRejectedValue(
      new AccountError(404, "NOT_FOUND", "公寓已不可用"),
    );
    const client = new ServerDraft(session, new AbortController().signal);
    await expect(client.apartment("old-apartment")).resolves.toBeNull();
  });
  it.each([401, 503])(
    "does not disguise a %i auth/network failure as a missing apartment",
    async (status) => {
      mock.request.mockRejectedValue(
        new AccountError(status, "TEST-error", "暂不可用"),
      );
      const client = new ServerDraft(session, new AbortController().signal);
      await expect(client.apartment("old-apartment")).rejects.toMatchObject({
        status,
      });
    },
  );
});

it("preserves the current draft when another draft restore fails mid-pagination", async () => {
  let failOther = false;
  mock.request.mockImplementation(async (_s, path) => {
    if (path.includes("/other/candidates?")) {
      if (failOther)
        throw new AccountError(503, "NETWORK_TIMEOUT", "TEST timeout");
      return { items: [], next_cursor: null };
    }
    if (path.endsWith("/other")) return { ...batch, id: "other" };
    if (path.includes("/candidates?"))
      return { items: [remote], next_cursor: null };
    return batch;
  });
  const client = new ServerDraft(session, new AbortController().signal);
  await client.restore("b");
  failOther = true;
  await expect(client.restore("other")).rejects.toMatchObject({
    code: "NETWORK_TIMEOUT",
  });
  expect(client.batch?.id).toBe("b");
  await client.save([local], [], "private_and_share");
  expect(client.batch?.id).toBe("b");
});

it("persists removing the last unsubmitted row without creating an empty replacement batch", async () => {
  let row = {
    ...remote,
    commit_result: undefined,
    confirmation_revision: null,
    state: "needs_review" as S["ImportCandidate"]["state"],
  };
  mock.request.mockImplementation(async (_s, path, o) => {
    if (path.includes("/candidates?"))
      return { items: [row], next_cursor: null };
    if (o.method === "PATCH") {
      expect(o.body).toEqual({ expected_revision: 2, removed: true });
      row = { ...row, revision: 3, state: "removed" };
      return row;
    }
    return { ...batch, mode: "private_only", mode_locked: false };
  });
  const client = new ServerDraft(session, new AbortController().signal);
  await client.restore("b");
  await client.save([], [], "private_only");
  expect(row.state).toBe("removed");
  expect(mock.request.mock.calls.some((c) => c[2].method === "POST")).toBe(
    false,
  );
  expect(client.batch?.id).toBe("b");
});
