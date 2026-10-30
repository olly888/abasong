import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createServer } from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { localTarget } from './database-target';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const config = parseEnv(readFileSync('.env', 'utf8'));
  localTarget(config.DATABASE_URL); localTarget(config.WORKER_DATABASE_URL);
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as { port: number }).port; server.close(); await once(server, 'close');
  const children: ChildProcess[] = [];
  function start(file: string, overrides = {}) {
    const child = spawn(process.execPath, [file], { env: { ...process.env, ...config, API_HOST: '127.0.0.1', API_PORT: String(port), ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); return child;
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    await Promise.race([exited, pause(5000).then(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); })]);
  }
  async function health(path: string) {
    for (let n = 0; n < 60; n++) {
      try { return await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(1000) }); } catch { await pause(100); }
    }
    throw new Error('Service did not start');
  }
  try {
    const api = start('apps/api/dist/main.js');
    assert.equal((await health('/health/live')).status, 200);
    assert.equal((await health('/health/ready')).status, 200);
    assert.equal((await health('/requests')).status, 404);
    await stop(api);
    const badDb = localTarget(config.DATABASE_URL); badDb.password = 'intentionally-invalid-d0-test';
    const unavailable = start('apps/api/dist/main.js', { DATABASE_URL: badDb.href });
    assert.equal((await health('/health/live')).status, 200);
    const response = await health('/health/ready'); assert.equal(response.status, 503);
    const body = await response.text(); assert(!body.includes('postgres')); assert(!body.includes('password'));
    await stop(unavailable);
    const worker = start('apps/worker/dist/main.js');
    let ready = false; worker.stdout?.on('data', (chunk: Buffer) => { if (chunk.toString().includes('Worker database ready')) ready = true; });
    for (let n = 0; n < 50 && !ready; n++) await pause(100);
    assert(ready); await stop(worker);
    console.log('PASS: API live/ready/404, database outage 503 without details, worker restricted DB connection, graceful shutdown');
  } finally { for (const child of children) await stop(child); }
}
main().catch(() => { console.error('Service smoke test failed'); process.exitCode = 1; });
