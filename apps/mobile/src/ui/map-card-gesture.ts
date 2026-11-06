// Native momentum events also follow programmatic scrollTo/remounts. Only an
// actual gesture can select a card. Release is not the final offset: Android
// can continue snapping after onScrollEndDrag, so idle always uses the latest
// scrolling offset, and each new scroll postpones the fallback.
export function createCarouselGesture(
  onSettled: (index: number) => void = () => {},
) {
  let active = false,
    released = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest = { offset: 0, step: 1, count: 0, fallback: 0 };
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  function finish(
    offset: number,
    step: number,
    count: number,
    fallback: number,
  ) {
    if (!active) return undefined;
    clear();
    active = false;
    if (count < 1) return undefined;
    const n =
      Number.isFinite(offset) && step > 0
        ? Math.round(offset / step)
        : fallback;
    const index = Math.max(0, Math.min(count - 1, n));
    onSettled(index);
    return index;
  }
  function schedule() {
    clear();
    timer = setTimeout(
      () => finish(latest.offset, latest.step, latest.count, latest.fallback),
      200,
    );
  }
  return {
    isActive: () => active,
    begin() {
      clear();
      active = true;
      released = false;
    },
    scroll(offset: number, step: number, count: number, fallback: number) {
      if (!active) return;
      latest = { offset, step, count, fallback };
      if (released) schedule();
    },
    release(offset: number, step: number, count: number, fallback: number) {
      if (!active) return;
      latest = { offset, step, count, fallback };
      released = true;
      schedule();
    },
    momentum() {
      clear();
    },
    finish,
    cancel() {
      clear();
      active = false;
      released = false;
    },
  };
}

// Wheel/keyboard scrolling may have no drag-begin event on Android. Ignore
// alignment scrolls until their target is observed, then recognize changes as
// user scrolling. Momentum-end alone never claims to be a user gesture.
export function createCarouselAlignment() {
  let offset = 0,
    target = 0,
    syncing = false;
  return {
    alignTo(x: number) {
      target = x;
      syncing = Math.abs(offset - target) > 1;
    },
    observe(x: number) {
      if (!Number.isFinite(x)) return false;
      offset = x;
      if (syncing) {
        if (Math.abs(x - target) <= 1) syncing = false;
        return false;
      }
      return Math.abs(x - target) > 2;
    },
  };
}
