import { describe, expect, it } from "vitest";
import {
  accessCodeDraft,
  editAccessCode,
} from "../apartments/access-code-edit";
import { extractCandidates, inspectScreenshot, type OcrLine } from "./extract";
import { buildingAddress } from "./match";

// Recreated layout patterns only. Every address, unit and credential below
// is synthetic. Photo numbers refer to the reviewed batch, not source files.
const a = "100 TEST Orchard St";
const b = "102 TEST Orchard St";
const c = "200 TEST Sample Ave";
const locality = "Example City, CA 90000";
const postalCode = "90000";
const starAndHash = "*00148#";
const hashAndStar = "#00259*";
const longCode = "0031648";
const line = (text: string, y: number, x = 0.08, width = 0.53): OcrLine => ({
  text,
  x,
  y,
  width,
  height: 0.021,
  confidence: 0.99,
});

describe("Glendale carrier screenshot regression (synthetic)", () => {
  it("01 binds an explicitly labelled value even when it equals the postal code", () => {
    const result = extractCandidates([
      line(`${a} Apt 901 ${locality}`, 0.56),
      line("派送引导", 0.62),
      line("社区门禁", 0.68, 0.14, 0.12),
      line(postalCode, 0.683, 0.29, 0.08),
      line("TEST parcel reference 90000", 0.78),
    ]);
    expect(result).toEqual([
      {
        address: `${a} Apt 901 ${locality}`,
        value: postalCode,
        issues: [],
        carrierDoorLabel: "社区门禁",
      },
    ]);
  });

  it("02 reads the label row, keeps the suffix, and ignores unrelated delivery notes", () => {
    const result = extractCandidates([
      line(`${b} Apt 902 Example City`, 0.53),
      line("CA 90000 US", 0.555),
      line(`楼门门禁 ${starAndHash}`, 0.66),
      line("TEST delivery note 12345", 0.72),
    ]);
    expect(result).toHaveLength(1);
    expect(buildingAddress(result[0]!.address).address).toBe(
      `${b}, ${locality}`,
    );
    expect(result[0]).toMatchObject({
      value: starAndHash,
      issues: [],
      carrierDoorLabel: "楼门门禁",
    });
  });

  it("03 preserves a longer value and ignores neighboring map numbers", () => {
    const result = extractCandidates([
      line("198", 0.36, 0.38, 0.05),
      line("202", 0.4, 0.38, 0.05),
      line(`${c} Unit 903, ${locality}`, 0.56),
      line(`楼门门禁 ${longCode}`, 0.66),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      address: `${c} Unit 903, ${locality}`,
      value: longCode,
    });
  });

  it.each([
    [
      "04 header address and two nearby rows",
      ["附近的 Code (30)", "只用于本次派送"],
    ],
    [
      "05 OCR joins the restriction with spaces",
      ["附近的 Co de", "只 用 于 本 次 派 送"],
    ],
    ["06 cropped above the restricted banner", ["附近的 Code (30)"]],
    ["07 cropped to rows and reporting control", ["上报新 Code", "这是对的"]],
    ["09 repeated units and locker row", ["附近 的", "Code (30)", "快递柜"]],
    ["10 only the purpose restriction remains", ["只用于本次派送。"]],
  ])("%s excludes the carrier's delivery-only list", (_name, markers) => {
    expect(
      extractCandidates([
        line(`${a} Apt 901 ${locality}`, 0.08),
        ...markers.map((marker, index) => line(marker, 0.13 + index * 0.04)),
        line(`${b} Apt 902`, 0.26),
        line(`社区门禁 ${starAndHash}`, 0.32),
        line(`${c} Apt 903`, 0.4),
        line(`楼门门禁 ${hashAndStar}`, 0.46),
      ]),
    ).toEqual([]);
  });

  it("08 keeps independent explicitly labelled address blocks separate in a multi-address image", () => {
    const result = extractCandidates([
      line(`${a} Apt 901 ${locality}`, 0.22),
      line(`社区门禁 ${starAndHash}`, 0.32),
      line(`${b} Apt 902 ${locality}`, 0.39),
      line(`楼门门禁 ${hashAndStar}`, 0.48),
    ]);
    expect(
      result.map(({ address, value, issues }) => [
        buildingAddress(address).address,
        value,
        issues,
      ]),
    ).toEqual([
      [`${a}, ${locality}`, starAndHash, []],
      [`${b}, ${locality}`, hashAndStar, []],
    ]);
    const draft = {
      ...accessCodeDraft(result[0]!.value),
      selection: { start: 3, end: 4 },
    };
    expect(editAccessCode(draft, { insert: "7" })?.value).toBe("*00748#");
  });

  it("keeps a cropped row's code out of a different address section when both addresses are plausible", () => {
    const result = extractCandidates([
      line(a, 0.22),
      line(b, 0.28),
      line(`楼门门禁 ${hashAndStar}`, 0.32),
    ]);
    expect(result).toEqual([
      {
        address: "",
        value: hashAndStar,
        issues: ["地址对应不明"],
        carrierDoorLabel: "楼门门禁",
      },
    ]);
  });

  it.each([
    ["门禁 Code", "附近旳", "Code (30)"],
    ["门禁Code", "这是对的", "上报鼾Code"],
  ])(
    "recognizes a delivery-only list when the native OCR misreads its markers",
    (...markers) => {
      expect(
        inspectScreenshot([
          ...markers.map((marker, index) => line(marker, 0.1 + index * 0.04)),
          line(b, 0.35),
          line(`楼门门禁 ${hashAndStar}`, 0.4),
        ]),
      ).toEqual({ deliveryOnly: true, candidates: [] });
    },
  );

  it("pairs native label lookalikes and typographic symbols while preserving review", () => {
    const result = extractCandidates([
      line(`${a} Apt 901 ${locality}`, 0.22),
      line(`杜区门禁${starAndHash.replace("*", "＊")}`, 0.32),
      line(`${b} Apt 902 ${locality}`, 0.39),
      { ...line("模门门禁 #e0259*", 0.48), confidence: 0.65 },
    ]);
    expect(
      result.map(({ address, value, issues, carrierDoorLabel }) => [
        buildingAddress(address).address,
        value,
        issues,
        carrierDoorLabel,
      ]),
    ).toEqual([
      [`${a}, ${locality}`, starAndHash, ["请核对字符"], "社区门禁"],
      [`${b}, ${locality}`, "#e0259*", ["请核对字符"], "楼门门禁"],
    ]);
  });
});
