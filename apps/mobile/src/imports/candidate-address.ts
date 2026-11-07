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
