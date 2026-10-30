import { Pool } from 'pg';
const connectionString = process.env.WORKER_DATABASE_URL;
if (!connectionString) throw new Error('WORKER_DATABASE_URL required');
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
let stopping = false;
const interval = Number(process.env.WORKER_POLL_MS ?? 5000);
if (!Number.isFinite(interval) || interval < 1000) throw new Error('Invalid worker poll interval');
// D0 probes privileges/connectivity only. Never claim or acknowledge business events before handlers exist.
async function probe() {
  try { await pool.query('SELECT id FROM abasong.outbox WHERE false'); console.log('Worker database ready'); }
  catch { console.error('Worker database unavailable'); }
}
async function stop() { stopping = true; clearInterval(timer); await pool.end(); }
const timer = setInterval(() => { if (!stopping) void probe(); }, interval);
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
void probe();
