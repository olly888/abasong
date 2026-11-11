import { PILOT_PROJECT } from "../../packages/runtime/src/index";
export function migrationTarget(
  raw: string | undefined,
  project: string | undefined,
  environment: string | undefined,
): URL {
  if (project !== PILOT_PROJECT || environment !== "pilot-dev" || !raw)
    throw new Error("Cloud target refused");
  const u = new URL(raw),
    direct = u.hostname === `db.${PILOT_PROJECT}.supabase.co`,
    pool = /^aws-\d+-us-west-1\.pooler\.supabase\.com$/.test(u.hostname);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    (!direct && !pool) ||
    u.pathname !== "/postgres" ||
    (u.port && u.port !== "5432") ||
    u.searchParams.get("sslmode") !== "verify-full" ||
    [...u.searchParams.keys()].some((k) => k !== "sslmode") ||
    decodeURIComponent(u.username) !==
      (direct ? "postgres" : `postgres.${PILOT_PROJECT}`) ||
    !u.password
  )
    throw new Error("Cloud target refused");
  return u;
}
