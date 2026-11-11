import type { components } from "@abasong/contracts";
type Summary = components["schemas"]["ContributionSummary"];
// Metadata is historical; a previously read value is not authority to keep
// displaying it after current qualification or source state has changed.
export function visibleContributionValue(
  source: Summary,
  canRead: boolean,
  value?: string | null,
) {
  return canRead &&
    !source.sharing_paused &&
    source.status === "active" &&
    source.record_status === "active"
    ? (value ?? null)
    : null;
}
