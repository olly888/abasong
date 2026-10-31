import type { components } from "@abasong/contracts";
type S = components["schemas"];
export type ArrivalState = {
  id: string;
  since: number;
  lastObserved: number;
} | null;
// Dwell is client-side stability only. It cannot promote a candidate to a match:
// the authenticated server must first accept its versioned field-evidence gate.
export function assessArrival(
  previous: ArrivalState,
  result: S["ResolveResult"],
  observedAt: number,
  now: number,
  manualLocked: boolean,
): { state: ArrivalState; apartment: S["Apartment"] | null } {
  if (
    manualLocked ||
    !Number.isFinite(observedAt) ||
    now - observedAt > 20_000 ||
    observedAt > now + 1000 ||
    result.status !== "matched" ||
    !result.matched_id
  )
    return { state: null, apartment: null };
  const matches = result.candidates.filter(
    (p) => p.id === result.matched_id && p.confidence !== "unverified",
  );
  if (matches.length !== 1) return { state: null, apartment: null };
  const same =
    previous?.id === result.matched_id &&
    observedAt > previous.lastObserved &&
    observedAt - previous.lastObserved <= 20_000;
  const state = same
    ? { ...previous, lastObserved: observedAt }
    : { id: result.matched_id, since: observedAt, lastObserved: observedAt };
  return {
    state,
    apartment: same && observedAt - state.since >= 8000 ? matches[0] : null,
  };
}

export function startForegroundRefresh(
  refresh: () => Promise<void>,
  isActive: () => boolean,
  delayMs = 5000,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };
  const tick = async () => {
    if (stopped) return;
    try {
      if (isActive()) await refresh();
    } catch {
      // Acquisition adapters report their own error state; keep the foreground loop recoverable.
    } finally {
      if (!stopped) schedule();
    }
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
