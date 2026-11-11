import { expect, it, vi } from "vitest";
import {
  createCarouselGesture,
  createCarouselAlignment,
} from "./carousel-gesture";
it("does not reselect a card when collapse remounts at a nonzero programmatic offset", () => {
  const pager = createCarouselGesture();
  expect(pager.finish(0, 350, 3, 1)).toBeUndefined();
  expect(pager.finish(350, 350, 3, 1)).toBeUndefined();
});
it("restores the same card after a cancelled short drag, only once", () => {
  const pager = createCarouselGesture();
  pager.begin();
  expect(pager.finish(351, 350, 3, 1)).toBe(1);
  expect(pager.finish(350, 350, 3, 1)).toBeUndefined();
});
it("selects another card after a real drag and clamps overscroll", () => {
  const pager = createCarouselGesture();
  pager.begin();
  expect(pager.finish(700, 350, 3, 0)).toBe(2);
  pager.begin();
  expect(pager.finish(-1000, 350, 3, 2)).toBe(0);
  pager.begin();
  expect(pager.finish(3000, 350, 3, 0)).toBe(2);
});

it("waits for Android snapping instead of selecting the release-offset card", async () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const pager = createCarouselGesture(select);
  try {
    pager.begin();
    pager.momentum();
    pager.release(70, 350, 3, 0);
    await vi.advanceTimersByTimeAsync(100);
    pager.scroll(130, 350, 3, 0);
    await vi.advanceTimersByTimeAsync(100);
    pager.scroll(250, 350, 3, 0);
    await vi.advanceTimersByTimeAsync(100);
    pager.scroll(350, 350, 3, 0);
    expect(select).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(199);
    expect(select).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(select).toHaveBeenCalledExactlyOnceWith(1);
    pager.finish(350, 350, 3, 0);
    expect(select).toHaveBeenCalledTimes(1);
  } finally {
    pager.cancel();
    vi.useRealTimers();
  }
});
it("does not settle while a finger pauses mid-drag or after unmount", async () => {
  vi.useFakeTimers();
  const select = vi.fn();
  const pager = createCarouselGesture(select);
  try {
    pager.begin();
    pager.scroll(180, 350, 3, 0);
    await vi.advanceTimersByTimeAsync(500);
    expect(select).not.toHaveBeenCalled();
    pager.release(350, 350, 3, 0);
    pager.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(select).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("recognizes desktop wheel scrolling without treating initial alignment as a gesture", () => {
  const alignment = createCarouselAlignment();
  alignment.alignTo(350);
  expect(alignment.observe(0)).toBe(false);
  expect(alignment.observe(350)).toBe(false);
  expect(alignment.observe(500)).toBe(true);
  alignment.alignTo(700);
  expect(alignment.observe(600)).toBe(false);
  expect(alignment.observe(700)).toBe(false);
});
it("settles wheel scrolling from the first card and does not fire again on programmatic snap", async () => {
  vi.useFakeTimers();
  const alignment = createCarouselAlignment();
  const select = vi.fn();
  const pager = createCarouselGesture(select);
  try {
    alignment.alignTo(0);
    for (const x of [50, 150, 300, 350]) {
      if (alignment.observe(x) && !pager.isActive()) {
        pager.begin();
        pager.release(x, 350, 3, 0);
      }
      pager.scroll(x, 350, 3, 0);
      await vi.advanceTimersByTimeAsync(50);
    }
    await vi.advanceTimersByTimeAsync(200);
    expect(select).toHaveBeenCalledExactlyOnceWith(1);
    alignment.alignTo(350);
    expect(alignment.observe(350)).toBe(false);
    pager.finish(350, 350, 3, 0);
    expect(select).toHaveBeenCalledTimes(1);
  } finally {
    pager.cancel();
    vi.useRealTimers();
  }
});
