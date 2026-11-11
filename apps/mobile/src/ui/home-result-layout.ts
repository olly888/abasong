/** V3.5.1 content budget in native logical units. Safe areas are excluded by
 * the parent; never subtract a guessed iPhone inset a second time. */
export const homeResultLayout = {
  card: 156,
  title: 46,
  compactTitle: 32,
  core: 48,
  footer: 36,
  slotGap: 4,
  compactSlotGap: 6,
  inset: 12,
  blockInset: 8,
  compactBlockInset: 13,
  rowGap: 12,
  listTop: 4,
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
  const nextTitle =
    homeResultLayout.rowGap +
    homeResultLayout.compactBlockInset +
    homeResultLayout.compactTitle +
    1;
  const mapWithNextTitle = maxMap - nextTitle;
  const mapLimit = mapWithNextTitle >= 200 ? mapWithNextTitle : maxMap;
  return Math.min(mapLimit, Math.max(144, Math.round(h * 0.44)));
}
