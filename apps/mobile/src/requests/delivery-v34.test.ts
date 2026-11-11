import { describe, expect, it } from "vitest";
import { deliveryFixture } from "./delivery-fixtures";
import {
  changeDeliveryField,
  defaultDeliveryFields,
  deliveryInput,
  effectiveDeliveryTimes,
  hydrateDelivery,
  laDayEnd,
} from "./delivery-fields";

const now = Date.parse("2026-11-06T18:00:00Z");
const warehouse = "warehouse_shortage" as const;
const handoff = "delivery_handoff" as const;
const seed = () =>
  hydrateDelivery(deliveryFixture(warehouse, now), false, now).fields;
const input = (overrides: Partial<ReturnType<typeof seed>>) =>
  deliveryInput(
    warehouse,
    { ...seed(), customExpiry: false, ...overrides },
    true,
    null,
    now,
  );

describe("V3.4 delivery publishing", () => {
  it("uses scene-specific defaults, allows an unfilled draft and does not invent an arrival", () => {
    const f = defaultDeliveryFields(warehouse, now);
    expect(f).toMatchObject({
      pickupKind: "warehouse",
      date: "2026-11-06",
      asap: false,
      start: "",
      quantityMode: "estimate",
      drivers: "1",
    });
    expect(defaultDeliveryFields(handoff, now)).toMatchObject({
      pickupKind: "contact_handoff",
      asap: true,
      start: "",
      quantityMode: "exact",
      drivers: "",
    });
    expect(deliveryInput(warehouse, f, false, null, now).starts_at).toBeNull();
    expect(
      hydrateDelivery(
        {
          ...deliveryFixture(warehouse, now),
          starts_at: null,
          handoff_mode: "scheduled",
        },
        false,
        now,
      ).fields.start,
    ).toBe("");
  });

  it("does not erase inputs on the same date, but clears arrival on a new day and amount on a new unit", () => {
    const f = {
      ...seed(),
      asap: false,
      start: "13:00",
      amount: "1.85",
      route: "TEST route",
    };
    expect(changeDeliveryField(f, "date", f.date, now)).toEqual(f);
    const moved = changeDeliveryField(f, "date", "2026-11-07", now);
    expect(moved).toMatchObject({
      date: "2026-11-07",
      start: "",
      amount: "1.85",
      route: "TEST route",
    });
    expect(changeDeliveryField(moved, "unit", "per_route", now)).toMatchObject({
      amount: "",
      route: "TEST route",
    });
    expect(() => input(moved)).toThrow(
      expect.objectContaining({ field: "start" }),
    );
  });

  it("reports the first visible missing field and does not retain address confirmation or pickup area after a change", () => {
    const f = seed();
    expect(() =>
      input({ warehouse: { ...f.warehouse, city: "" }, carrier: "" }),
    ).toThrow(expect.objectContaining({ field: "warehouseCity" }));
    expect(() => input({ region: "", carrier: "" })).toThrow(
      expect.objectContaining({ field: "region" }),
    );
    expect(() => input({ amount: "1.999" })).toThrow(
      expect.objectContaining({ field: "amount" }),
    );
    const moved = changeDeliveryField(
      f,
      "warehouse",
      { ...f.warehouse, postal: "91790" },
      now,
    );
    expect(moved).toMatchObject({
      pickupRegion: "",
      warehouse: { confirmed: false },
    });
    expect(() => input(moved)).toThrow(
      expect.objectContaining({ field: "warehouseConfirm" }),
    );
    expect(
      changeDeliveryField(
        f,
        "warehouse",
        { ...f.warehouse, name: "TEST warehouse" },
        now,
      ).pickupRegion,
    ).toBe(f.pickupRegion);
  });

  it("shows the actual automatic, cutoff-based and explicit expiry using LA calendar days", () => {
    expect(laDayEnd("2027-03-14")).toBe("2027-03-15T06:59:59.999Z");
    expect(laDayEnd("2027-11-07")).toBe("2027-11-08T07:59:59.999Z");
    const auto = input({ completion: "next_day", deliveryEnd: "" });
    expect(auto.expires_at).toBeNull();
    expect(effectiveDeliveryTimes(auto)).toEqual({
      expiry: "2026-11-07T07:59:59.999Z",
      completion: "2026-11-08T07:59:59.999Z",
    });
    expect(effectiveDeliveryTimes(input({ pickupEnd: "15:00" })).expiry).toBe(
      "2026-11-06T23:00:00.000Z",
    );
    const custom = input({
      customExpiry: true,
      endDate: "2026-11-06",
      end: "14:00",
      pickupEnd: "15:00",
    });
    expect(effectiveDeliveryTimes(custom).expiry).toBe(
      "2026-11-06T22:00:00.000Z",
    );
  });

  it("points expired arrivals and contradictory deadlines to the editable fields", () => {
    const f = { asap: false, start: "13:00" };
    expect(() => input({ ...f, start: "09:00" })).toThrow(
      expect.objectContaining({ field: "start" }),
    );
    expect(() => input({ ...f, pickupEnd: "12:00" })).toThrow(
      expect.objectContaining({ field: "pickupEnd" }),
    );
    expect(() => input({ ...f, customExpiry: true, end: "13:00" })).toThrow(
      expect.objectContaining({ field: "end" }),
    );
    expect(() =>
      input({ ...f, pickupEnd: "14:00", customExpiry: true, end: "15:00" }),
    ).toThrow(expect.objectContaining({ field: "end" }));
    expect(() =>
      input({ ...f, deliveryEnd: "12:00", completion: "same_day" }),
    ).toThrow(expect.objectContaining({ field: "deliveryEnd" }));
  });

  it("preserves existing past scheduled arrival with seconds and does not change an automatic day-end on edit", () => {
    const r = {
      ...deliveryFixture(warehouse, now),
      status: "open" as const,
      handoff_mode: "scheduled" as const,
      starts_at: "2026-11-06T17:00:25.000Z",
      expires_at: laDayEnd("2026-11-06"),
      delivery_deadline_at: laDayEnd("2026-11-06"),
    };
    const f = hydrateDelivery(r, false, now).fields;
    expect(f).toMatchObject({ customExpiry: false, deliveryEnd: "" });
    const update = deliveryInput(
      warehouse,
      { ...f, description: "TEST" },
      true,
      r,
      now,
    );
    expect(update.starts_at).toBe(r.starts_at);
    expect(effectiveDeliveryTimes(update)).toEqual({
      expiry: r.expires_at,
      completion: r.delivery_deadline_at,
    });
  });
});
