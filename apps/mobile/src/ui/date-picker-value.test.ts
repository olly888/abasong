import { describe, it, expect } from "vitest";
import { pickerDate, pickedValue, pickerLabel } from "./date-picker-value";
describe("Los Angeles native picker values", () => {
  it("keeps compact visible dates within paired fields while retaining the long accessible label", () => {
    expect(pickerLabel("date", "2026-11-07", "", true)).toBe("11/07/2026");
    expect(pickerLabel("date", "2026-11-07", "")).toContain("2026");
    expect(pickerLabel("date", "", "", true)).toBe("请选择");
  });
  it("preserves selected local date across UTC days", () => {
    expect(pickedValue("date", pickerDate("date", "2026-11-04", ""))).toBe(
      "2026-11-04",
    );
  });
  it("handles local midnight and daylight-saving offsets", () => {
    expect(pickerDate("time", "00:15", "2026-07-04").toISOString()).toBe(
      "2026-07-04T07:15:00.000Z",
    );
    expect(pickerDate("time", "00:15", "2026-11-04").toISOString()).toBe(
      "2026-11-04T08:15:00.000Z",
    );
  });
  it("round-trips a selected time without using the computer time zone", () => {
    expect(pickedValue("time", new Date("2026-11-05T07:30:00Z"))).toBe("23:30");
    expect(pickerLabel("time", "23:30", "2026-11-04")).toContain("PM");
  });
  it("opens an empty optional field without contributing a value", () => {
    expect(
      pickerDate(
        "date",
        "",
        "",
        Date.parse("2026-11-04T23:00:00Z"),
      ).toISOString(),
    ).toBe("2026-11-04T20:00:00.000Z");
  });
});
