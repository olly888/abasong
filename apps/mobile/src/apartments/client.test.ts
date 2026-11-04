import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../auth/supabase", () => ({
  supabase: { auth: { refreshSession: mocks.refresh } },
}));
import { dataRequest } from "./client";
const session = {
  access_token: "TEST-old",
  user: { id: "TEST-owner" },
} as Session;
const fetcher = vi.fn();
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  mocks.refresh.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
describe("business API weak-network/session boundaries", () => {
  it("surfaces offline failure without automatically repeating a mutation", async () => {
    fetcher.mockRejectedValue(new TypeError("offline"));
    await expect(
      dataRequest(session, "/v1/me/import-batches", {
        method: "POST",
        key: "TEST-key",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts a hung request at its deadline and allows an explicit later retry", async () => {
    vi.useFakeTimers();
    fetcher
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener("abort", () =>
              reject(new Error("aborted")),
            ),
          ),
      )
      .mockResolvedValueOnce(ok());
    const pending = expect(
      dataRequest(session, "/v1/me/import-batches"),
    ).rejects.toMatchObject({ code: "NETWORK_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    await expect(
      dataRequest(session, "/v1/me/import-batches"),
    ).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not send an already-cancelled screen request", async () => {
    const c = new AbortController();
    c.abort();
    await expect(
      dataRequest(session, "/v1/me/import-batches", { signal: c.signal }),
    ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels in-flight work and never refreshes the session after navigation", async () => {
    const c = new AbortController();
    fetcher.mockImplementation(
      (_u, o) =>
        new Promise((_r, reject) =>
          o.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const pending = expect(
      dataRequest(session, "/v1/me/import-batches", { signal: c.signal }),
    ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    c.abort();
    await pending;
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("refreshes a 401 once with the same mutation key and body", async () => {
    fetcher
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(ok());
    mocks.refresh.mockResolvedValue({
      data: { session: { ...session, access_token: "TEST-new" } },
      error: null,
    });
    await dataRequest(session, "/v1/me/import-batches", {
      method: "POST",
      key: "TEST-idempotent",
      body: { client_batch_id: "TEST-batch" },
    });
    const first = fetcher.mock.calls[0][1],
      next = fetcher.mock.calls[1][1];
    expect(next.body).toBe(first.body);
    expect(next.headers["Idempotency-Key"]).toBe(
      first.headers["Idempotency-Key"],
    );
    expect(next.headers.Authorization).toBe("Bearer TEST-new");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("refuses to resend under a different signed-in identity", async () => {
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    mocks.refresh.mockResolvedValue({
      data: { session: { ...session, user: { id: "TEST-other" } } },
      error: null,
    });
    await expect(
      dataRequest(session, "/v1/me/import-batches"),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not turn a permission denial into a retry or session refresh", async () => {
    fetcher.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: "CAPABILITY_REQUIRED",
          message: "当前没有共享资格",
        }),
        { status: 403 },
      ),
    );
    await expect(
      dataRequest(session, "/v1/me/import-batches"),
    ).rejects.toMatchObject({ status: 403, code: "CAPABILITY_REQUIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("session refresh under weak network", () => {
  it("bounds a hung refresh without resending the business mutation", async () => {
    vi.useFakeTimers();
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    mocks.refresh.mockImplementation(() => new Promise(() => {}));
    const pending = expect(
      dataRequest(session, "/v1/me/import-batches", {
        method: "POST",
        key: "TEST-key",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "NETWORK_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels refresh waiting and ignores a later SDK result after leaving", async () => {
    const c = new AbortController();
    let finish!: (value: unknown) => void;
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    mocks.refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = expect(
      dataRequest(session, "/v1/me/import-batches", { signal: c.signal }),
    ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    c.abort();
    await pending;
    finish({
      data: { session: { ...session, access_token: "TEST-new" } },
      error: null,
    });
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
