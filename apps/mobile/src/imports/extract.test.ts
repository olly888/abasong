import { describe, expect, it } from "vitest";
import { extractCandidates, type OcrLine } from "./extract";
const line = (text: string, y: number, x = 0.1): OcrLine => ({
  text,
  y,
  x,
  width: 0.35,
  height: 0.02,
  confidence: 0.99,
});
describe("conservative on-device screenshot field association", () => {
  it("preserves zeros, case and symbols without numeric conversion", () => {
    expect(
      extractCandidates([
        line("100 Example Ave", 0.1),
        line("Gate Code: 00aB#*", 0.2),
      ])[0],
    ).toMatchObject({ address: "100 Example Ave", value: "00aB#*" });
  });
  it("does not extract phone, zip, stop, unit or wifi fields", () => {
    expect(
      extractCandidates(
        [
          "Phone: 6260000000",
          "ZIP: 90001",
          "Stop: 18",
          "Unit: 42",
          "WiFi password: 1234",
        ].map((s, i) => line(s, 0.1 + i * 0.03)),
      ),
    ).toEqual([]);
  });
  it("does not pair a code with a different screenshot column", () => {
    expect(
      extractCandidates([
        line("100 Example Ave", 0.1),
        line("Gate code: 0012", 0.2, 0.7),
      ])[0],
    ).toMatchObject({ address: "", issues: ["缺少地址"] });
  });
  it("leaves multiple preceding addresses unresolved", () => {
    expect(
      extractCandidates([
        line("100 Example Ave", 0.1),
        line("200 Example St", 0.15),
        line("Gate code: 0012", 0.2),
      ])[0].issues,
    ).toContain("地址对应不明");
  });
  it("does not invent an address or accept unlabelled numbers", () => {
    expect(extractCandidates([line("0042#", 0.1)])).toEqual([]);
    expect(extractCandidates([line("Gate Code: 0042#", 0.1)])[0].address).toBe(
      "",
    );
  });
  it("pairs independent rows and appends local city line", () => {
    const result = extractCandidates([
      line("100 Example Ave", 0.1),
      line("Test City, CA 90001", 0.13),
      line("Gate code: 01#", 0.18),
      line("200 Example St", 0.5),
      line("Access code: 02*", 0.6),
    ]);
    expect(result.map((r) => r.value)).toEqual(["01#", "02*"]);
    expect(result[0].address).toContain("CA 90001");
  });
});
