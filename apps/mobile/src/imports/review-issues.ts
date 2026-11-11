// Only conservative OCR hints cross this boundary; never confirmation/authority.
export type OcrReviewIssue =
  "ambiguous_pair" | "uncertain_address" | "uncertain_characters";
export function ocrReviewIssues(issues: readonly string[]): OcrReviewIssue[] {
  const mapped: Record<string, OcrReviewIssue> = {
    地址对应不明: "ambiguous_pair",
    地址与密码对应不明: "ambiguous_pair",
    请核对地址: "uncertain_address",
    请核对字符: "uncertain_characters",
    ambiguous_pair: "ambiguous_pair",
    uncertain_address: "uncertain_address",
    uncertain_characters: "uncertain_characters",
  };
  return [
    ...new Set(
      issues.flatMap((issue) =>
        Object.hasOwn(mapped, issue) ? [mapped[issue]!] : [],
      ),
    ),
  ];
}

export function needsScreenshotReview(row: {
  issues: readonly string[];
  revision: number;
  reviewedRevision?: number;
}) {
  return row.issues.length > 0 && row.reviewedRevision !== row.revision;
}
