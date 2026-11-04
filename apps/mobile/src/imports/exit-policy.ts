type ImportRow = { privateId?: string; shared?: boolean };
type ImportSource = {
  state: "selected" | "processing" | "recognized" | "failed";
};

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
    ) || sources.some((s) => s.state !== "recognized")
  );
}
