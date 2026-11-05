import { afterEach, expect, it, vi } from "vitest";
import { boundedTokenLookup } from "./bounded";
afterEach(() => vi.useRealTimers());
it("releases an unresponsive native token lookup and ignores its late result", async () => {
  vi.useFakeTimers();
  let finish!: (value: string) => void;
  const call = boundedTokenLookup(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const failure = expect(call).rejects.toThrow("通知连接超时");
  await vi.advanceTimersByTimeAsync(8000);
  await failure;
  finish("TEST token");
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});
it("preserves the native lookup result and cancels the timeout", async () => {
  vi.useFakeTimers();
  await expect(boundedTokenLookup(async () => "TEST token")).resolves.toBe(
    "TEST token",
  );
  expect(vi.getTimerCount()).toBe(0);
});
