import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
export const phoneCountries = [
  { country: 'US', code: '+1', name: '美国 / 加拿大' },
  { country: 'CN', code: '+86', name: '中国' },
] as const;
export function normalizePhone(
  input: string,
  country: CountryCode,
): string | null {
  const parsed = parsePhoneNumberFromString(input, country);
  if (!parsed?.isValid()) return null;
  if (country === 'US' && parsed.country !== 'US' && parsed.country !== 'CA')
    return null;
  if (country === 'CN' && parsed.country !== 'CN') return null;
  return parsed.number;
}
export function maskedPhone(input: string): string {
  const phone = parsePhoneNumberFromString(input);
  return phone
    ? `+${phone.countryCallingCode} ···· ${phone.nationalNumber.slice(-4)}`
    : '····';
}
