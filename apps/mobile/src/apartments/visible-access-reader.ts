import type { components } from "@abasong/contracts";
type S = components["schemas"];
export type AccessRowState = {
  status: "loading" | "ready" | "denied" | "error" | "paused";
  records: S["AccessRecord"][];
};
/** Session-scoped, memory-only, bounded reads. Offscreen bodies are discarded. */
export function createVisibleAccessReader(
  read: (id: string, signal: AbortSignal) => Promise<S["AccessList"]>,
  publish: (states: ReadonlyMap<string, AccessRowState>) => void,
) {
  const states = new Map<string, AccessRowState>();
  const running = new Map<string, AbortController>();
  let wanted = new Set<string>(),
    allowed = false,
    qualificationDenied = false,
    disposed = false;
  const emit = () => publish(new Map(states));
  function cancel(id: string) {
    running.get(id)?.abort();
    running.delete(id);
    states.delete(id);
  }
  function fail(id: string, error: unknown) {
    if (disposed || !wanted.has(id)) return;
    const { status, code } = (error ?? {}) as {
      status?: number;
      code?: string;
    };
    // These are account-wide denials from the shared-read/feedback API.
    // A stale /me response must not leave other visible codes on screen.
    if (
      status === 401 ||
      (status === 403 &&
        (code === "CAPABILITY_REQUIRED" || code === "ACCOUNT_UNAVAILABLE"))
    ) {
      qualificationDenied = true;
      for (const key of running.keys()) cancel(key);
      states.clear();
      for (const key of wanted)
        states.set(key, { status: "denied", records: [] });
    } else {
      cancel(id);
      states.set(id, {
        status:
          code === "APARTMENT_SHARING_PAUSED"
            ? "paused"
            : status === 403
              ? "denied"
              : "error",
        records: [],
      });
    }
    emit();
    pump();
  }
  function pump() {
    if (disposed || !allowed || qualificationDenied) return;
    for (const id of wanted) {
      if (running.size >= 2) break;
      if (states.has(id) || running.has(id)) continue;
      const c = new AbortController();
      running.set(id, c);
      states.set(id, { status: "loading", records: [] });
      emit();
      void read(id, c.signal)
        .then((result) => {
          if (
            disposed ||
            c.signal.aborted ||
            running.get(id) !== c ||
            !wanted.has(id)
          )
            return;
          if (result.items.some((r) => r.apartment_id !== id))
            throw new Error("address mismatch");
          states.set(id, {
            status: result.sharing_paused ? "paused" : "ready",
            records: result.sharing_paused ? [] : result.items,
          });
        })
        .catch((error: unknown) => {
          if (
            disposed ||
            c.signal.aborted ||
            running.get(id) !== c ||
            !wanted.has(id)
          )
            return;
          fail(id, error);
        })
        .finally(() => {
          if (running.get(id) === c) running.delete(id);
          if (!disposed && !c.signal.aborted) emit();
          pump();
        });
    }
  }
  return {
    update(ids: string[], canRead: boolean) {
      if (disposed) return;
      const renewed = !allowed && canRead;
      allowed = canRead;
      if (renewed) qualificationDenied = false;
      wanted = new Set(ids.slice(0, 6));
      for (const [id, c] of running)
        if (!allowed || !wanted.has(id)) {
          c.abort();
          running.delete(id);
        }
      for (const id of states.keys())
        if (!allowed || !wanted.has(id)) states.delete(id);
      if (!allowed || qualificationDenied)
        for (const id of wanted)
          states.set(id, { status: "denied", records: [] });
      // A renewed grant requires a fresh object-authorized request.
      if (renewed)
        for (const [id, s] of states)
          if (s.status === "denied") states.delete(id);
      emit();
      pump();
    },
    retry(id: string) {
      if (
        disposed ||
        !wanted.has(id) ||
        !allowed ||
        qualificationDenied ||
        running.has(id)
      )
        return;
      states.delete(id);
      emit();
      pump();
    },
    // A completed mutation invalidates even an in-flight pre-mutation read.
    // Neighbouring rows stay intact; a late response cannot restore old data.
    refresh(id: string) {
      if (disposed || !wanted.has(id) || !allowed || qualificationDenied)
        return;
      cancel(id);
      emit();
      pump();
    },
    fail,
    dispose() {
      disposed = true;
      for (const c of running.values()) c.abort();
      running.clear();
      states.clear();
      wanted.clear();
    },
  };
}
