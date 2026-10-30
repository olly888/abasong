import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync('docs/design/tokens-v3.json', 'utf8'));
function resolve(value) {
  if (value && typeof value === 'object' && '$value' in value) return resolve(value.$value);
  if (typeof value === 'string' && /^\{[^}]+\}$/.test(value)) {
    const target = value.slice(1, -1).split('.').reduce((node, key) => node[key], source);
    return resolve(target);
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('$')).map(([key, child]) => [key, resolve(child)]));
}
writeFileSync('packages/ui/src/index.ts', `// Generated from docs/design/tokens-v3.json. Do not edit.\nexport const tokens = ${JSON.stringify(resolve(source), null, 2)} as const;\n`);
