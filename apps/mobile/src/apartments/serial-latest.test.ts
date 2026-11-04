import { describe, expect, it, vi } from "vitest";
import { serialLatest } from "./serial-latest";
describe("foreground lookup coalescing", () => {
  it("invalidates an old result across a permission/accuracy interruption even at the same position", async () => {
    const resolvers: Array<(value: number) => void> = [];
    const run = vi.fn(
      () => new Promise<number>((resolve) => resolvers.push(resolve)),
    );
    const receive = vi.fn();
    const queue = serialLatest(run, receive, vi.fn());
    queue.offer(1);
    queue.invalidate();
    queue.offer(1);
    resolvers[0](10);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(receive).not.toHaveBeenCalled();
    resolvers[1](20);
    await vi.waitFor(() => expect(receive).toHaveBeenCalledWith(1, 20));
  });
  it("limits request starts and cancels delayed work on disposal", async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async (value: number) => value);
      const queue = serialLatest(run, vi.fn(), vi.fn(), undefined, 2000);
      queue.offer(1);
      await vi.advanceTimersByTimeAsync(1);
      queue.offer(2);
      queue.offer(3);
      await vi.advanceTimersByTimeAsync(1998);
      expect(run).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(run).toHaveBeenLastCalledWith(3);
      queue.offer(4);
      queue.dispose();
      await vi.advanceTimersByTimeAsync(4000);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps only the latest queued position and drops stale responses", async () => {
    const resolvers: Array<(value: number) => void> = [];
    const run = vi.fn(
      () => new Promise<number>((resolve) => resolvers.push(resolve)),
    );
    const receive = vi.fn(),
      failed = vi.fn();
    const queue = serialLatest(run, receive, failed);
    queue.offer(1);
    queue.offer(2);
    queue.offer(3);
    expect(run).toHaveBeenCalledTimes(1);
    resolvers[0](11);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run.mock.calls[1]).toEqual([3]);
    expect(receive).not.toHaveBeenCalled();
    resolvers[1](33);
    await vi.waitFor(() => expect(receive).toHaveBeenCalledWith(3, 33));
    expect(failed).not.toHaveBeenCalled();
  });
  it("disposal suppresses late success and never starts queued work", async () => {
    let resolve!: (value: number) => void;
    const run = vi.fn(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );
    const receive = vi.fn();
    const queue = serialLatest(run, receive, vi.fn());
    queue.offer(1);
    queue.offer(2);
    queue.dispose();
    resolve(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    expect(receive).not.toHaveBeenCalled();
  });
  it("recovers from a failed request without losing the newer observation", async () => {
    let reject!: (error: Error) => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, r) => {
            reject = r;
          }),
      )
      .mockResolvedValue(2);
    const receive = vi.fn(),
      failed = vi.fn();
    const queue = serialLatest(run, receive, failed);
    queue.offer(1);
    queue.offer(2);
    reject(new Error("offline"));
    await vi.waitFor(() => expect(receive).toHaveBeenCalledWith(2, 2));
    expect(failed).not.toHaveBeenCalled();
  });
});
