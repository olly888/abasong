// Shared collapsed frame: normal/loading/empty/error cards do not change size.
export function compactCardHeight(fontScale: number) {
  return Math.round(192 + Math.max(0, fontScale - 1) * 144);
}
export const cardHandleHeight = 20;
