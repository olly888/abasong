import type { PoolClient } from "pg";
import { ApiError } from "../common/api-error";

export async function lockApartmentSharing(
  c: PoolClient,
  apartmentId: string,
  exclusive = false,
) {
  // The same transaction lock covers the state check through decryption or write.
  await c.query(
    `SELECT ${exclusive ? "pg_advisory_xact_lock" : "pg_advisory_xact_lock_shared"}(hashtextextended($1,0))`,
    [`access-apartment-sharing:${apartmentId.toLowerCase()}`],
  );
  const state = await c.query<{ paused: boolean; version: number }>(
    "SELECT paused,version FROM abasong.apartment_sharing_operations WHERE apartment_id=$1 ORDER BY version DESC LIMIT 1",
    [apartmentId],
  );
  return state.rows[0] ?? { paused: false, version: 0 };
}

export async function requireApartmentSharing(
  c: PoolClient,
  apartmentId: string,
) {
  if ((await lockApartmentSharing(c, apartmentId)).paused)
    throw new ApiError(409, "APARTMENT_SHARING_PAUSED", "该公寓暂不共享门禁码");
}
