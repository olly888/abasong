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
import { ServerDraft } from "./server-draft";
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
