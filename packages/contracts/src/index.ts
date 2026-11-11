export type { paths, components, operations } from './generated';
export { addressIdentity } from './address-identity';
export type { AddressIdentity } from './address-identity';
export { REQUIRED_SCHEMA_VERSIONS } from './schema-versions';
export {
  appliesToEntrance,
  entranceScopes,
  isEntranceScope,
  unconfirmedEntrance,
} from './entrance-scope';
export type { EntranceScope } from './entrance-scope';
// Opaque supplier IDs can exceed 500 chars. Keep a bound within the 16 KiB DTO.
export const SEARCH_RESULT_ID_MAX_LENGTH = 4096;
