import { expect, test } from 'vitest';
import { maskedPhone, normalizePhone } from './phone';
test('phone input normalizes national/international forms and rejects a mismatched region', () => {
  expect(normalizePhone('(202) 555-0146', 'US')).toBe('+12025550146');
  expect(normalizePhone('+1 202 555 0146', 'US')).toBe('+12025550146');
  expect(normalizePhone('123', 'US')).toBeNull();
  expect(normalizePhone('+44 20 7946 0958', 'US')).toBeNull();
});
test('verification page masks the full number', () => {
  expect(maskedPhone('+12025550146')).toBe('+1 ···· 0146');
  expect(maskedPhone('invalid')).toBe('····');
});
