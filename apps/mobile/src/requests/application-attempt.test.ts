import { it, expect } from "vitest";
import { createApplicationAttempt } from "./application-attempt";
import { applicationInput, initialApplication } from "./application-input";
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

it("keeps an ASAP arrival suggestion inside the LA handoff day near midnight", () => {
  const now = Date.parse("2026-11-08T07:54:00Z");
  const request = deliveryFixture("delivery_handoff", now);
  const draft = initialApplication(request, now);
  expect(draft).toMatchObject({ date: "2026-11-07", time: "23:59" });
  expect(
    applicationInput(request, draft.date, draft.time, "").expected_arrival_at,
  ).toBe("2026-11-08T07:59:00.000Z");
  expect(() => applicationInput(request, "2026-11-08", "00:01", "")).toThrow(
    expect.objectContaining({ field: "arrival" }),
  );
});

it("uses a valid minute for a scheduled start with seconds and accepts arrival after listing cutoff", () => {
  const now = Date.parse("2026-11-07T17:00:00Z");
  const request = {
    ...deliveryFixture("warehouse_shortage", now),
    handoff_mode: "scheduled" as const,
    starts_at: "2026-11-07T18:00:25.000Z",
    pickup_deadline_at: "2026-11-07T18:02:59.000Z",
    expires_at: "2026-11-07T18:00:30.000Z",
  };
  expect(initialApplication(request, now)).toMatchObject({
    date: "2026-11-07",
    time: "10:01",
  });
  expect(
    applicationInput(request, "2026-11-07", "10:01", "").expected_arrival_at,
  ).toBe("2026-11-07T18:01:00.000Z");
  for (const time of ["10:00", "10:03"])
    expect(() => applicationInput(request, "2026-11-07", time, "")).toThrow(
      expect.objectContaining({ field: "arrival" }),
    );
});
