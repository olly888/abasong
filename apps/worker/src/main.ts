import { Pool } from "pg";
import { assertRuntimeEnvironment } from "@abasong/runtime";
import { heartbeatPath, writeHeartbeat } from "./heartbeat.js";
import { startWorkerLoop } from "./loop.js";
async function main() {
  assertRuntimeEnvironment("worker");
  const connectionString = process.env.WORKER_DATABASE_URL;
  if (!connectionString) throw new Error("WORKER_DATABASE_URL required");
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
  });
  pool.on("error", () => console.error("Worker database connection unavailable"));
  const interval = Number(process.env.WORKER_POLL_MS ?? 5000);
  if (!Number.isFinite(interval) || interval < 1000 || interval > 60000)
    throw new Error("Invalid worker poll interval");
  const path = heartbeatPath();
  let lastHealthy: boolean | undefined;
  // D0 connectivity + bounded import-draft expiry only. No recognition job/outbox acknowledgment.
  async function probe() {
    let healthy = false;
    try {
      await pool.query("SELECT id FROM abasong.outbox WHERE false");
      const installed = await pool.query(
        "SELECT to_regprocedure('abasong.purge_expired_import_drafts(integer)') IS NOT NULL AS installed",
      );
      if (installed.rows[0]?.installed)
        await pool.query("SELECT abasong.purge_expired_import_drafts(100)");
      healthy = true;
    } catch {
      // Do not emit raw database errors.
    }
    if (path) {
      try {
        await writeHeartbeat(path, healthy);
      } catch {
        healthy = false;
      }
    }
    if (lastHealthy !== healthy) {
      if (healthy) console.log("Worker database ready");
      else console.error("Worker database unavailable");
      lastHealthy = healthy;
    }
  }
  const stopLoop = startWorkerLoop(probe, interval);
  let stopPromise: Promise<void> | undefined;
  async function stop() {
    stopPromise ??= (async () => {
      await stopLoop();
      if (path) await writeHeartbeat(path, false).catch(() => undefined);
      await pool.end();
    })();
    await stopPromise;
  }
  process.once("SIGTERM", () => {
    void stop();
  });
  process.once("SIGINT", () => {
    void stop();
  });
}
main().catch(() => {
  console.error("Worker startup failed");
  process.exitCode = 1;
});
