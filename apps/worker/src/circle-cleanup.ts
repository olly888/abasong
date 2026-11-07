import type { CircleStorage } from "@abasong/runtime";
import type { Pool } from "pg";

export async function purgeCircleMedia(
  pool: Pool,
  storage: CircleStorage,
  limit = 3,
) {
  for (let i = 0; i < limit; i++) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      // The worker RLS policy exposes only abandoned uploads and removed posts.
      // Hold the same lock as attach/upload until both private objects are gone.
      const { rows } = await c.query<{ id: string }>(
        "SELECT id FROM abasong.circle_media ORDER BY expires_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      const id = rows[0]?.id;
      if (id) {
        await storage.remove(id);
        await c.query("DELETE FROM abasong.circle_media WHERE id=$1", [id]);
      }
      await c.query("COMMIT");
      if (!id) break;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
}
