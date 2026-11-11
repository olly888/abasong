import { describe, expect, it, vi } from "vitest";
import {
  defaultDeliveryFields,
  changeDeliveryField,
  deliveryInput,
  hydrateDelivery,
} from "./delivery-fields";
import { deliveryFixture } from "./delivery-fixtures";
import { canApplyTo, requestQuantity, hasEditableGap } from "./presentation";
import { applicationInput, initialApplication } from "./application-input";
import { createDeliveryWriter } from "./delivery-writer";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { sameWarehouse, warehouseNavigation } from "./warehouse";
const now = Date.parse("2026-11-06T18:00:00Z");
const filled = () =>
  hydrateDelivery(deliveryFixture("warehouse_shortage", now), false, now)
    .fields;
describe("R4-08 two-scene native contracts", () => {
  it("chooses warehouse or contact pickup by scene and clears ASAP on future day", () => {
    const f = defaultDeliveryFields("delivery_handoff", now);
    expect(f.pickupKind).toBe("contact_handoff");
    const next = changeDeliveryField(f, "date", "2026-11-07", now);
    expect(next.asap).toBe(false);
    expect(next.endDate).toBe(next.date);
  });
  it("requires a conscious amount or negotiable and complete warehouse confirmation", () => {
    const f = filled();
    expect(() =>
      deliveryInput(
        "warehouse_shortage",
        { ...f, amount: "", unit: "per_parcel" },
        true,
        null,
        now,
      ),
    ).toThrow("报价");
    expect(() =>
      deliveryInput(
        "warehouse_shortage",
        { ...f, warehouse: { ...f.warehouse, confirmed: false } },
        true,
        null,
        now,
      ),
    ).toThrow("仓库");
    expect(
      deliveryInput(
        "warehouse_shortage",
        { ...f, amount: "", unit: "negotiable" },
        true,
        null,
        now,
      ).price_cents,
    ).toBeNull();
  });
  it("keeps unknown quantities null and omits temporary geometry/provider identifiers", () => {
    const f = changeDeliveryField(filled(), "quantityMode", "unknown", now);
    const input = deliveryInput("warehouse_shortage", f, true, null, now);
    expect(input.parcel_count).toBeNull();
    expect(input.quantity_mode).toBe("unknown");
    expect(input.pickup).not.toHaveProperty("point");
    expect(input.pickup).not.toHaveProperty("provider_result_id");
    expect(input).not.toHaveProperty("navigation_url");
  });
  it("does not relabel provider text as manually entered or retain region after changing pickup kind", () => {
    const f = filled();
    f.warehouse.source = "mapbox_suggestion";
    expect(
      deliveryInput("warehouse_shortage", f, true, null, now).pickup,
    ).toMatchObject({ address_source: "mapbox_suggestion" });
    const next = changeDeliveryField(f, "pickupKind", "contact_handoff", now);
    expect(next.pickupRegion).toBe("");
    expect(next.warehouse.line).toBe("");
  });
  it("preserves unchanged published ASAP time, but resets old scheduling when copying", () => {
    const r = {
      ...deliveryFixture("warehouse_shortage", now),
      status: "open" as const,
    };
    const f = hydrateDelivery(r, false, now).fields;
    expect(deliveryInput(r.scenario, f, true, r, now).starts_at).toBeNull();
    const copy = hydrateDelivery(r, true, now + 86400000).fields;
    expect(copy.date).toBe("2026-11-07");
    expect(copy.pickupEnd).toBe("");
    expect(copy.customExpiry).toBe(false);
  });
  it("rejects stale ASAP day and nonexistent or ambiguous LA scheduled hours", () => {
    const f = filled();
    expect(() =>
      deliveryInput(
        "warehouse_shortage",
        { ...f, date: "2026-11-07" },
        true,
        null,
        now,
      ),
    ).toThrow("尽快");
    expect(() =>
      deliveryInput(
        "warehouse_shortage",
        { ...f, asap: false, date: "2027-03-14", start: "02:30" },
        false,
        null,
        now,
      ),
    ).toThrow("夏令时");
  });
  it("estimate and unknown remain applicable without inventing a numeric gap", () => {
    const r = { ...deliveryFixture(), status: "open" as const };
    expect(requestQuantity(r)).toBe("约 150 件");
    expect(canApplyTo(r)).toBe(true);
    expect(
      requestQuantity({ ...r, quantity_mode: "unknown", parcel_count: null }),
    ).toBe("数量待确认");
    expect(canApplyTo({ ...r, remaining_drivers: 0 })).toBe(false);
    expect(
      canApplyTo({ ...r, quantity_mode: "exact", remaining_parcels: 0 }),
    ).toBe(false);
  });
  it("clears unknown-quantity minimum, rejects unconfirmed whole-route and avoids an empty gap editor", () => {
    const f = changeDeliveryField(
      { ...filled(), minimum: "50" },
      "quantityMode",
      "unknown",
      now,
    );
    expect(f.minimum).toBe("");
    expect(
      deliveryInput(
        "warehouse_shortage",
        { ...f, minimum: "50" },
        true,
        null,
        now,
      ).minimum_parcels,
    ).toBeNull();
    expect(() =>
      deliveryInput(
        "warehouse_shortage",
        { ...f, scope: "whole_route" },
        true,
        null,
        now,
      ),
    ).toThrow("整批");
    expect(hasEditableGap({ ...deliveryFixture(), drivers_needed: null })).toBe(
      false,
    );
    expect(hasEditableGap(deliveryFixture())).toBe(true);
  });
  it("allows optional capacity for unknown/estimate, enforces known minimum and whole-route exact quantity", () => {
    const r = deliveryFixture("warehouse_shortage", now);
    expect(applicationInput(r, "2026-11-06", "12:00", "")).not.toHaveProperty(
      "capacity_parcels",
    );
    expect(() =>
      applicationInput(
        { ...r, minimum_parcels: 50 },
        "2026-11-06",
        "12:00",
        "20",
      ),
    ).toThrow("至少");
    const exact = {
      ...r,
      quantity_mode: "exact" as const,
      remaining_parcels: 100,
      accepts_partial: false,
    };
    expect(() => applicationInput(exact, "2026-11-06", "12:00", "90")).toThrow(
      "整批",
    );
    expect(initialApplication({ ...r, starts_at: null }, now).date).toBe(
      "2026-11-06",
    );
  });
  it("warehouse matching requires full address and postal agreement; navigation URL is encoded and fixed-host", () => {
    const w = deliveryFixture().pickup;
    if (w?.kind !== "warehouse") throw new Error("fixture");
    expect(
      sameWarehouse(w, {
        address_line1: "2445 East Del Mar Boulevard",
        city: "Pasadena",
        state: "CA",
        postal_code: "91107",
      }),
    ).toBe(true);
    expect(
      sameWarehouse(w, {
        address_line1: "2445 E Del Mar Blvd",
        city: "Pasadena",
        state: "CA",
        postal_code: "91106",
      }),
    ).toBe(false);
    const url = new URL(
      warehouseNavigation({ ...w, address_line1: "12 A&B #5" }),
    );
    expect(url.host).toBe("www.google.com");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toContain("12 A&B #5");
  });
  it("retains draft and idempotency key after failed publication, without duplicate creation or patch", async () => {
    const calls: { path: string; key?: string }[] = [];
    let publishes = 0;
    const transport: ContributionRequest = async <T>(
      path: string,
      options?: { key?: string },
    ) => {
      calls.push({ path, key: options?.key });
      if (path.endsWith("/publish") && ++publishes === 1)
        throw new Error("network");
      return {
        ...deliveryFixture(),
        status: path.endsWith("/publish") ? "open" : "draft",
      } as T;
    };
    const writer = createDeliveryWriter(transport, () => "key-" + calls.length);
    const input = deliveryInput(
      "warehouse_shortage",
      filled(),
      true,
      null,
      now,
    );
    await expect(writer.save(input, true)).rejects.toThrow("network");
    const result = await writer.save(input, true);
    expect(result.status).toBe("open");
    expect(calls.filter((c) => c.path === "/v1/requests")).toHaveLength(1);
    expect(calls[1]?.key).toBe(calls[2]?.key);
  });
  it("published editing uses expected version and only commits when writer is explicitly called", async () => {
    const r = { ...deliveryFixture(), status: "open" as const, version: 4 };
    const spy = vi.fn(async () => ({ ...r, version: 5 }));
    const writer = createDeliveryWriter(
      spy as ContributionRequest,
      () => "key",
      r,
    );
    expect(spy).not.toHaveBeenCalled();
    await writer.save(
      deliveryInput(r.scenario, hydrateDelivery(r).fields, true, r),
      true,
    );
    expect(spy).toHaveBeenCalledOnce();
    const sent = (
      spy.mock.calls[0] as unknown as [
        string,
        { body: Record<string, unknown> },
      ]
    )[1].body;
    expect(sent).not.toHaveProperty("starts_at");
    expect(sent).not.toHaveProperty("handoff_mode");
    expect(sent).not.toHaveProperty("handoff_date");
    expect(spy.mock.calls[0]).toEqual([
      `/v1/requests/${r.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          request_schema_version: 2,
          expected_version: 4,
        }),
      }),
    ]);
    expect(spy.mock.calls[0]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({ scenario: r.scenario }),
        }),
      ]),
    );
  });
});
