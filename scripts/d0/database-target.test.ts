import { expect, test } from 'vitest';
import { localTarget } from './database-target';
test('database verifier rejects cloud, default ports, unknown DBs and connection overrides', () => {
  for (const target of [undefined, 'postgres://u:p@example.com:54329/abasong_d0', 'postgres://u:p@127.0.0.1/abasong_d0', 'postgres://u:p@127.0.0.1:54329/production', 'postgres://u:p@127.0.0.1:54329/abasong_d0?host=example.com']) expect(() => localTarget(target)).toThrow();
  expect(localTarget('postgres://u:p@127.0.0.1:54329/abasong_d0').pathname).toBe('/abasong_d0');
});
