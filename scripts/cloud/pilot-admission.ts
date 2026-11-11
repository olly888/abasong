// Initial owner-controlled admission only. No app-admin impersonation, no new
// HTTP endpoint or permanent role. Executed by the connected DevWest owner.
import { randomUUID, createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  openSync,
  fstatSync,
  closeSync,
  constants,
} from "node:fs";
import { PILOT_API, PILOT_AUTH } from "../../apps/mobile/app.config";
import {
  runtimeTarget,
  awsRuntime,
  assertRuntimeCaller,
  safeFailure,
} from "./runtime-aws";

export type PilotAdmission = {
  operation_id: string;
  users: [string, string];
  valid_until: string;
  operator_sha256: string;
  environment: "pilot-dev";
  project: "mxlmemaunzoramgemiju";
};
export function pilotAdmissionSql(p: PilotAdmission) {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if (
    p.environment !== "pilot-dev" ||
    p.project !== "mxlmemaunzoramgemiju" ||
    !uuid.test(p.operation_id) ||
    p.users.length !== 2 ||
    new Set(p.users).size !== 2 ||
    !p.users.every((u) => uuid.test(u)) ||
    !/^[a-f0-9]{64}$/.test(p.operator_sha256) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.valid_until) ||
    !Number.isFinite(Date.parse(p.valid_until))
  )
    throw new Error("Admission target refused");
  const receipt = JSON.stringify(p),
    targets = p.users.map((u) => `'${u}'::uuid`).join(",");
  return `DO $admission$
DECLARE target_ids uuid[] := ARRAY[${targets}]; until_at timestamptz := '${p.valid_until}'; old_receipt text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('abasong:pilot-dev:initial-admission',0));
  IF NOT EXISTS(SELECT 1 FROM abasong.schema_version WHERE version='V12.0009') THEN RAISE EXCEPTION 'Schema refused'; END IF;
  SELECT reason INTO old_receipt FROM abasong.audit_events WHERE id='${p.operation_id}';
  IF FOUND THEN
    IF old_receipt IS DISTINCT FROM '${receipt}' OR (SELECT count(*) FROM abasong.capabilities WHERE user_id=ANY(target_ids) AND reason='pilot-bootstrap:${p.operation_id}')<>4 THEN RAISE EXCEPTION 'Admission receipt conflict'; END IF;
    RETURN; -- Replay never extends or restores expired/revoked access.
  END IF;
  IF until_at<=now() OR until_at>now()+interval '2 hours' THEN RAISE EXCEPTION 'Expiry refused'; END IF;
  IF EXISTS(SELECT 1 FROM abasong.audit_events WHERE action='operator.pilot.initial_admission') THEN RAISE EXCEPTION 'Initial admission already used'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE id=ANY(target_ids) AND phone_confirmed_at IS NOT NULL)<>2 OR
     (SELECT count(*) FROM abasong.users u JOIN abasong.profiles p ON p.user_id=u.id WHERE u.id=ANY(target_ids) AND u.status='active')<>2 THEN RAISE EXCEPTION 'Two confirmed active identities required'; END IF;
  IF EXISTS(SELECT 1 FROM abasong.capabilities WHERE user_id=ANY(target_ids) AND capability IN ('access.read','access.contribute') AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until>now())) THEN RAISE EXCEPTION 'Existing qualification refused'; END IF;
  INSERT INTO abasong.capabilities(user_id,capability,valid_until,reason)
    SELECT u,c,until_at,'pilot-bootstrap:${p.operation_id}' FROM unnest(target_ids) u CROSS JOIN unnest(ARRAY['access.read','access.contribute']) c;
  INSERT INTO abasong.audit_events(id,action,object_type,result,reason) VALUES('${p.operation_id}','operator.pilot.initial_admission','pilot_invitation','success','${receipt}');
END $admission$;`;
}
export function readAcceptanceSession(role: "A" | "B") {
  const path = `.tooling/cloud-runtime/acceptance/account-${role}.json`,
    fd = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  try {
    const st = fstatSync(fd);
    if (
      !st.isFile() ||
      st.mode & 0o077 ||
      st.uid !== process.getuid?.() ||
      st.size > 20000
    )
      throw new Error("Protected session required");
    const s = JSON.parse(readFileSync(fd, "utf8"));
    if (
      s.api !== PILOT_API ||
      s.issuer !== PILOT_AUTH + "/auth/v1" ||
      Date.parse(s.expires_at) < Date.now() + 60000 ||
      !Number.isFinite(Date.parse(s.expires_at)) ||
      Date.parse(s.authenticated_at) > Date.now() ||
      Date.parse(s.authenticated_at) < Date.now() - 3600000
    )
      throw new Error("Fresh reviewed identity required");
    return s as { access_token: string; user_id: string; expires_at: string };
  } finally {
    closeSync(fd);
  }
}
async function main() {
  const { account, mode } = runtimeTarget();
  if (mode !== "--prepare-admission")
    throw new Error("Prepare admission only; no direct database execution");
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const ids: string[] = [];
  for (const role of ["A", "B"] as const) {
    const session = readAcceptanceSession(role);
    const r = await fetch(PILOT_API + "/v1/me", {
      headers: { Authorization: "Bearer " + session.access_token },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error("Authenticated profile unavailable");
    const m = await r.json();
    if (
      m.user_id !== session.user_id ||
      m.status !== "active" ||
      !m.profile ||
      m.capabilities.length
    )
      throw new Error("Reviewed first-pilot target required");
    ids.push(m.user_id);
  }
  const principal = aws(["sts", "get-caller-identity"]);
  const p: PilotAdmission = {
    operation_id: randomUUID(),
    users: ids as [string, string],
    valid_until: new Date(Date.now() + 119 * 60000).toISOString(),
    operator_sha256: createHash("sha256")
      .update(String(principal.Arn))
      .digest("hex"),
    environment: "pilot-dev",
    project: "mxlmemaunzoramgemiju",
  };
  const dir = ".tooling/cloud-runtime/acceptance";
  writeFileSync(`${dir}/admission.json`, JSON.stringify(p), {
    mode: 0o600,
    flag: "wx",
  });
  writeFileSync(`${dir}/admission.sql`, pilotAdmissionSql(p), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    "Two SMS-authenticated profiles and project MFA deployment identity verified. Exact two-hour driver-only admission SQL prepared for the connected DevWest owner; no rights changed.",
  );
}
if (process.argv[1]?.endsWith("pilot-admission.ts"))
  void main().catch(safeFailure);
