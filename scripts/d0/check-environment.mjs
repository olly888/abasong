import { existsSync } from 'node:fs';
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Use Node 24 through ./scripts/dev');
console.log(JSON.stringify({ node: process.versions.node, localEnvPresent: existsSync('.env'), mapboxConfigPresent: existsSync('apps/mobile/.env.local') }));
