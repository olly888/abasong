import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const [apiImage, workerImage] = process.argv.slice(2);
assert(
  /^abasong-api:[a-z0-9-]+$/.test(apiImage ?? "") &&
    /^abasong-worker:[a-z0-9-]+$/.test(workerImage ?? ""),
);
const run = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  }).trim();
const folder = mkdtempSync(join(tmpdir(), "abasong-container-"));
const names = [];
try {
  for (const image of [apiImage, workerImage])
    for (const relabel of [false, true]) {
      let refused = false;
      try {
        run([
          "run",
          "--rm",
          "--platform",
          "linux/amd64",
          "--network",
          "none",
          "--read-only",
          "--tmpfs",
          "/tmp",
          ...(relabel
            ? ["-e", "NODE_ENV=development", "-e", "ABASONG_ENV=d0"]
            : []),
          image,
        ]);
      } catch (error) {
        refused =
          error.status === 1 &&
          /cloud configuration refused/.test(error.stderr ?? "");
      }
      assert(
        refused,
        "Production image must explicitly reject missing or relabeled configuration",
      );
    }
  const project = "mxlmemaunzoramgemiju",
    host = `db.${project}.supabase.co`,
    url = (login) =>
      `postgres://${login}:TEST@${host}/postgres?sslmode=verify-full`;
  const common = {
    ABASONG_ENV: "pilot-dev",
    NODE_ENV: "production",
    AWS_REGION: "us-west-1",
    PILOT_DATABASE_HOST: host,
  };
  const api = {
    ...common,
    DATABASE_URL: url("abasong_api_dev"),
    DATABASE_SENSITIVE_URL: url("abasong_sensitive_dev"),
    AUTH_ISSUER: `https://${project}.supabase.co/auth/v1`,
    AUTH_AUDIENCE: "authenticated",
    AUTH_JWT_ALGORITHM: "ES256",
    PUBLIC_API_ORIGIN: "https://api-dev.abasong.com",
    API_HOST: "0.0.0.0",
    API_PORT: "3001",
    DATA_ENCRYPTION_PROVIDER: "aws-kms",
    KMS_KEY_ARN:
      "arn:aws:kms:us-west-1:000000000000:key/11111111-1111-4111-8111-111111111111",
    DATA_HMAC_KEY: "a".repeat(64),
    DATA_HMAC_KEY_VERSION: "pilot-v1",
    IDEMPOTENCY_RETENTION_SECONDS: "86400",
  };
  const worker = {
    ...common,
    WORKER_DATABASE_URL: url("abasong_worker_dev"),
    WORKER_POLL_MS: "30000",
  };
  for (const [kind, image, env] of [
    ["api", apiImage, api],
    ["worker", workerImage, worker],
  ]) {
    const file = join(folder, `${kind}.env`),
      name = `abasong-container-${kind}-${process.pid}`;
    writeFileSync(
      file,
      Object.entries(env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
      { mode: 0o600 },
    );
    names.push(name);
    run([
      "run",
      "-d",
      "--name",
      name,
      "--platform",
      "linux/amd64",
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=16m",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--env-file",
      file,
      image,
    ]);
    assert.equal(run(["exec", name, "id", "-u"]), "1000");
    assert.equal(
      run([
        "exec",
        name,
        "find",
        "/usr",
        "-xdev",
        "-type",
        "f",
        "-perm",
        "/6000",
      ]),
      "",
    );
    assert.equal(
      run([
        "exec",
        name,
        "node",
        "-e",
        "if(process.env.LC_ALL!=='C.UTF-8'||process.env.LANG!=='C.UTF-8'||process.env.LANGUAGE!=='')process.exit(1);console.log('PASS')",
      ]),
      "PASS",
    );
    assert.equal(
      run(["inspect", "--format", "{{.HostConfig.ReadonlyRootfs}}", name]),
      "true",
    );
    assert.equal(
      run([
        "exec",
        name,
        "node",
        "-e",
        "require('node:fs').writeFileSync('/app-tmp/volume-check','TEST');console.log('PASS')",
      ]),
      "PASS",
    );
    if (kind === "api") {
      const probe = `(async()=>{let ok=false;for(let i=0;i<25;i++){try{const r=await fetch('http://127.0.0.1:3001/health/live');if(r.status===200){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ok)process.exit(1);for(const [path,status]of [['/health/ready',503],['/v1/me',401]]){const r=await fetch('http://127.0.0.1:3001'+path);if(r.status!==status)process.exit(1);const b=await r.text();if(/TEST|postgres:|stack|SELECT/.test(b))process.exit(1);}console.log('PASS');})().catch(()=>process.exit(1));`;
      assert.equal(run(["exec", name, "node", "-e", probe]), "PASS");
    } else {
      assert.equal(
        run(["inspect", "--format", "{{.State.Running}}", name]),
        "true",
      );
      // Actual worker writes a failed heartbeat with a disconnected database.
      const heartbeat =
        "(async()=>{for(let i=0;i<50;i++){try{const r=JSON.parse(require('node:fs').readFileSync('/app-tmp/worker-health.json','utf8'));if(r.healthy!==false)process.exit(1);console.log('PASS');return;}catch{}await new Promise(r=>setTimeout(r,200));}process.exit(1);})()";
      assert.equal(run(["exec", name, "node", "-e", heartbeat]), "PASS");
      const checkHealth = (expected) => {
        try {
          run(["exec", name, "node", "dist/health.js"]);
          assert.equal(expected, 0);
        } catch (error) {
          assert.equal(expected, 1);
          assert.equal(error.status, 1);
        }
      };
      checkHealth(1);
      run([
        "exec",
        name,
        "node",
        "-e",
        "require('node:fs').writeFileSync('/app-tmp/worker-health.json',JSON.stringify({healthy:true,at:Date.now()}))",
      ]);
      checkHealth(0);
      run([
        "exec",
        name,
        "node",
        "-e",
        "require('node:fs').writeFileSync('/app-tmp/worker-health.json',JSON.stringify({healthy:true,at:Date.now()-1000000}))",
      ]);
      checkHealth(1);
    }
    run(["stop", "--time", "5", name]);
    const logs = run(["logs", name]);
    assert(
      !/MODULE_NOT_FOUND|Cannot find module|postgres:\/\/|DATA_HMAC_KEY|TEST@/.test(
        logs,
      ),
    );
  }
  console.log(
    "PASS: API/worker non-root production images; missing/relabel refused; network-isolated live200/ready503/auth401; no host ports, AWS calls or real credentials",
  );
} finally {
  for (const name of names) {
    try {
      run(["rm", "-fv", name]);
    } catch {
      /* Only test-owned disposable containers. */
    }
  }
  rmSync(folder, { recursive: true, force: true });
}
