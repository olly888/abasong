import { describe, expect, it } from "vitest";
import { extractCandidates, type OcrLine } from "./extract";
const line = (text: string, y: number, x = 0.1): OcrLine => ({
  text,
  y,
  x,
  width: Math.min(0.35, 1 - x),
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
  it("keeps dense sections separate while preserving multiple codes for the second address", () => {
    const result = extractCandidates([
      line("100 Example Ave", 0.1),
      line("Gate code: 0017#", 0.15),
      line("102 Example Ave", 0.2),
      line("Gate code: *0018", 0.25),
      line("Entry code: 0019#", 0.28),
    ]);
    expect(result.map((r) => r.address)).toEqual([
      "100 Example Ave",
      "102 Example Ave",
      "102 Example Ave",
    ]);
    expect(result.map((r) => r.value)).toEqual(["0017#", "*0018", "0019#"]);
    expect(result.every((r) => r.issues.length === 0)).toBe(true);
  });
  it("does not resolve two addresses in the same new section by proximity alone", () => {
    const result = extractCandidates([
      line("100 Example Ave", 0.05),
      line("Gate code: 0017#", 0.1),
      line("102 Example Ave", 0.13),
      line("104 Example Ave", 0.16),
      line("Gate code: *0018", 0.2),
    ]);
    expect(result[1]).toMatchObject({ address: "", issues: ["地址对应不明"] });
  });
  it("does not use another column's code as a section boundary", () => {
    const result = extractCandidates([
      line("100 Example Ave", 0.1),
      line("102 Example Ave", 0.12),
      line("Gate code: 0017#", 0.14, 0.7),
      line("Gate code: *0018", 0.2),
    ]);
    expect(result[1]?.issues).toContain("地址对应不明");
  });
  it("requires review for low-confidence street and city recognition", () => {
    const street = { ...line("100 Example Ave", 0.1), confidence: 0.4 };
    expect(
      extractCandidates([street, line("Gate code: 0017#", 0.18)])[0]?.issues,
    ).toContain("请核对地址");
    expect(
      extractCandidates([
        line("100 Example Ave", 0.1),
        { ...line("Test City, CA 90001", 0.13), confidence: 0.4 },
        line("Gate code: 0017#", 0.18),
      ])[0]?.issues,
    ).toContain("请核对地址");
  });
  it("keeps unusual and truncated symbols verbatim and asks for review", () => {
    for (const value of ["0017?", "# 0017", "0017/0018", "0017…"]) {
      const result = extractCandidates([
        line("100 Example Ave", 0.1),
        line("Gate code: " + value, 0.2),
      ])[0];
      expect(result?.value).toBe(value);
      expect(result?.issues).toContain("请核对字符");
    }
  });
  it("does not silently bind codes when OCR geometry is malformed", () => {
    for (const patch of [
      { width: NaN },
      { width: Infinity },
      { width: 0 },
      { height: -1 },
      { x: -0.2 },
      { y: 2 },
    ]) {
      const result = extractCandidates([
        line("100 Example Ave", 0.1),
        { ...line("102 Example Ave", 0.15), ...patch },
        line("Gate code: 0017#", 0.2),
      ]);
      expect(result[0]?.address).toBe("");
      expect(result[0]?.issues.length).toBeGreaterThan(0);
    }
  });
});

it("keeps conflicting city lines unresolved rather than attaching the first city", () => {
  const result = extractCandidates([
    line("100 Example Ave", 0.1),
    line("Test City, CA 90001", 0.12),
    line("Other City, CA 90002", 0.14),
    line("Gate code: *0012#", 0.18),
  ])[0];
  expect(result.value).toBe("*0012#");
  expect(result.address).toBe("100 Example Ave");
  expect(result.issues).toContain("地址对应不明");
});
