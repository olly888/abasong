// A dependency outage must hide the import without destroying its in-memory
// work. A confirmed identity/access failure must still dispose that work.
export function keepImportSession(auth: {
  session: unknown;
  phase: string;
  accountErrorStatus?: number;
}) {
  if (!auth.session) return false;
  if (auth.phase === "ready" || auth.phase === "loading-account") return true;
  const status = auth.accountErrorStatus;
  return (
    auth.phase === "error" &&
    status !== undefined &&
    (status === 408 || status === 429 || (status >= 500 && status < 600))
  );
}
