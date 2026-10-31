import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RecognitionError,
  RecognitionGate,
  runRecognitionBatch,
} from "./recognition-work";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const events = () => ({
  start: vi.fn(),
  result: vi.fn(),
  failed: vi.fn(),
  paused: vi.fn(),
  progress: vi.fn(),
});
afterEach(() => vi.useRealTimers());
describe("native recognition wait boundaries", () => {
  it("does not start native work for an already stopped task", async () => {
    const gate = new RecognitionGate(),
      c = new AbortController(),
      job = vi.fn();
    c.abort();
    await expect(gate.run(job, c.signal)).rejects.toMatchObject({
      code: "OCR_CANCELLED",
    });
    expect(job).not.toHaveBeenCalled();
  });
  it("also stops cancellation between scheduling and native invocation", async () => {
    const gate = new RecognitionGate(),
      c = new AbortController(),
      job = vi.fn();
    const pending = expect(gate.run(job, c.signal)).rejects.toMatchObject({
      code: "OCR_CANCELLED",
    });
    c.abort();
    await pending;
    expect(job).not.toHaveBeenCalled();
  });
  it("stops waiting immediately but forbids overlapping native work until the late operation settles", async () => {
    const gate = new RecognitionGate(),
      c = new AbortController(),
      late = deferred<string>();
    const result = expect(
      gate.run(() => late.promise, c.signal),
    ).rejects.toMatchObject({ code: "OCR_CANCELLED" });
    await Promise.resolve();
    c.abort();
    await result;
    const second = vi.fn(async () => "TEST-second");
    await expect(gate.run(second)).rejects.toMatchObject({ code: "OCR_BUSY" });
    expect(second).not.toHaveBeenCalled();
    late.resolve("TEST-late");
    await Promise.resolve();
    await Promise.resolve();
    await expect(gate.run(second)).resolves.toBe("TEST-second");
  });
  it("bounds a hung image at 60 seconds without freeing a native slot early", async () => {
    vi.useFakeTimers();
    const gate = new RecognitionGate(),
      late = deferred<string>();
    const pending = expect(gate.run(() => late.promise)).rejects.toMatchObject({
      code: "OCR_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(60000);
    await pending;
    await expect(gate.run(async () => "duplicate")).rejects.toMatchObject({
      code: "OCR_BUSY",
    });
    late.reject(new Error("native eventually failed"));
    await Promise.resolve();
    await Promise.resolve();
    await expect(gate.run(async () => "TEST-retry")).resolves.toBe(
      "TEST-retry",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("releases native capacity after a failed image and clears deadline timers", async () => {
    vi.useFakeTimers();
    const gate = new RecognitionGate();
    await expect(
      gate.run(async () => {
        throw new Error("bad image");
      }),
    ).rejects.toThrow("bad image");
    await expect(gate.run(async () => "TEST-next")).resolves.toBe("TEST-next");
    expect(vi.getTimerCount()).toBe(0);
  });
});
describe("serial multiphoto interruption", () => {
  it("processes ten images serially and isolates a damaged image", async () => {
    const e = events();
    let concurrent = 0,
      peak = 0;
    const result = await runRecognitionBatch(
      Array.from({ length: 10 }, (_, i) => i),
      new AbortController().signal,
      async (i) => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await Promise.resolve();
        concurrent--;
        if (i === 4) throw new Error("damaged image");
        return `TEST-${i}`;
      },
      e,
    );
    expect(result).toEqual({ finished: 10, stopped: false });
    expect(peak).toBe(1);
    expect(e.result).toHaveBeenCalledTimes(9);
    expect(e.failed).toHaveBeenCalledTimes(1);
    expect(e.progress).toHaveBeenLastCalledWith(10, 10);
  });
  it("preserves completed rows while ignoring a late cancelled result and every later image", async () => {
    const c = new AbortController(),
      e = events(),
      second = deferred<string>();
    const work = vi.fn(async (i: number) =>
      i === 1 ? second.promise : `TEST-${i}`,
    );
    const running = runRecognitionBatch([0, 1, 2], c.signal, work, e);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(2));
    c.abort();
    second.resolve("TEST-late");
    expect(await running).toEqual({ finished: 1, stopped: true });
    expect(e.result.mock.calls).toEqual([[0, "TEST-0"]]);
    expect(e.paused).toHaveBeenCalledWith(1);
    const done = new Set(e.result.mock.calls.map((call) => call[0]));
    const retry = events();
    await runRecognitionBatch(
      [0, 1, 2].filter((i) => !done.has(i)),
      new AbortController().signal,
      async (i) => `TEST-${i}`,
      retry,
    );
    expect(retry.result.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  });
  it("returns control after stop even if the underlying native image never finishes", async () => {
    const c = new AbortController(),
      gate = new RecognitionGate(),
      late = deferred<string>(),
      e = events();
    const running = runRecognitionBatch(
      [0, 1],
      c.signal,
      () => gate.run(() => late.promise, c.signal),
      e,
    );
    await Promise.resolve();
    c.abort();
    expect(await running).toEqual({ finished: 0, stopped: true });
    expect(e.result).not.toHaveBeenCalled();
    late.resolve("TEST-late");
  });
  it("defers remaining images instead of launching a second native job after timeout", async () => {
    vi.useFakeTimers();
    const gate = new RecognitionGate(),
      late = deferred<string>(),
      e = events();
    const work = vi.fn(() => gate.run(() => late.promise, undefined, 10));
    const running = runRecognitionBatch(
      [0, 1, 2],
      new AbortController().signal,
      work,
      e,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(await running).toEqual({ finished: 1, stopped: true });
    expect(work).toHaveBeenCalledTimes(2);
    expect(e.failed.mock.calls[0][1]).toBeInstanceOf(RecognitionError);
    expect(e.paused).toHaveBeenCalledWith(1);
    expect(e.result).not.toHaveBeenCalled();
    late.resolve("TEST-late");
  });
});
