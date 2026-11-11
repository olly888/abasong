// Programmatic restoration must not move the map; wheel/momentum scrolls can
// change the reading row even when native drag-begin is missing or already ended.
export function createHomeScrollIntent(initial = 0) {
  let last = initial;
  let target: number | undefined;
  return {
    align(offset: number) {
      target = Math.abs(offset - last) > 1 ? offset : undefined;
    },
    begin() {
      target = undefined;
    },
    observe(offset: number) {
      if (!Number.isFinite(offset)) return false;
      const changed = Math.abs(offset - last) > 0.5;
      last = offset;
      if (target !== undefined) {
        if (Math.abs(offset - target) <= 1) target = undefined;
        return false;
      }
      return changed;
    },
  };
}
