import { existsSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) { console.log('Local configuration already exists; preserved'); }
else {
  const admin = randomBytes(24).toString('hex');
  const api = randomBytes(24).toString('hex');
  writeFileSync('.env', `LOCAL_POSTGRES_PASSWORD=${admin}\nDATABASE_ADMIN_URL=postgresql://postgres:${admin}@127.0.0.1:54329/abasong_local\nDATABASE_URL=postgresql://abasong_api_local:${api}@127.0.0.1:54329/abasong_local\nAPI_HOST=127.0.0.1\nAPI_PORT=3001\nWORKER_POLL_MS=5000\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created isolated local configuration');
}

let localContent=readFileSync('.env','utf8');
if(!/^IDEMPOTENCY_HMAC_KEY=.+$/m.test(localContent)) {
  const entry=`IDEMPOTENCY_HMAC_KEY=${randomBytes(32).toString('hex')}`;
  localContent=/^IDEMPOTENCY_HMAC_KEY=.*$/m.test(localContent)?localContent.replace(/^IDEMPOTENCY_HMAC_KEY=.*$/m,entry):`${localContent}\n${entry}\n`;
  console.log('Added local-only idempotency HMAC key');
}
if(!/^IDEMPOTENCY_RETENTION_SECONDS=.+$/m.test(localContent)) {
  const entry='IDEMPOTENCY_RETENTION_SECONDS=86400';
  localContent=/^IDEMPOTENCY_RETENTION_SECONDS=.*$/m.test(localContent)?localContent.replace(/^IDEMPOTENCY_RETENTION_SECONDS=.*$/m,entry):`${localContent}\n${entry}\n`;
}
writeFileSync('.env',localContent,{mode:0o600});
chmodSync('.env',0o600);
