// The picker cache copy must remain readable until the asynchronous copy completes.
export async function copyThenRelease(
  copy: () => Promise<void>,
  release: () => void,
) {
  await copy();
  try {
    release();
  } catch {
    /* Session cleanup may retry picker-cache deletion. */
  }
}
