export type VerticalBox = { y: number; height: number };
export type ResultGeometry = { row?: VerticalBox; core?: VerticalBox };

/** Core coordinates come from native layout, never an assumed font/card size.
 * A title-only preview or a sliver cannot trigger a read or change selection.
 * Tall accessibility cards qualify once one useful line (24 units) is visible. */
export function coreVisibleKeys(
  keys: string[],
  geometry: ReadonlyMap<string, ResultGeometry>,
  offset: number,
  viewport: number,
): string[] {
  if (!Number.isFinite(offset) || !Number.isFinite(viewport) || viewport <= 0)
    return [];
  return keys.filter((key) => {
    const { row, core } = geometry.get(key) ?? {};
    if (!row || !core) return false;
    if (![row.y, row.height, core.y, core.height].every(Number.isFinite))
      return false;
    if (row.height <= 0 || core.height <= 0 || core.y < 0) return false;
    const top = row.y + core.y;
    const bottom = Math.min(row.y + row.height, top + core.height);
    const overlap = Math.min(offset + viewport, bottom) - Math.max(offset, top);
    return overlap >= Math.min(24, core.height);
  });
}
