import { addressIdentity } from "@abasong/contracts";
import type { components } from "@abasong/contracts";
import type { Candidate } from "./types";
export function importAddressLabel(a: components["schemas"]["SearchAddress"]) {
  return `${a.address_line1}, ${a.city}, ${a.state}${a.postal_code ? " " + a.postal_code : ""}`;
}
export function canShareCandidate(r: Candidate) {
  const a = r.confirmedAddress;
  return (
    !!r.target ||
    (!!a &&
      !!addressIdentity(a) &&
      (!a.postal_code || /^\d{5}(?:-\d{4})?$/.test(a.postal_code)))
  );
}

export function groupImportCandidates(rows: Candidate[]) {
  const groups = new Map<string, { row: Candidate; index: number }[]>();
  rows.forEach((row, index) => {
    const key = row.target
      ? `apartment:${row.target.id}`
      : row.address
        ? `address:${row.address.trim()}`
        : `unresolved:${row.id}`;
    const group = groups.get(key) ?? [];
    group.push({ row, index });
    groups.set(key, group);
  });
  return [...groups];
}
export function canRepairImportResult(
  result: components["schemas"]["ImportCommitResult"] | undefined,
) {
  return (
    !!result &&
    result.private_status === "failed" &&
    !result.private_record_id &&
    result.share_status === "not_started"
  );
}
