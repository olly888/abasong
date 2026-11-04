// Only delete the temporary cache copy returned by the capture adapter.
export function isCachePhoto(uri: string, cache: string): boolean {
  try {
    const file = new URL(uri),
      root = new URL(cache);
    const path = decodeURIComponent(file.pathname),
      base = decodeURIComponent(root.pathname).replace(/\/$/, "") + "/";
    return (
      file.protocol === "file:" &&
      !file.host &&
      !file.search &&
      !file.hash &&
      root.protocol === "file:" &&
      path.startsWith(base) &&
      !path.split("/").some((p) => p === ".." || p === ".") &&
      path !== base
    );
  } catch {
    return false;
  }
}
export function canSearchPhotoDraft(
  query: string,
  reviewing: boolean,
  capturing: boolean,
) {
  return !reviewing && !capturing && query.trim().length >= 2;
}
