import { describe, expect, it } from "vitest";
import type { components } from "@abasong/contracts";
import {
  createVisibleAccessReader,
  type AccessRowState,
} from "./visible-access-reader";
type S = components["schemas"];
const record = (id: string): S["AccessRecord"] => ({
  id: `TEST-${id}`,
  apartment_id: id,
  method: "keypad",
  value: "*0012#",
  scope: { label: "行人门" },
  contributed_at: "2026-11-08T10:00:00Z",
  contributor_display_name: "TEST",
  last_success_at: null,
  last_failure_at: null,
  effective_useful: false,
  my_feedback: null,
  verification_label: "community_contribution",
});
function harness() {
  let snapshot: ReadonlyMap<string, AccessRowState> = new Map();
  const requests: {
    id: string;
    signal: AbortSignal;
    resolve: (v: S["AccessList"]) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const reader = createVisibleAccessReader(
    (id, signal) =>
      new Promise((resolve, reject) =>
        requests.push({ id, signal, resolve, reject }),
      ),
    (s) => {
      snapshot = s;
    },
  );
  return { reader, requests, state: () => snapshot };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
describe("visible apartment access isolation", () => {
  it("invalidates a pre-mutation read without allowing its late body to replace a correction", async () => {
    const h = harness();
    h.reader.update(["a", "b"], true);
    h.requests[1]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("b")],
    });
    await flush();
    h.reader.refresh("a");
    expect(h.requests[0]!.signal.aborted).toBe(true);
    expect(h.state().get("a")?.records).toEqual([]);
    h.requests[2]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [{ ...record("a"), value: "#0008*" }],
    });
    await flush();
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    expect(h.state().get("a")?.records[0]?.value).toBe("#0008*");
    expect(h.state().get("b")?.records[0]?.value).toBe("*0012#");
    expect(h.requests.filter((r) => r.id === "b")).toHaveLength(1);
  });
  it("clears a refreshed row immediately even while both request slots are occupied", async () => {
    const h = harness();
    h.reader.update(["a", "b", "c"], true);
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    h.reader.refresh("a");
    expect(h.state().has("a")).toBe(false);
    expect(h.requests).toHaveLength(3);
    h.requests[1]!.resolve({ config_version: 1, next_cursor: null, items: [] });
    await flush();
    expect(h.requests[3]?.id).toBe("a");
    h.reader.dispose();
  });
  it.each([
    { status: 403, code: "CAPABILITY_REQUIRED" },
    { status: 403, code: "ACCOUNT_UNAVAILABLE" },
    { status: 401, code: "SESSION_REVOKED" },
  ])(
    "account denial %s removes every visible body and stops stale-grant retries",
    async (error) => {
      const h = harness();
      h.reader.update(["a", "b", "c"], true);
      h.requests[0]!.resolve({
        config_version: 1,
        next_cursor: null,
        items: [record("a")],
      });
      await flush();
      h.requests[1]!.reject(error);
      await flush();
      h.requests[2]!.resolve({
        config_version: 1,
        next_cursor: null,
        items: [record("c")],
      });
      await flush();
      expect([...h.state().values()]).toEqual(
        Array(3).fill({ status: "denied", records: [] }),
      );
      h.reader.update(["a", "b", "d"], true);
      h.reader.retry("a");
      h.reader.refresh("a");
      expect(h.requests).toHaveLength(3);
      expect(h.state().get("d")?.status).toBe("denied");
      h.reader.update(["a"], false);
      h.reader.update(["a"], true);
      expect(h.requests).toHaveLength(4);
      h.reader.dispose();
    },
  );
  it("a sharing-pause rejection clears only that apartment and retires its pending read", async () => {
    const h = harness();
    h.reader.update(["a", "b"], true);
    h.requests[1]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("b")],
    });
    await flush();
    h.reader.fail("a", { status: 409, code: "APARTMENT_SHARING_PAUSED" });
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    expect(h.state().get("a")).toEqual({ status: "paused", records: [] });
    expect(h.state().get("b")?.status).toBe("ready");
    expect(h.requests).toHaveLength(2);
  });
  it("leaving a mode discards ready bodies, and returning requires a new read", async () => {
    const h = harness();
    h.reader.update(["a"], true);
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    h.reader.update([], true);
    expect(h.state().size).toBe(0);
    h.reader.update(["a"], true);
    expect(h.state().get("a")).toEqual({ status: "loading", records: [] });
    expect(h.requests).toHaveLength(2);
    h.reader.dispose();
  });
  it("reads only the visible objects with bounded parallel requests", async () => {
    const h = harness();
    h.reader.update(["a", "b", "c"], true);
    expect(h.requests.map((r) => r.id)).toEqual(["a", "b"]);
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    expect(h.requests.map((r) => r.id)).toEqual(["a", "b", "c"]);
    h.reader.update(["a", "b", "c"], true);
    expect(h.requests).toHaveLength(3);
    expect(h.state().get("a")?.records[0]?.value).toBe("*0012#");
    h.reader.dispose();
  });
  it("late completion cannot restore an offscreen address or overwrite another", async () => {
    const h = harness();
    h.reader.update(["a"], true);
    h.reader.update(["b"], true);
    expect(h.requests[0]!.signal.aborted).toBe(true);
    h.requests[1]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("b")],
    });
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    expect([...h.state().keys()]).toEqual(["b"]);
    expect(h.state().get("b")?.records[0]?.apartment_id).toBe("b");
  });
  it("rejects wrong-address records rather than displaying them", async () => {
    const h = harness();
    h.reader.update(["a"], true);
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("b")],
    });
    await flush();
    expect(h.state().get("a")).toEqual({ status: "error", records: [] });
  });
  it("revocation immediately clears bodies and cancels pending reads", async () => {
    const h = harness();
    h.reader.update(["a", "b"], true);
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    h.reader.update(["a", "b"], false);
    h.requests[1]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("b")],
    });
    await flush();
    expect([...h.state().values()]).toEqual([
      { status: "denied", records: [] },
      { status: "denied", records: [] },
    ]);
    h.reader.update(["a"], true);
    expect(h.requests).toHaveLength(3);
  });
  it("an explicit retry affects only the failed row and is single flight", async () => {
    const h = harness();
    h.reader.update(["a", "b"], true);
    h.requests[0]!.reject(new Error("offline"));
    h.requests[1]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("b")],
    });
    await flush();
    h.reader.retry("a");
    h.reader.retry("a");
    expect(h.requests).toHaveLength(3);
    h.requests[2]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    expect(h.state().get("a")?.status).toBe("ready");
    expect(h.state().get("b")?.status).toBe("ready");
  });
  it("paused sharing never displays returned ciphertext-derived bodies", async () => {
    const h = harness();
    h.reader.update(["a"], true);
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
      sharing_paused: true,
    });
    await flush();
    expect(h.state().get("a")).toEqual({ status: "paused", records: [] });
  });
  it("a disposed session cannot publish or request again", async () => {
    const h = harness();
    h.reader.update(["a"], true);
    h.reader.dispose();
    h.requests[0]!.resolve({
      config_version: 1,
      next_cursor: null,
      items: [record("a")],
    });
    await flush();
    h.reader.update(["b"], true);
    h.reader.retry("a");
    expect(h.requests).toHaveLength(1);
    expect(h.state().get("a")?.records).toEqual([]);
  });
  it("authorization denial is distinct from empty or failed transport", async () => {
    const h = harness();
    h.reader.update(["a", "b"], true);
    h.requests[0]!.reject({ status: 403 });
    h.requests[1]!.resolve({ config_version: 1, next_cursor: null, items: [] });
    await flush();
    expect(h.state().get("a")?.status).toBe("denied");
    expect(h.state().get("b")?.status).toBe("ready");
    h.reader.update(["a", "b"], true);
    expect(h.requests).toHaveLength(2);
  });
});
