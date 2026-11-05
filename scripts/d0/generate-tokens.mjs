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
function leaves(node, path = []) {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key.startsWith('$')) return [];
    return '$value' in value ? [[...path, key, value.$value]] : leaves(value, [...path, key]);
  });
}
const css = ['/* Generated from docs/design/tokens-v3.json (V3.1). Do not edit. */', ':root {'];
for (const leaf of leaves(source)) {
  const value = leaf.pop();
  const formatted = typeof value === 'object' ? `${value.value}${value.unit}` :
    typeof value === 'string' && value.startsWith('{') ? `var(--ab-${value.slice(1, -1).replaceAll('.', '-')})` : value;
  css.push(`  --ab-${leaf.join('-')}: ${formatted};`);
}
css.push('}', '');
for (const path of ['docs/design/tokens-v3.css', 'design/abasong-independent-v1/v12.1/tokens.css', 'design/abasong-independent-v1/v12.1-import/tokens.css']) writeFileSync(path, css.join('\n'));
