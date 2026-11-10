/** V3.5.1 content budget in native logical units. Safe areas are excluded by
 * the parent; never subtract a guessed iPhone inset a second time. */
export const homeResultLayout = {
  card: 180,
  title: 46,
  core: 48,
  footer: 36,
  slotGap: 10,
  inset: 14,
  rowGap: 12,
  listTop: 4,
  preview: 44,
  chrome: 116,
} as const;

export function homeMapHeight(
  height: number,
  chrome: number,
  fontScale: number,
) {
  const h = Math.max(0, height);
  const list = homeResultLayout.listTop + homeResultLayout.card;
  const maxMap = Math.max(0, h - chrome - list);
  if (fontScale > 1.1)
    return Math.min(maxMap, Math.max(144, Math.min(260, h * 0.4)));
  const preview =
    h >= 596 ? homeResultLayout.rowGap + homeResultLayout.preview : 0;
  return Math.min(maxMap, Math.max(144, h - chrome - list - preview));
}
