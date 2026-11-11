import { describe, expect, it, vi } from "vitest";
import { acquireForegroundLocation } from "./foreground-location";
function device(granted = true, canAskAgain = true) {
  return {
    permission: vi.fn(async () => ({ granted, canAskAgain })),
    request: vi.fn(async () => ({ granted: true, canAskAgain: true })),
    enabled: vi.fn(async () => true),
    fix: vi.fn(async () => ({
      coords: { longitude: 0, latitude: 0, accuracy: 10 },
      timestamp: Date.now(),
    })),
  };
}
describe("foreground device acquisition", () => {
  it("does not prompt or collect a fix on passive visits without permission", async () => {
    const d = device(false);
    expect(await acquireForegroundLocation(d, false)).toEqual({
      status: "permission",
      blocked: false,
    });
    expect(d.request).not.toHaveBeenCalled();
    expect(d.fix).not.toHaveBeenCalled();
  });
  it("does not repeat a permanently denied permission request", async () => {
    const d = device(false, false);
    expect(await acquireForegroundLocation(d, true)).toEqual({
      status: "permission",
      blocked: true,
    });
    expect(d.request).not.toHaveBeenCalled();
  });
  it("explicit action requests permission then obtains a fix", async () => {
    const d = device(false);
    expect((await acquireForegroundLocation(d, true)).status).toBe("fix");
    expect(d.request).toHaveBeenCalledOnce();
  });
  it("identifies disabled services without mislabelling a lookup failure", async () => {
    const d = device();
    d.enabled.mockResolvedValue(false);
    expect(await acquireForegroundLocation(d, true)).toEqual({
      status: "services_off",
    });
    expect(d.fix).not.toHaveBeenCalled();
  });
  it("rejects stale and future fixes on every platform", async () => {
    for (const timestamp of [Date.now() - 60_000, Date.now() + 60_000]) {
      const d = device();
      d.fix.mockResolvedValue({
        coords: { longitude: 0, latitude: 0, accuracy: 10 },
        timestamp,
      });
      await expect(acquireForegroundLocation(d, false)).rejects.toThrow(
        "location_timeout",
      );
    }
  });
  it("bounds a hung OS fix and releases its timer", async () => {
    vi.useFakeTimers();
    try {
      const d = device();
      d.fix.mockImplementation(() => new Promise(() => {}));
      const pending = expect(
        acquireForegroundLocation(d, true),
      ).rejects.toThrow("location_timeout");
      await vi.advanceTimersByTimeAsync(20_000);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
