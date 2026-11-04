import { describe, it, expect } from "vitest";
import { changeSupportField, defaultSupportFields } from "./support-fields";
describe("support form selection state", () => {
  it("moves a same-day deadline with a changed delivery date", () => {
    const f = {
      ...defaultSupportFields(),
      date: "2026-11-04",
      endDate: "2026-11-04",
    };
    expect(changeSupportField(f, "date", "2026-11-05").endDate).toBe(
      "2026-11-05",
    );
  });
  it("preserves an explicit cross-day deadline", () => {
    const f = {
      ...defaultSupportFields(),
      date: "2026-11-04",
      endDate: "2026-11-06",
    };
    expect(changeSupportField(f, "date", "2026-11-05").endDate).toBe(
      "2026-11-06",
    );
  });
  it("does not submit a hidden partial-capacity minimum", () => {
    const f = { ...defaultSupportFields(), minimum: "50" };
    expect(changeSupportField(f, "partial", "no").minimum).toBe("");
  });
  it("keeps the correct LA date when defaults span local midnight", () => {
    const f = defaultSupportFields(Date.parse("2026-11-05T07:30:00Z"));
    expect(f.date).toBe("2026-11-04");
    expect(f.endDate).toBe("2026-11-05");
  });
});
