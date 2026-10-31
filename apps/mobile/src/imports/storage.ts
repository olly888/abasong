import { Directory, File, Paths } from "expo-file-system";
import { copyThenRelease } from "./copy-selection";
const ttl = 24 * 60 * 60 * 1000; // local development cache limit; not the server draft policy
export function createImageCache(sessionId: string) {
  const root = new Directory(Paths.cache, "abasong-import");
  root.create({ idempotent: true, intermediates: true });
  for (const entry of root.list()) {
    const match = /^(\d{13})-[0-9a-f-]{36}$/.exec(entry.name);
    if (
      entry instanceof Directory &&
      match &&
      Date.now() - Number(match[1]) > ttl
    ) {
      try {
        entry.delete();
      } catch {
        /* Retry on the next import session. */
      }
    }
  }
  const dir = new Directory(root, `${Date.now()}-${sessionId}`);
  dir.create({ idempotent: true });
  return {
    async copy(uri: string, id: string) {
      const original = new File(uri);
      const extension =
        /\.(png|jpe?g|heic|heif)$/i.exec(uri)?.[1].toLowerCase() ?? "jpg";
      const file = new File(dir, `${id}.${extension}`);
      await copyThenRelease(
        () => original.copy(file),
        () => {
          if (uri.startsWith(Paths.cache.uri.replace(/\/$/, "") + "/"))
            original.delete();
        },
      );
      return file.uri;
    },
    dispose() {
      try {
        if (dir.exists) dir.delete();
      } catch {
        /* Expired cache removed next visit. */
      }
    },
  };
}
