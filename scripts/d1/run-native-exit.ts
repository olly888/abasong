import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Client } from "pg";
import { localTarget } from "../d0/database-target";
import { childRunning } from "./native-exit-guard";
async function main() {
  const scenario = process.env.ABASONG_NATIVE_EXIT_SCENARIO ?? "delivery";
  assert(["delivery", "contribution"].includes(scenario));
  const verify = process.env.ABASONG_NATIVE_EXIT_VERIFY ?? "default";
  assert(["default", "collaboration"].includes(verify));
  assert(verify !== "collaboration" || scenario === "delivery");
  const env = parseEnv(readFileSync(".env", "utf8"));
  const admin = new Client({
    connectionString: localTarget(env.DATABASE_ADMIN_URL).href,
  });
  await admin.connect();
  const footprint = async () =>
    (
      await admin.query(
        "SELECT (SELECT count(*)::int FROM pg_database WHERE datname LIKE 'abasong_native_exit_test_%') dbs,(SELECT count(*)::int FROM pg_roles WHERE rolname LIKE 'abasong_native_exit_%') roles",
      )
    ).rows[0];
  const before = await footprint();
  const runId = randomUUID();
  const fixture = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/d1/native-exit-fixture.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, ABASONG_NATIVE_EXIT_RUN: runId },
    },
  );
  let verifier: ChildProcess | undefined;
  const cancel = () => {
    verifier?.kill("SIGTERM");
    fixture.kill("SIGTERM");
  };
  process.once("SIGTERM", cancel);
  process.once("SIGINT", cancel);
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (!childRunning(fixture)) throw new Error("fixture exited");
      try {
        const r = await fetch("http://127.0.0.1:3028/fixture", {
          signal: AbortSignal.timeout(300),
        });
        const v = await r.json();
        if (v.run_id === runId) {
          ready = true;
          break;
        }
      } catch {
        /* not ready */
      }
      await pause(100);
    }
    assert(ready, "isolated fixture not ready");
    verifier = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        scenario === "contribution"
          ? "scripts/d1/verify-native-contribution.ts"
          : verify === "collaboration"
            ? "scripts/d1/verify-native-collaboration.ts"
            : "scripts/d1/verify-native-exit.ts",
      ],
      { stdio: "inherit" },
    );
    const [code] = await once(verifier, "exit");
    assert.equal(code, 0);
  } finally {
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
    try {
      if (verifier && childRunning(verifier)) verifier.kill("SIGTERM");
      if (childRunning(fixture)) {
        fixture.kill("SIGTERM");
        const [code] = await once(fixture, "exit");
        assert.equal(code, 0);
      }
      assert.deepEqual(await footprint(), before);
      console.log(
        "PASS: native-exit lifecycle restores disposable database and role counts.",
      );
    } finally {
      await admin.end();
    }
  }
}
void main().catch((e: unknown) => {
  if (e instanceof Error)
    for (const frame of e.stack
      ?.split("\n")
      .filter(
        (x) =>
          x.trim().startsWith("at ") &&
          x.includes("/scripts/d1/run-native-exit.ts:"),
      ) ?? [])
      console.error(frame.trim());
  console.error("Isolated native-exit runner failed; private details omitted.");
  process.exitCode = 1;
});
