import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client, escapeLiteral } from 'pg';
import { localTarget } from './database-target';

async function main() {
  const env = parseEnv(readFileSync('.env', 'utf8'));
  const admin = localTarget(env.DATABASE_ADMIN_URL);
  const runtime = localTarget(env.DATABASE_URL);
  assert.equal(admin.username, 'postgres');
  assert.equal(runtime.username, 'abasong_api_local');
  const workerPassword = env.WORKER_DATABASE_URL ? decodeURIComponent(localTarget(env.WORKER_DATABASE_URL).password) : randomBytes(24).toString('hex');
  const bootstrap = new Client({ connectionString: admin.href });
  await bootstrap.connect();
  // PostGIS image's default DB has public extensions. Create our own fresh app DB without touching it.
  if (!(await bootstrap.query("SELECT 1 FROM pg_database WHERE datname='abasong_d0'")).rowCount) await bootstrap.query('CREATE DATABASE abasong_d0 TEMPLATE template0');
  await bootstrap.end();
  admin.pathname = '/abasong_d0'; runtime.pathname = '/abasong_d0';
  const db = new Client({ connectionString: admin.href });
  await db.connect();
  try {
    if (!(await db.query("SELECT 1 FROM pg_namespace WHERE nspname='abasong'")).rowCount) await db.query(readFileSync('database/migrations/0001_v12_initial.sql', 'utf8'));
    assert((await db.query("SELECT version FROM abasong.schema_version WHERE version='V12.0001'")).rowCount === 1);
    if (!(await db.query("SELECT 1 FROM abasong.schema_version WHERE version='V12.0002'")).rowCount) await db.query(readFileSync('database/migrations/0002_personal_apartments.sql', 'utf8'));
    for (const [name, password, member] of [
      ['abasong_api_local', decodeURIComponent(runtime.password), 'abasong_api'],
      ['abasong_worker_local', workerPassword, 'abasong_worker'],
    ]) {
      assert(name && password && member);
      const exists = (await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount;
      if (!exists) await db.query(`CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${escapeLiteral(password)}`);
      await db.query(`GRANT ${member} TO ${name}`);
    }
    if (!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='abasong_untrusted_d0'")).rowCount) await db.query('CREATE ROLE abasong_untrusted_d0 NOLOGIN NOBYPASSRLS');
    const tables = await db.query("SELECT count(*)::int AS count, bool_and(relrowsecurity AND relforcerowsecurity) AS protected FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='abasong' AND relkind='r'");
    assert.equal(tables.rows[0].count, 47); assert.equal(tables.rows[0].protected, true);
    const extension = await db.query("SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace=n.oid WHERE extname='postgis'");
    assert.equal(extension.rows[0].nspname, 'extensions');
    await db.query('BEGIN');
    async function denied(sql: string, expected: string) {
      await db.query('SAVEPOINT denied_operation');
      let code: string | undefined;
      try { await db.query(sql); } catch (error) { code = (error as { code: string }).code; }
      await db.query('ROLLBACK TO SAVEPOINT denied_operation');
      assert.equal(code, expected);
    }
    await db.query('SET LOCAL ROLE abasong_untrusted_d0');
    await denied('SELECT * FROM abasong.users', '42501');
    await db.query('RESET ROLE');
    await db.query('SET LOCAL ROLE abasong_api');
    const userId = randomUUID();
    await db.query('INSERT INTO abasong.users(id) VALUES($1)', [userId]);
    await denied('SELECT * FROM abasong.access_secrets', '42501');
    await denied('SELECT * FROM abasong.message_secrets', '42501');
    await denied('SELECT * FROM abasong.request_private_details', '42501');
    await denied('UPDATE abasong.feedback_events SET value=value', '42501');
    await denied('DELETE FROM abasong.audit_events', '42501');
    await denied("INSERT INTO abasong.schema_version(version) VALUES('forbidden')", '42501');
    await denied(`INSERT INTO abasong.requests(publisher_id,kind,parcel_count) VALUES('${userId}','partial_route',-1)`, '23514');
    await db.query("INSERT INTO abasong.availability(user_id, starts_at, ends_at) VALUES($1, now(), now()+interval '1 hour')", [userId]);
    await denied(`INSERT INTO abasong.availability(user_id,starts_at,ends_at) VALUES('${userId}',now(),now()+interval '1 hour')`, '23505');
    assert.equal((await db.query("SELECT extensions.ST_Distance('SRID=4326;POINT(-118.24 34.05)'::extensions.geography, 'SRID=4326;POINT(-118.24 34.05)'::extensions.geography) AS meters")).rows[0].meters, 0);
    await db.query('RESET ROLE');
    await db.query('SET LOCAL ROLE abasong_worker');
    await db.query('SELECT id FROM abasong.outbox WHERE false');
    await denied('SELECT * FROM abasong.access_secrets', '42501');
    await denied('SELECT * FROM abasong.profiles', '42501');
    await db.query('ROLLBACK');
    const worker = new URL(runtime); worker.username = 'abasong_worker_local'; worker.password = workerPassword;
    env.DATABASE_ADMIN_URL = admin.href; env.DATABASE_URL = runtime.href; env.WORKER_DATABASE_URL = worker.href;
    writeFileSync('.env', Object.entries(env).map(([key,value]) => `${key}=${value}`).join('\n')+'\n', { mode: 0o600 });
    // Confirm actual non-owner login, not only SET ROLE under a privileged connection.
    const api = new Client({ connectionString: runtime.href }); await api.connect();
    try {
      const role = (await api.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
      assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
      assert.equal((await api.query('SELECT count(*)::int AS n FROM abasong.schema_version')).rows[0].n, 2);
    } finally { await api.end(); }
    console.log('PASS: 47 migrated tables, forced RLS, PostGIS query, untrusted role denied, sensitive separation, append-only permissions, constraints, rollback, non-owner login');
  } finally { await db.end(); }
}
main().catch((error: { code?: string }) => { console.error(`Database verification failed (${error.code ?? 'assertion/configuration'})`); process.exitCode = 1; });
