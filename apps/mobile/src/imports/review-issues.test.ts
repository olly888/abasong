import { expect, test } from "vitest";
import { needsScreenshotReview, ocrReviewIssues } from "./review-issues";
test("preserves uncertainty in local and restored forms without accepting arbitrary metadata", () => {
  expect(
    ocrReviewIssues([
      "请核对地址",
      "uncertain_characters",
      "请核对字符",
      "地址对应不明",
      "ready",
      "access.read",
      "constructor",
      "__proto__",
    ]),
  ).toEqual(["uncertain_address", "uncertain_characters", "ambiguous_pair"]);
});

test("requires an explicit review again after editing a previously confirmed OCR row", () => {
  const row = { issues: ["请核对字符"], revision: 3 };
  expect(needsScreenshotReview(row)).toBe(true);
  expect(needsScreenshotReview({ ...row, reviewedRevision: 3 })).toBe(false);
  expect(
    needsScreenshotReview({ ...row, revision: 4, reviewedRevision: 3 }),
  ).toBe(true);
  expect(needsScreenshotReview({ ...row, issues: [] })).toBe(false);
});
