import { afterEach, describe, expect, it, vi } from "vitest";
import { assessArrival, startForegroundRefresh } from "./arrival-policy";
import type { components } from "@abasong/contracts";
const p: components["schemas"]["Apartment"] = {
  id: "a",
  name: null,
  address_line1: "1 Example St",
  city: "Example",
  state: "CA",
  postal_code: null,
  point: { lng: 0, lat: 0 },
  confidence: "field_verified",
};
const matched: components["schemas"]["ResolveResult"] = {
  status: "matched",
  matched_id: "a",
  candidates: [p],
  config_version: 1,
};
afterEach(() => vi.useRealTimers());
describe("arrival safeguards", () => {
  it("requires stable repeated server matches, never mere proximity", () => {
    const first = assessArrival(null, matched, 1000, 1000, false);
    expect(first.apartment).toBeNull();
    expect(
      assessArrival(first.state, matched, 10_000, 10_000, false).apartment,
    ).toBe(p);
    expect(
      assessArrival(
        first.state,
        { ...matched, status: "candidates" },
        10_000,
        10_000,
        false,
      ).apartment,
    ).toBeNull();
  });
  it("never promotes unverified or malformed matches", () => {
    for (const result of [
      { ...matched, candidates: [] },
      { ...matched, candidates: [{ ...p, confidence: "unverified" as const }] },
      { ...matched, matched_id: "other" },
    ])
      expect(assessArrival(null, result, 1000, 1000, false).state).toBeNull();
  });
  it("rejects stale, future, repeated observations and resets after gaps", () => {
    const state = { id: "a", since: 1000, lastObserved: 1000 };
    expect(assessArrival(state, matched, 1000, 30_000, false).state).toBeNull();
    expect(assessArrival(state, matched, 30_000, 1000, false).state).toBeNull();
    expect(
      assessArrival(state, matched, 1000, 1000, false).apartment,
    ).toBeNull();
    expect(
      assessArrival(state, matched, 30_000, 30_000, false).apartment,
    ).toBeNull();
    expect(
      assessArrival(state, matched, 10_000, 10_000, true).state,
    ).toBeNull();
  });
  it("serializes refreshes and stops scheduling on cleanup", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    const stop = startForegroundRefresh(refresh, () => true, 10);
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(1);
    stop();
    finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("recovers scheduling after a transient adapter failure", async () => {
    vi.useFakeTimers();
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue(undefined);
    const stop = startForegroundRefresh(refresh, () => true, 10);
    await vi.advanceTimersByTimeAsync(20);
    stop();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
  it("does not acquire in the background", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {});
    const stop = startForegroundRefresh(refresh, () => false, 10);
    await vi.advanceTimersByTimeAsync(100);
    stop();
    expect(refresh).not.toHaveBeenCalled();
  });
});
