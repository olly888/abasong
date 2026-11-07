import { expect, it } from "vitest";
import type { components } from "@abasong/contracts";
import { visibleContributionValue } from "./contribution-visibility";
type S = components["schemas"];
const source = {
  status: "active",
  record_status: "active",
} as S["ContributionSummary"];
it("preserves the literal value only while current qualification and both states permit it", () => {
  expect(visibleContributionValue(source, true, "*0012#")).toBe("*0012#");
  expect(visibleContributionValue(source, false, "*0012#")).toBeNull();
  for (const status of ["corrected", "withdrawn"] as const)
    expect(
      visibleContributionValue({ ...source, status }, true, "*0012#"),
    ).toBeNull();
  expect(
    visibleContributionValue(
      { ...source, record_status: "invalid" },
      true,
      "*0012#",
    ),
  ).toBeNull();
});
