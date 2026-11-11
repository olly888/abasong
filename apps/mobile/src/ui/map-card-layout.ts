// Shared collapsed frame: normal/loading/empty/error cards do not change size.
export function compactCardHeight(fontScale: number) {
  return Math.round(192 + Math.max(0, fontScale - 1) * 144);
}
export const cardHandleHeight = 20;
export function measuredCardHeight(
  width: number,
  contentHeight: number,
  base: number,
) {
  if (
    !Number.isFinite(width) ||
    width < 128 ||
    !Number.isFinite(contentHeight) ||
    contentHeight < 0
  )
    return null;
  return Math.max(base, Math.ceil(contentHeight) + cardHandleHeight + 8);
}
