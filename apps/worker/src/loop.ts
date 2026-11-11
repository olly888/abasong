/** Serial polling: do not queue another database operation while one is active. */
export function startWorkerLoop(probe: () => Promise<void>, interval: number) {
  if (!Number.isFinite(interval) || interval < 1000 || interval > 60000)
    throw new Error("Invalid worker poll interval");
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void>;
  function run() {
    active = probe().finally(() => {
      if (!stopping) timer = setTimeout(run, interval);
    });
    // Probe handles its own failure and writes an unhealthy heartbeat. This
    // final catch also avoids an unhandled rejection during shutdown.
    void active.catch(() => undefined);
  }
  run();
  return async () => {
    stopping = true;
    clearTimeout(timer);
    await active.catch(() => undefined);
  };
}
