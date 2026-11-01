// One lookup in flight, only the newest queued observation survives. Disposal
// suppresses callbacks as well as queued work (transport is owned by the caller).
export function serialLatest<T, R>(
  run: (value: T) => Promise<R>,
  result: (value: T, response: R) => void,
  failed: (error: unknown) => void,
  equivalent: (a: T, b: T) => boolean = (a, b) => a === b,
  minimumInterval = 0,
) {
  let pending: { value: T } | undefined;
  let latest: { value: T } | undefined;
  let running = false,
    disposed = false;
  let epoch = 0,
    lastStarted = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function drain() {
    if (running || disposed || timer || !pending) return;
    const wait = minimumInterval - (Date.now() - lastStarted);
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = undefined;
        void drain();
      }, wait);
      return;
    }
    running = true;
    lastStarted = Date.now();
    const startedEpoch = epoch;
    const value = pending.value;
    pending = undefined;
    try {
      const response = await run(value);
      if (
        !disposed &&
        startedEpoch === epoch &&
        latest &&
        equivalent(value, latest.value)
      )
        result(value, response);
    } catch (error) {
      if (
        !disposed &&
        startedEpoch === epoch &&
        latest &&
        equivalent(value, latest.value)
      )
        failed(error);
    }
    running = false;
    void drain();
  }
  function invalidate() {
    epoch++;
    pending = undefined;
    latest = undefined;
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  return {
    offer(value: T) {
      if (!disposed) {
        latest = { value };
        pending = { value };
        void drain();
      }
    },
    invalidate,
    dispose() {
      disposed = true;
      invalidate();
    },
  };
}
