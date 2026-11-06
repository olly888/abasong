import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
async function main() {
  const occupied = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ run_id: "occupied" }));
  });
  occupied.listen(3028, "127.0.0.1");
  await once(occupied, "listening");
  try {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/d1/run-native-exit.ts"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    child.stdout.on("data", (b) => (log += String(b)));
    child.stderr.on("data", (b) => (log += String(b)));
    const timer = setTimeout(() => child.kill("SIGTERM"), 30000);
    try {
      const [code] = await once(child, "exit");
      assert.equal(code, 1);
      assert(
        log.includes(
          "TEST loopback port already in use; existing listener untouched.",
        ),
      );
      assert(
        log.includes(
          "PASS: native-exit lifecycle restores disposable database and role counts.",
        ),
      );
    } finally {
      clearTimeout(timer);
    }
    console.log(
      "PASS: occupied TEST port is refused, existing listener untouched, owned disposable database/role counts restored.",
    );
  } finally {
    await new Promise<void>((r) => occupied.close(() => r()));
  }
}
void main().catch(() => {
  console.error("Native-exit collision check failed; private details omitted.");
  process.exitCode = 1;
});
