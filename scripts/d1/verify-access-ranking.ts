import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import { Client } from 'pg';
import { localTarget } from '../d0/database-target';
import { buildAccessRankingQuery, type AccessRankingRow } from '../../apps/api/src/access/access-ranking.query';

async function main() {
  const env = parseEnv(readFileSync('.env', 'utf8'));
  const target = localTarget(env.DATABASE_ADMIN_URL);
  assert.equal(target.pathname, '/abasong_d0');
  const db = new Client({ connectionString: target.href });
  await db.connect();
  let checks = 0;
  const now = new Date('2026-10-29T20:00:00Z');
  const since = new Date('2026-10-22T20:00:00Z'); // Explicit synthetic test interval, not a production default.
  try {
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE abasong_api');
    const owner = randomUUID(), voter1 = randomUUID(), voter2 = randomUUID(), source = randomUUID(), apartment = randomUUID();
    await db.query('INSERT INTO abasong.users(id) VALUES ($1),($2),($3)', [owner,voter1,voter2]);
    await db.query("INSERT INTO abasong.data_sources(id,source_type,license_reference,persistent_use_approved) VALUES($1,'own_field','synthetic-rollback-fixture',true)", [source]);
    await db.query("INSERT INTO abasong.apartments(id,address_line1,city,point,source_id,status) VALUES($1,'Synthetic test address','Test',extensions.ST_GeogFromText('SRID=4326;POINT(-118.24 34.05)'),$2,'active')", [apartment,source]);
    let serial = 0;
    async function record(day: number, overrides: { status?: string; scope?: string; expires?: Date; id?: string } = {}) {
      const id = overrides.id ?? randomUUID(); serial++;
      await db.query(`INSERT INTO abasong.access_records(id,apartment_id,contributor_id,method,scope_key,dedup_hmac,hmac_key_version,status,source_attested_at,contributed_at,expires_at)
        VALUES($1,$2,$3,'keypad',$4,$5,'synthetic-test',$6,$7,$8,$9)`,
      [id,apartment,owner,overrides.scope ?? 'main',createHash('sha256').update(String(serial)).digest(),overrides.status ?? 'active',now,new Date(`2026-10-${String(day).padStart(2,'0')}T10:00:00Z`),overrides.expires ?? null]);
      return id;
    }
    async function feedback(id: string, user = voter1, value = 'useful', updated = now, applicable = true, excluded: Date | null = null) {
      await db.query(`INSERT INTO abasong.access_feedback(record_id,user_id,value,updated_at,applicable,excluded_at) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(record_id,user_id) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at,applicable=EXCLUDED.applicable,excluded_at=EXCLUDED.excluded_at`, [id,user,value,updated,applicable,excluded]);
    }
    async function ranked(limit = 20) {
      return (await db.query<AccessRankingRow>(buildAccessRankingQuery({ apartmentId: apartment, scopeKeys: ['main'], asOf: now, effectiveUsefulSince: since, limit }))).rows;
    }
    const olderUseful = await record(23), newer = await record(28), newerUseful = await record(27);
    await feedback(olderUseful); await feedback(olderUseful,voter2); await feedback(newerUseful);
    assert.deepEqual((await ranked()).map(row=>row.id),[newerUseful,olderUseful,newer]); checks++; // Votes do not outweigh contribution time.
    await feedback(newerUseful,voter1,'withdrawn');
    assert.deepEqual((await ranked()).map(row=>row.id),[olderUseful,newer,newerUseful]); checks++;
    await feedback(olderUseful,voter1,'withdrawn');
    assert.equal((await ranked())[0]?.id,olderUseful); checks++; // Another voter's current useful survives.
    await feedback(olderUseful,voter2,'not_useful');
    assert.deepEqual((await ranked()).map(row=>row.id),[newer,newerUseful,olderUseful]); checks++;
    for (const [updated,applicable,excluded] of [
      [new Date('2026-10-21T20:00:00Z'),true,null], [now,false,null], [now,true,now], [new Date('2026-10-30T20:00:00Z'),true,null],
    ] as const) {
      await feedback(olderUseful,voter1,'useful',updated,applicable,excluded);
      assert.equal((await ranked())[0]?.id,newer); checks++;
    }
    await feedback(olderUseful,voter1,'useful',since);
    assert.equal((await ranked())[0]?.id,olderUseful); checks++; // Interval boundary inclusive.
    await db.query("UPDATE abasong.users SET status='suspended' WHERE id=$1",[voter1]);
    assert.equal((await ranked())[0]?.id,newer); checks++;
    await db.query("UPDATE abasong.users SET status='active' WHERE id=$1",[voter1]);
    const invalid = await record(29,{status:'invalid'}), expired = await record(29,{expires:now}), otherScope = await record(29,{scope:'garage'});
    await feedback(invalid); await feedback(expired); await feedback(otherScope);
    assert(!(await ranked()).some(row=>[invalid,expired,otherScope].includes(row.id))); checks++;
    const before = (await db.query('SELECT contributed_at FROM abasong.access_records WHERE id=$1',[olderUseful])).rows[0].contributed_at;
    await db.query("INSERT INTO abasong.access_contributions(record_id,user_id,event_type) VALUES($1,$2,'same_value_validation')",[olderUseful,voter2]);
    const after = (await db.query('SELECT contributed_at FROM abasong.access_records WHERE id=$1',[olderUseful])).rows[0].contributed_at;
    assert.equal(before.getTime(),after.getTime()); checks++;
    const tieLow = await record(29,{id:'00000000-0000-4000-8000-000000000001'}), tieHigh = await record(29,{id:'00000000-0000-4000-8000-000000000002'});
    const ids = (await ranked()).map(row=>row.id); assert(ids.indexOf(tieHigh)<ids.indexOf(tieLow)); checks++;
    assert.equal((await ranked(1)).length,1); checks++;
    assert.deepEqual(Object.keys((await ranked())[0]!).sort(),['contributed_at','has_current_effective_useful','id']); checks++;
    await db.query("UPDATE abasong.apartments SET status='withdrawn' WHERE id=$1",[apartment]);
    assert.equal((await ranked()).length,0); checks++;
    await db.query('ROLLBACK');
    console.log(`PASS: ${checks} real PostgreSQL access-ranking scenarios; synthetic fixture rolled back; metadata only, no secret read`);
  } finally { await db.end(); }
}
main().catch(() => { console.error('D1 access-ranking verification failed'); process.exitCode=1; });
