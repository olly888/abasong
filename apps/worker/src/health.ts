import { heartbeatPath, isHeartbeatHealthy } from "./heartbeat.js";

async function main() {
  const path = heartbeatPath();
  process.exitCode =
    path &&
    (await isHeartbeatHealthy(path, Number(process.env.WORKER_POLL_MS ?? 5000)))
      ? 0
      : 1;
}
void main().catch(() => {
  process.exitCode = 1;
});
