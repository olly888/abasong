import { it, expect } from "vitest";
import { createApplicationAttempt } from "./application-attempt";
import { initialApplication } from "./application-input";
import { deliveryFixture } from "./delivery-fixtures";
import type { ContributionRequest } from "../apartments/contribution-address-search";
it("never sends the old draft against a refreshed price/version or a different request", async () => {
  const r = deliveryFixture("warehouse_shortage"),
    fields = initialApplication(r);
  let calls = 0;
  const submit = createApplicationAttempt(
    r,
    (async () => {
      calls++;
    }) as ContributionRequest,
    () => "TEST-key",
  );
  for (const next of [
    { ...r, version: r.version + 1, price_cents: 999 },
    { ...r, id: "TEST-other" },
  ])
    await expect(
      submit(next, fields.date, fields.time, fields.capacity),
    ).rejects.toThrow("需求条件已更新");
  expect(calls).toBe(0);
});
it("coalesces double taps, reuses an uncertain intent and gives changed input a new intent", async () => {
  const r = deliveryFixture("warehouse_shortage"),
    f = initialApplication(r);
  const calls: { key?: string; body?: unknown }[] = [];
  let release: () => void = () => {},
    number = 0;
  const transport: ContributionRequest = async <T>(
    _p: string,
    o?: Parameters<ContributionRequest>[1],
  ) => {
    calls.push(o ?? {});
    if (calls.length === 1) {
      await new Promise<void>((resolve) => (release = resolve));
      throw new Error("TEST lost");
    }
    return { id: "TEST-result" } as T;
  };
  const submit = createApplicationAttempt(
    r,
    transport,
    () => `TEST-${++number}`,
  );
  const first = submit(r, f.date, f.time, f.capacity);
  const failure = expect(first).rejects.toThrow("TEST lost");
  expect(await submit(r, f.date, f.time, f.capacity)).toBeNull();
  release();
  await failure;
  await submit(r, f.date, f.time, f.capacity);
  expect(calls[1]).toEqual(calls[0]);
  await submit(r, f.date, f.time, "50");
  expect(calls[2]?.key).not.toBe(calls[1]?.key);
  expect(calls).toHaveLength(3);
});
