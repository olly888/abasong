import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const file = 'apps/mobile/.env.local';
if (!existsSync(file)) { console.log('Mapbox public token not configured'); process.exitCode = 1; }
else {
  const token = parseEnv(readFileSync(file, 'utf8')).EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token?.startsWith('pk.')) { console.log('A public pk token is required; secret tokens are not accepted'); process.exitCode = 1; }
  else {
    try {
      const url = new URL('https://api.mapbox.com/styles/v1/mapbox/streets-v12');
      url.searchParams.set('access_token', token);
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) { console.log(`Mapbox style access failed: HTTP ${response.status}`); process.exitCode = 1; }
      else { const style = await response.json(); if (style.version !== 8 || !style.sources) throw new Error('Invalid style'); console.log('Mapbox public token style access passed; native map rendering still requires device verification'); }
    } catch { console.log('Mapbox style access unavailable'); process.exitCode = 1; }
  }
}
