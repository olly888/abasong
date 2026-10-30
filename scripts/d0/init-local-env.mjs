import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) { console.log('Local configuration already exists; preserved'); }
else {
  const admin = randomBytes(24).toString('hex');
  const api = randomBytes(24).toString('hex');
  writeFileSync('.env', `LOCAL_POSTGRES_PASSWORD=${admin}\nDATABASE_ADMIN_URL=postgresql://postgres:${admin}@127.0.0.1:54329/abasong_local\nDATABASE_URL=postgresql://abasong_api_local:${api}@127.0.0.1:54329/abasong_local\nAPI_HOST=127.0.0.1\nAPI_PORT=3001\nWORKER_POLL_MS=5000\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created isolated local configuration');
}
