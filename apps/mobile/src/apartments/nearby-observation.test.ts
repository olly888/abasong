import { expect, it, vi } from "vitest";
import {
  sameDiscoveryObservation,
  type DiscoveryObservation,
} from "./nearby-policy";
import { serialLatest } from "./serial-latest";
export const observation = (
  lat = 34.1,
  now = Date.now(),
): DiscoveryObservation => ({
  fix: {
    coords: { longitude: -118.1, latitude: lat, accuracy: 5 },
    timestamp: now,
  },
  approximate: false,
});
it("delivers a slow nearby lookup despite continuous sub-meter GPS jitter", async () => {
  vi.useFakeTimers();
  const replies: Array<(v: string) => void> = [];
  const receive = vi.fn();
  const queue = serialLatest(
    () => new Promise<string>((r) => replies.push(r)),
    receive,
    vi.fn(),
    sameDiscoveryObservation,
    2000,
  );
  try {
    const first = observation();
    queue.offer(first);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(2000);
      queue.offer(observation(34.1 + (i + 1) * 0.000002));
    }
    replies[0]("TEST nearby result");
    await vi.advanceTimersByTimeAsync(1);
    expect(receive).toHaveBeenCalledWith(first, "TEST nearby result");
  } finally {
    queue.dispose();
    vi.useRealTimers();
  }
});

it("does not reuse results after a real move, coarse/poor accuracy, stale or future observation", () => {
  const first = observation();
  expect(sameDiscoveryObservation(first, observation(34.101))).toBe(false);
  expect(
    sameDiscoveryObservation(first, { ...observation(), approximate: true }),
  ).toBe(false);
  expect(
    sameDiscoveryObservation(first, {
      fix: { ...first.fix, coords: { ...first.fix.coords, accuracy: 101 } },
      approximate: false,
    }),
  ).toBe(false);
  expect(
    sameDiscoveryObservation(observation(34.1, Date.now() - 21000), first),
  ).toBe(false);
  expect(
    sameDiscoveryObservation(first, observation(34.1, Date.now() + 2000)),
  ).toBe(false);
});
