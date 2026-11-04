import { readFile, rename, writeFile } from "node:fs/promises";

export function heartbeatPath(env = process.env) {
  const configured = env.WORKER_HEARTBEAT_PATH;
  if (env.ABASONG_ENV === "pilot-dev") {
    if (configured && configured !== "/app-tmp/worker-health.json")
      throw new Error("Worker heartbeat configuration refused");
    return "/app-tmp/worker-health.json";
  }
  return configured;
}

export async function writeHeartbeat(
  path: string,
  healthy: boolean,
  now = Date.now(),
) {
  // Only status/time, never a database error or connection string. Rename keeps
  // the health process from reading a partially written record.
  const pending = `${path}.pending`;
  await writeFile(pending, JSON.stringify({ healthy, at: now }), {
    mode: 0o600,
  });
  await rename(pending, path);
}

export async function isHeartbeatHealthy(
  path: string,
  pollMs: number,
  now = Date.now(),
) {
  try {
    if (!Number.isFinite(pollMs) || pollMs < 1000 || pollMs > 60000)
      return false;
    const raw = await readFile(path, "utf8");
    if (raw.length > 256) return false;
    const record = JSON.parse(raw) as { healthy?: unknown; at?: unknown };
    return (
      record.healthy === true &&
      typeof record.at === "number" &&
      Number.isFinite(record.at) &&
      record.at <= now &&
      now - record.at <= pollMs * 2 + 10000
    );
  } catch {
    return false;
  }
}
