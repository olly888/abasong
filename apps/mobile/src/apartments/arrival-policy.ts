import type { ForegroundFix } from "./foreground-location";
import type { components } from "@abasong/contracts";
type S = components["schemas"];
export type ArrivalState = {
  id: string;
  since: number;
  lastObserved: number;
  configVersion?: number;
  anchor: S["Point"];
  matchBasis: "boundary" | "entrance";
} | null;
// Pilot stability window, not an entrance polygon or a speed classifier.
// Anchoring prevents small successive moves from accumulating into a false stay.
const maxDwellMovementM = 15;
const validPoint = (point: S["Point"]) =>
  point &&
  Number.isFinite(point.lng) &&
  Number.isFinite(point.lat) &&
  Math.abs(point.lng) <= 180 &&
  Math.abs(point.lat) <= 90;
function distanceM(a: S["Point"], b: S["Point"]) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(Math.min(1, h)));
}
// A fresh GPS stream is not evidence that the last server match is still fresh.
// Invalidate before awaiting the next lookup; this can only remove a match,
// never infer membership or grant a password-reading capability.
export function arrivalNeedsReset(
  state: ArrivalState,
  now: number,
  manualLocked: boolean,
  observation?: { fix: ForegroundFix; approximate: boolean },
) {
  if (!state || manualLocked) return false;
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(state.lastObserved) ||
    now - state.lastObserved > 20_000 ||
    state.lastObserved > now + 1000
  )
    return true;
  if (!observation) return false;
  const { fix, approximate } = observation;
  const point = { lng: fix.coords.longitude, lat: fix.coords.latitude };
  return (
    approximate ||
    !validPoint(point) ||
    !validPoint(state.anchor) ||
    !Number.isFinite(fix.timestamp) ||
    now - fix.timestamp > 20_000 ||
    fix.timestamp > now + 1000 ||
    fix.coords.accuracy === null ||
    !Number.isFinite(fix.coords.accuracy) ||
    fix.coords.accuracy < 0 ||
    distanceM(state.anchor, point) > maxDwellMovementM
  );
}
// Dwell is client-side stability only. It cannot promote a candidate to a match:
// the authenticated server must first accept its versioned field-evidence gate.
export function assessArrival(
  previous: ArrivalState,
  result: S["ResolveResult"],
  observedAt: number,
  now: number,
  manualLocked: boolean,
  point: S["Point"],
): { state: ArrivalState; apartment: S["Apartment"] | null } {
  if (
    manualLocked ||
    !validPoint(point) ||
    !["boundary", "entrance"].includes(result.match_basis ?? "") ||
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
  if (previous && observedAt <= previous.lastObserved)
    return { state: null, apartment: null };
  const same =
    previous?.id === result.matched_id &&
    validPoint(previous.anchor) &&
    previous.matchBasis === result.match_basis &&
    distanceM(previous.anchor, point) <= maxDwellMovementM &&
    previous.configVersion === result.config_version &&
    observedAt > previous.lastObserved &&
    observedAt - previous.lastObserved <= 20_000;
  const state = same
    ? { ...previous, lastObserved: observedAt }
    : {
        id: result.matched_id,
        since: observedAt,
        lastObserved: observedAt,
        configVersion: result.config_version,
        anchor: { ...point },
        matchBasis: result.match_basis!,
      };
  return {
    state,
    apartment: same && observedAt - state.since >= 8000 ? matches[0]! : null,
  };
}

// An existing automatic card is valid only while the current observation still
// supports that apartment under the same policy. A new candidate keeps its own
// dwell timer when the previous card is cleared.
export function assessHomeArrival(
  previous: ArrivalState,
  selectedId: string | undefined,
  result: S["ResolveResult"],
  observedAt: number,
  now: number,
  manualLocked: boolean,
  point: S["Point"],
) {
  const decision = assessArrival(
    previous,
    result,
    observedAt,
    now,
    manualLocked,
    point,
  );
  return {
    ...decision,
    clearAutomaticCard:
      !manualLocked &&
      !!selectedId &&
      (!decision.state ||
        decision.state.id !== selectedId ||
        previous?.configVersion !== decision.state.configVersion),
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
