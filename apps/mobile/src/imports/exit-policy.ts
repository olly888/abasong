import type { Source } from "./types";

type ImportRow = {
  privateId?: string;
  privateEntryId?: string;
  shared?: boolean;
};
type ImportSource = Pick<Source, "state">;

// Selection is not completion: unselected rows and failed pictures would also
// be lost on leaving. Successful shared/private records are already durable.
export function hasUnsubmittedImportWork(
  rows: readonly ImportRow[],
  sources: readonly ImportSource[],
  mode: "private_only" | "private_and_share",
) {
  return (
    rows.some(
      (r) => !r.privateId || (mode === "private_and_share" && !r.shared),
    ) ||
    sources.some((s) => s.state !== "recognized" && s.state !== "restricted")
  );
}

export function savedImportDestination(
  rows: readonly ImportRow[],
  revision: string,
) {
  const saved = rows.filter((row) => row.privateId);
  if (!saved.length) return null;
  const entries = new Set(saved.map((row) => row.privateEntryId));
  return {
    tab: "saved" as const,
    revision,
    // Clear any previous detail parameter when this batch opens the list.
    entry_id: entries.size === 1 ? (saved[0]?.privateEntryId ?? "") : "",
  };
}
