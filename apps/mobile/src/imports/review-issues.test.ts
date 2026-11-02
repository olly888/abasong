import { expect, test } from "vitest";
import { ocrReviewIssues } from "./review-issues";
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
