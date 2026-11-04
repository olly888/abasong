import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  getPosition: vi.fn(),
  cancel: vi.fn(async () => {}),
  legacy: vi.fn(),
  available: true,
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-location", () => ({
  getCurrentPositionAsync: mocks.legacy,
  Accuracy: { High: 4 },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-request" }));
vi.mock("expo", () => ({
  requireOptionalNativeModule: () =>
    mocks.available
      ? { getPosition: mocks.getPosition, cancel: mocks.cancel }
      : null,
}));
import { readDevicePosition } from "./device-position";
afterEach(() => {
  vi.clearAllMocks();
  mocks.platform.OS = "android";
  mocks.available = true;
});
describe("device position adapter", () => {
  it("maps a real native fix without generating coordinates", async () => {
    const fix = {
      coords: { latitude: 0, longitude: 0, accuracy: 10 },
      timestamp: Date.now(),
    };
    mocks.getPosition.mockResolvedValue(fix);
    expect(await readDevicePosition()).toBe(fix);
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it("rejects stale native results instead of treating them as current", async () => {
    mocks.getPosition.mockResolvedValue({
      coords: { latitude: 0, longitude: 0, accuracy: 10 },
      timestamp: Date.now() - 60_000,
    });
    await expect(readDevicePosition()).rejects.toThrow("location_timeout");
  });
  it("fails honestly when the binary does not contain the native module", async () => {
    mocks.available = false;
    await expect(readDevicePosition()).rejects.toThrow(
      "location_module_unavailable",
    );
  });
  it("retains iOS single foreground fix", async () => {
    mocks.platform.OS = "ios";
    const fix = {
      coords: { latitude: 0, longitude: 0, accuracy: 10 },
      timestamp: Date.now(),
    };
    mocks.legacy.mockResolvedValue(fix);
    expect(await readDevicePosition()).toBe(fix);
    expect(mocks.getPosition).not.toHaveBeenCalled();
  });
  it("cancels native collection on abort and rejects late results", async () => {
    let finish!: (value: unknown) => void;
    mocks.getPosition.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const control = new AbortController();
    const pending = readDevicePosition(control.signal);
    control.abort();
    expect(mocks.cancel).toHaveBeenCalledWith("test-request");
    finish({
      coords: { latitude: 0, longitude: 0, accuracy: 10 },
      timestamp: Date.now(),
    });
    await expect(pending).rejects.toThrow("location_cancelled");
  });
  it("does not start a native request for an already-aborted screen", async () => {
    const control = new AbortController();
    control.abort();
    await expect(readDevicePosition(control.signal)).rejects.toThrow(
      "location_cancelled",
    );
    expect(mocks.getPosition).not.toHaveBeenCalled();
  });
});
