import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { OcrLine } from "../../apps/mobile/src/imports/extract";
import { extractLabelAddresses } from "../../apps/mobile/src/address-photo/extract";
const fixture = JSON.parse(
  readFileSync("scripts/ocr/fixtures/label-address-synthetic.json", "utf8"),
) as {
  synthetic_only: boolean;
  samples: { id: string; expected: string[] }[];
};
assert.equal(fixture.synthetic_only, true);
const rows = JSON.parse(
  readFileSync(".tooling/label-address-lab/ocr.json", "utf8"),
) as {
  id: string;
  milliseconds: number;
  lines: OcrLine[];
}[];
assert.equal(rows.length, fixture.samples.length);
assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
const results = rows.map((row) => {
  const truth = fixture.samples.find((s) => s.id === row.id);
  assert(truth);
  const extracted = extractLabelAddresses(row.lines);
  const actual = extracted.map((s) => s.searchText).sort();
  return {
    id: row.id,
    exact:
      JSON.stringify(actual) === JSON.stringify([...truth.expected].sort()),
    negative: truth.expected.length === 0,
    actual_count: actual.length,
    incomplete_or_uncertain: extracted.filter((s) => s.issues.length > 0)
      .length,
    milliseconds: row.milliseconds,
  };
});
const report = {
  scope:
    "12 generated TEST labels, macOS Apple Vision + production-candidate parser; not iOS/Android camera or carrier accuracy",
  samples: results.length,
  exact: results.filter((r) => r.exact).length,
  false_positive_on_negative: results
    .filter((r) => r.negative)
    .reduce((n, r) => n + r.actual_count, 0),
  details: results,
};
writeFileSync(
  ".tooling/label-address-lab/summary.json",
  JSON.stringify(report, null, 2) + "\n",
);
// No recognized text, address, recipient or tracking information in the report.
console.log(JSON.stringify(report, null, 2));
