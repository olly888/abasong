import { describe, expect, it } from "vitest";
import { extractCandidates, type OcrLine } from "./extract";
import { buildingAddress } from "./match";
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

describe("carrier screenshots with explicit door labels", () => {
  it("keeps equal values separate by label and preserves literal characters", () => {
    const result = extractCandidates([
      line("100 Example Ave Apt 19,", 0.1),
      line("Test City, CA 90001", 0.126),
      line("凹 社区门禁 #00a7* | 楼门门禁 #00a7*", 0.2),
    ]);
    expect(
      result.map(({ address, value, carrierDoorLabel }) => ({
        address: buildingAddress(address).address,
        value,
        carrierDoorLabel,
      })),
    ).toEqual([
      {
        address: "100 Example Ave, Test City, CA 90001",
        value: "#00a7*",
        carrierDoorLabel: "社区门禁",
      },
      {
        address: "100 Example Ave, Test City, CA 90001",
        value: "#00a7*",
        carrierDoorLabel: "楼门门禁",
      },
    ]);
  });

  it("flags a lost separator and an all-zero value without editing either", () => {
    const result = extractCandidates([
      line("100 Example Ave", 0.1),
      line("凹 社区门禁 #00371楼门门禁 0000*", 0.18),
    ]);
    expect(result.map(({ value, issues }) => ({ value, issues }))).toEqual([
      { value: "#00371", issues: ["请核对字符"] },
      { value: "0000*", issues: ["请核对字符"] },
    ]);
  });

  it("anchors separated detail cards to their heading, then respects a new address", () => {
    const result = extractCandidates([
      line("100 Example Ave 27 TEST CITY CA", 0.18),
      line("90001 US", 0.2),
      line("门禁信息 (2)", 0.34),
      line("社区门禁", 0.41),
      line("0007*", 0.47),
      line("创建：2026/01/01", 0.5),
      line("楼门门禁", 0.64),
      line("#0008", 0.7),
      line("102 Example Ave", 0.8),
      line("楼门门禁 A0009", 0.85),
    ]);
    expect(result.map(({ address, value }) => [address, value])).toEqual([
      ["100 Example Ave 27 TEST CITY CA 90001 US", "0007*"],
      ["100 Example Ave 27 TEST CITY CA 90001 US", "#0008"],
      ["102 Example Ave", "A0009"],
    ]);
  });

  it("joins a three-line duplicate locality while tolerating slight edge clipping", () => {
    const result = extractCandidates([
      line("100 Example Ave, Test City", 0.53),
      line("CA 90001 Apt 42 Test City CA", 0.55),
      line("90001 US", 0.58),
      { ...line("map text", 0.6), x: -0.008 },
      line("凹 社区门禁 A0032|楼门门禁 #0032", 0.68),
    ]);
    expect(
      result.map(({ address }) => buildingAddress(address).address),
    ).toEqual([
      "100 Example Ave, Test City, CA 90001",
      "100 Example Ave, Test City, CA 90001",
    ]);
  });

  it("rejects tracking text, notes and values from a different column", () => {
    expect(
      extractCandidates([
        line("100 Example Ave", 0.1),
        line("备注 楼门门禁 1234", 0.17),
        line("社区门禁", 0.24),
        line("9982", 0.27, 0.7),
        line("楼门门禁", 0.34),
        line("098765432100043", 0.39),
        line("楼门门禁 1234 请放前台", 0.47),
      ]),
    ).toEqual([]);
  });
});
