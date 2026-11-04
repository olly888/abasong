import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { heartbeatPath, isHeartbeatHealthy, writeHeartbeat } from "./heartbeat";
import { startWorkerLoop } from "./loop";

afterEach(() => vi.useRealTimers());

it("refuses missing, failed, stale, future and corrupt heartbeat records", async () => {
  const folder = await mkdtemp(join(tmpdir(), "abasong-heartbeat-"));
  const path = join(folder, "health.json");
  try {
    expect(await isHeartbeatHealthy(path, 30000, 100000)).toBe(false);
    await writeHeartbeat(path, true, 90000);
    expect(await isHeartbeatHealthy(path, 30000, 100000)).toBe(true);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await isHeartbeatHealthy(path, 30000, 200000)).toBe(false);
    expect(await isHeartbeatHealthy(path, 30000, 80000)).toBe(false);
    await writeHeartbeat(path, false, 100000);
    expect(await isHeartbeatHealthy(path, 30000, 100000)).toBe(false);
    await writeFile(path, "broken");
    expect(await isHeartbeatHealthy(path, 30000, 100000)).toBe(false);
    expect(await isHeartbeatHealthy(path, 0, 100000)).toBe(false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

it("bounds cloud heartbeat writes to the writable task volume", () => {
  expect(heartbeatPath({ ABASONG_ENV: "pilot-dev" })).toBe(
    "/app-tmp/worker-health.json",
  );
  expect(() =>
    heartbeatPath({
      ABASONG_ENV: "pilot-dev",
      WORKER_HEARTBEAT_PATH: "/app/secret",
    }),
  ).toThrow();
});

it("does not overlap polls and waits for the active operation before shutdown", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const probe = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const stop = startWorkerLoop(probe, 1000);
  await vi.advanceTimersByTimeAsync(10000);
  expect(probe).toHaveBeenCalledTimes(1);
  let stopped = false;
  const result = stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  finish();
  await result;
  await vi.advanceTimersByTimeAsync(10000);
  expect(stopped).toBe(true);
  expect(probe).toHaveBeenCalledTimes(1);
});

it("schedules the next poll only after the previous one finishes", async () => {
  vi.useFakeTimers();
  const probe = vi.fn(async () => undefined);
  const stop = startWorkerLoop(probe, 1000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(probe).toHaveBeenCalledTimes(2);
  await stop();
  expect(() => startWorkerLoop(probe, 100)).toThrow();
});
