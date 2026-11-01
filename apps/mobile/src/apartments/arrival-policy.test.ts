import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrivalNeedsReset,
  assessArrival,
  assessHomeArrival,
  startForegroundRefresh,
} from "./arrival-policy";
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
const position = { lng: 0, lat: 0 };
const matched: components["schemas"]["ResolveResult"] = {
  status: "matched",
  match_basis: "boundary",
  matched_id: "a",
  candidates: [p],
  config_version: 1,
};
afterEach(() => vi.useRealTimers());
describe("arrival safeguards", () => {
  it("requires stable repeated server matches, never mere proximity", () => {
    const first = assessArrival(null, matched, 1000, 1000, false, position);
    expect(first.apartment).toBeNull();
    expect(
      assessArrival(first.state, matched, 10_000, 10_000, false, position)
        .apartment,
    ).toBe(p);
    expect(
      assessArrival(
        first.state,
        { ...matched, status: "candidates" },
        10_000,
        10_000,
        false,
        position,
      ).apartment,
    ).toBeNull();
  });
  it("never promotes unverified or malformed matches", () => {
    for (const result of [
      { ...matched, candidates: [] },
      { ...matched, candidates: [{ ...p, confidence: "unverified" as const }] },
      { ...matched, matched_id: "other" },
    ])
      expect(
        assessArrival(null, result, 1000, 1000, false, position).state,
      ).toBeNull();
  });
  it("rejects stale, future, repeated observations and resets after gaps", () => {
    const state = {
      id: "a",
      since: 1000,
      lastObserved: 1000,
      anchor: position,
      matchBasis: "boundary" as const,
    };
    expect(
      assessArrival(state, matched, 1000, 30_000, false, position).state,
    ).toBeNull();
    expect(
      assessArrival(state, matched, 30_000, 1000, false, position).state,
    ).toBeNull();
    expect(
      assessArrival(state, matched, 1000, 1000, false, position).apartment,
    ).toBeNull();
    expect(
      assessArrival(state, matched, 30_000, 30_000, false, position).apartment,
    ).toBeNull();
    expect(
      assessArrival(state, matched, 10_000, 10_000, true, position).state,
    ).toBeNull();
  });
  it("restarts dwell after a matching-policy version change", () => {
    const first = assessArrival(null, matched, 1000, 1000, false, position);
    expect(
      assessArrival(
        first.state,
        { ...matched, config_version: 2 },
        10000,
        10000,
        false,
        position,
      ).apartment,
    ).toBeNull();
    expect(
      assessArrival(first.state, matched, 900, 1000, false, position).state,
    ).toBeNull();
  });
  it("clears an automatic card when its match is stale or no longer trusted", () => {
    const previous = {
      id: "a",
      since: 1000,
      lastObserved: 9000,
      configVersion: 1,
      anchor: position,
      matchBasis: "boundary" as const,
    };
    for (const result of [
      { ...matched, status: "candidates" as const },
      { ...matched, candidates: [] },
      { ...matched, config_version: 2 },
      { ...matched, candidates: [{ ...p, confidence: "unverified" as const }] },
    ]) {
      const next = assessHomeArrival(
        previous,
        "a",
        result,
        11000,
        11000,
        false,
        position,
      );
      expect(next.clearAutomaticCard).toBe(true);
      expect(next.apartment).toBeNull();
    }
    expect(
      assessHomeArrival(previous, "a", matched, 11000, 40000, false, position)
        .clearAutomaticCard,
    ).toBe(true);
    expect(
      assessHomeArrival(previous, "a", matched, 11000, 11000, false, position)
        .clearAutomaticCard,
    ).toBe(false);
  });
  it("starts the new apartment's dwell at the first observation while clearing the old card", () => {
    const previous = {
      id: "a",
      since: 1000,
      lastObserved: 9000,
      configVersion: 1,
      anchor: position,
      matchBasis: "boundary" as const,
    };
    const nextMatch = {
      ...matched,
      matched_id: "b",
      candidates: [{ ...p, id: "b" }],
    };
    const first = assessHomeArrival(
      previous,
      "a",
      nextMatch,
      11000,
      11000,
      false,
      position,
    );
    expect(first.clearAutomaticCard).toBe(true);
    expect(first.apartment).toBeNull();
    const next = assessHomeArrival(
      first.state,
      undefined,
      nextMatch,
      19000,
      19000,
      false,
      position,
    );
    expect(next.apartment?.id).toBe("b");
  });
  it("preserves an explicitly opened card until the user returns to automatic location", () => {
    const previous = {
      id: "a",
      since: 1000,
      lastObserved: 9000,
      configVersion: 1,
      anchor: position,
      matchBasis: "boundary" as const,
    };
    const empty = {
      ...matched,
      status: "unknown" as const,
      matched_id: null,
      candidates: [],
    };
    expect(
      assessHomeArrival(previous, "a", empty, 11000, 11000, true, position)
        .clearAutomaticCard,
    ).toBe(false);
    expect(
      assessHomeArrival(null, "a", empty, 11000, 11000, false, position)
        .clearAutomaticCard,
    ).toBe(true);
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

it("does not count moving between two entrances of one property as stationary dwell", () => {
  // Public OSM gate points, never a driver location history.
  const g1 = { lng: -117.9130501, lat: 34.0280136 };
  const g2 = { lng: -117.912336, lat: 34.0267054 };
  const result = { ...matched, match_basis: "entrance" as const };
  const first = assessArrival(null, result, 1000, 1000, false, g1);
  const moved = assessArrival(first.state, result, 10000, 10000, false, g2);
  expect(moved.apartment).toBeNull();
  expect(moved.state?.since).toBe(10000);
});

it("allows small stationary drift but resets gradual movement from the original anchor", () => {
  const first = assessArrival(null, matched, 1000, 1000, false, position);
  expect(
    assessArrival(first.state, matched, 10000, 10000, false, {
      lng: 0.00006,
      lat: 0,
    }).apartment,
  ).toBe(p);
  const middle = assessArrival(first.state, matched, 5000, 5000, false, {
    lng: 0.0001,
    lat: 0,
  });
  const moved = assessArrival(middle.state, matched, 10000, 10000, false, {
    lng: 0.0002,
    lat: 0,
  });
  expect(moved.apartment).toBeNull();
  expect(moved.state?.since).toBe(10000);
  expect(first.state?.anchor).toEqual(position);
});
it("starts a fresh dwell when the recognition basis changes at the same apartment", () => {
  const first = assessArrival(null, matched, 1000, 1000, false, position);
  const next = assessArrival(
    first.state,
    { ...matched, match_basis: "entrance" },
    10000,
    10000,
    false,
    position,
  );
  expect(next.apartment).toBeNull();
  expect(next.state?.since).toBe(10000);
});
it("rejects invalid observations or a match with no recognition basis", () => {
  for (const point of [
    { lng: NaN, lat: 0 },
    { lng: 0, lat: 91 },
    { lng: 181, lat: 0 },
  ])
    expect(
      assessArrival(null, matched, 1000, 1000, false, point).state,
    ).toBeNull();
  expect(
    assessArrival(
      null,
      { ...matched, match_basis: undefined },
      1000,
      1000,
      false,
      position,
    ).state,
  ).toBeNull();
});

describe("automatic card while the next lookup is slow", () => {
  const stable = assessArrival(
    null,
    matched,
    1000,
    1000,
    false,
    position,
  ).state;
  const fix = (lng = 0, timestamp = 11000) => ({
    coords: { longitude: lng, latitude: 0, accuracy: 2 },
    timestamp,
  });
  it("invalidates departure on the new observation before any server response", () => {
    expect(
      arrivalNeedsReset(stable, 11000, false, {
        fix: fix(0.0004),
        approximate: false,
      }),
    ).toBe(true);
    expect(
      arrivalNeedsReset(stable, 11000, false, {
        fix: fix(0.000004),
        approximate: false,
      }),
    ).toBe(false);
  });
  it("expires server evidence even if fresh GPS keeps arriving", () => {
    expect(
      arrivalNeedsReset(stable, 21000, false, {
        fix: fix(0, 21000),
        approximate: false,
      }),
    ).toBe(false);
    expect(
      arrivalNeedsReset(stable, 21001, false, {
        fix: fix(0, 21001),
        approximate: false,
      }),
    ).toBe(true);
    expect(arrivalNeedsReset(stable, 21001, false)).toBe(true);
  });
  it("removes automatic evidence after coarse or invalid fixes without inventing a replacement", () => {
    for (const observation of [
      { fix: fix(), approximate: true },
      {
        fix: { ...fix(), coords: { ...fix().coords, accuracy: null } },
        approximate: false,
      },
      { fix: fix(NaN), approximate: false },
      { fix: fix(0, -11000), approximate: false },
    ])
      expect(arrivalNeedsReset(stable, 11000, false, observation)).toBe(true);
    expect(arrivalNeedsReset(null, 22000, false)).toBe(false);
  });
  it("preserves deliberately opened reading until recenter releases the lock", () => {
    expect(
      arrivalNeedsReset(stable, 22000, true, {
        fix: fix(0.1, 22000),
        approximate: true,
      }),
    ).toBe(false);
    expect(
      arrivalNeedsReset(stable, 22000, false, {
        fix: fix(0.1, 22000),
        approximate: true,
      }),
    ).toBe(true);
  });
});
