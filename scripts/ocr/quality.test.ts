import { expect, test } from "vitest";
import {
  measure,
  validateDataset,
  evaluateDataset,
  type Expected,
} from "./quality";
const expected: Expected & { value: string } = {
  address: "100 TEST Ave",
  value: "0017#",
  issues: [],
};
function sample() {
  return {
    version: 1,
    samples: [
      {
        id: "SYN-001",
        kind: "synthetic",
        carrier: "synthetic",
        image: "TEST.png",
        image_sha256: "a".repeat(64),
        authorized: true,
        redacted: true,
        truth_checked: true,
        expected: [{ ...expected, issues: [...expected.issues] }],
        observations: [
          {
            platform: "ios",
            runtime: "simulator",
            engine: "apple-vision",
            image_sha256: "a".repeat(64),
            milliseconds: 200,
            lines: [
              {
                text: "100 TEST Ave",
                x: 0.1,
                y: 0.1,
                width: 0.4,
                height: 0.02,
                confidence: 0.99,
              },
              {
                text: "Gate code: 0017#",
                x: 0.1,
                y: 0.2,
                width: 0.4,
                height: 0.02,
                confidence: 0.99,
              },
            ],
          },
        ],
      },
    ],
  };
}
test("full symbols/zeros/case and pair counts are measured exactly", () => {
  expect(measure([expected], [{ ...expected, value: "017#" }]).code_exact).toBe(
    false,
  );
  expect(
    measure([expected], [{ ...expected, value: "#0017" }]).code_exact,
  ).toBe(false);
  expect(
    measure([expected], [{ ...expected, address: "102 TEST Ave" }]),
  ).toMatchObject({
    code_exact: true,
    address_code_pairs_exact: false,
    pairing_and_review_exact: false,
  });
  expect(
    measure([expected], [expected, expected]).pairing_and_review_exact,
  ).toBe(false);
});
test("compares address/code pairs independently of review prompts and comma spacing", () => {
  const one = { ...expected, address: "100 TEST Ave, Example City, CA" };
  const two = {
    ...expected,
    address: "102 TEST Ave, Example City, CA",
    value: "*00283#",
  };
  expect(
    measure(
      [one],
      [
        {
          ...one,
          address: "100 TEST Ave, Example City,CA",
          issues: ["请核对地址"],
        },
      ],
    ),
  ).toMatchObject({
    address_code_pairs_exact: true,
    pairing_and_review_exact: false,
  });
  expect(
    measure(
      [one, two],
      [
        { ...one, value: two.value },
        { ...two, value: one.value },
      ],
    ),
  ).toMatchObject({ code_exact: true, address_code_pairs_exact: false });
});
test("unknown values are excluded from correct-password denominators and require a review hint", () => {
  const unknown = { ...expected, value: null, issues: ["请核对字符"] };
  expect(
    measure([unknown], [{ ...expected, issues: ["请核对字符"] }]),
  ).toMatchObject({ code_exact: null, pairing_and_review_exact: true });
  expect(measure([unknown], [expected]).pairing_and_review_exact).toBe(false);
  const data = sample();
  data.samples[0]!.expected = [
    { ...expected, value: null as unknown as string },
  ];
  expect(() => validateDataset(data)).toThrow();
});
test("negative extractions count as false positives rather than correct empty samples", () => {
  expect(measure([], [])).toMatchObject({
    code_exact: null,
    negative_false_positive: false,
    pairing_and_review_exact: true,
  });
  expect(measure([], [expected])).toMatchObject({
    negative_false_positive: true,
    negative_candidate_count: 1,
    pairing_and_review_exact: false,
  });
});
test("metadata cannot inflate samples by duplicate IDs/hashes or claim macOS as a phone run", () => {
  const duplicate = sample();
  duplicate.samples.push({ ...duplicate.samples[0]! });
  expect(() => validateDataset(duplicate)).toThrow();
  const bad = sample();
  bad.samples[0]!.observations[0]!.platform = "macos";
  expect(() => validateDataset(bad)).toThrow();
  const unapproved = sample();
  unapproved.samples[0]!.authorized = false;
  expect(() => validateDataset(unapproved)).toThrow();
  const stale = sample();
  stale.samples[0]!.observations[0]!.image_sha256 = "b".repeat(64);
  expect(() => validateDataset(stale)).toThrow();
  const nested = sample();
  nested.samples[0]!.observations[0]!.platform = ["ios"] as unknown as string;
  expect(() => validateDataset(nested)).toThrow();
  const nestedHint = sample();
  nestedHint.samples[0]!.expected[0]!.issues = [
    ["请核对字符"],
  ] as unknown as string[];
  expect(() => validateDataset(nestedHint)).toThrow();
});
test("report reuses the production parser and contains no truth or recognized text", () => {
  const report = evaluateDataset(validateDataset(sample())),
    json = JSON.stringify(report);
  expect(report.groups[0]).toMatchObject({
    known_code_samples: 1,
    code_exact_samples: 1,
    pairing_and_review_exact_samples: 1,
    p50_ms: 200,
    p95_ms: 200,
  });
  expect(json).not.toContain("0017#");
  expect(json).not.toContain("100 TEST Ave");
  expect(report.real_images).toBe(0);
});
