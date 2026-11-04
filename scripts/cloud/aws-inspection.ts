export type AwsReadResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false;
      reason: "denied" | "not_authenticated" | "not_found" | "unavailable";
    };
export type AwsReader = (args: string[]) => Promise<AwsReadResult>;
export const PILOT_REGION = "us-west-1";

// Deliberately read-only. Identity must match before any account inventory call.
// Reports contain counts/booleans, never session credentials or resource bodies.
export async function inspectAwsAccount(
  read: AwsReader,
  expectedAccount: string,
) {
  if (!/^\d{12}$/.test(expectedAccount))
    throw new Error("Expected AWS account required");
  const identity = await read(["sts", "get-caller-identity"]);
  if (!identity.ok) throw new Error("AWS sign-in required");
  const arn = identity.data.Arn;
  if (
    identity.data.Account !== expectedAccount ||
    typeof arn !== "string" ||
    !arn.startsWith(`arn:aws:`) ||
    arn.split(":")[4] !== expectedAccount
  )
    throw new Error("AWS account mismatch");
  const principal = arn.split(":").slice(5).join(":");
  const identityKind =
    principal === "root"
      ? "root"
      : principal.startsWith("assumed-role/")
        ? "assumed_role"
        : principal.startsWith("user/")
          ? "iam_user"
          : "other";
  const summary = await read(["iam", "get-account-summary"]);
  const map = summary.ok
    ? (summary.data.SummaryMap as Record<string, unknown> | undefined)
    : undefined;
  const plan = await read(["freetier", "get-account-plan-state"]);
  if (plan.ok && plan.data.accountId !== expectedAccount)
    throw new Error("AWS billing account mismatch");
  const planType =
    plan.ok && ["FREE", "PAID"].includes(String(plan.data.accountPlanType))
      ? String(plan.data.accountPlanType)
      : "unknown";
  const definitions = [
    {
      name: "available_zones",
      args: [
        "ec2",
        "describe-availability-zones",
        "--filters",
        "Name=state,Values=available",
      ],
      key: "AvailabilityZones",
    },
    {
      name: "project_stacks",
      args: ["cloudformation", "list-stacks"],
      key: "StackSummaries",
      field: "StackName",
      prefix: "abasong-pilot-dev",
    },
    {
      name: "project_clusters",
      args: ["ecs", "list-clusters"],
      key: "clusterArns",
      prefix: `arn:aws:ecs:${PILOT_REGION}:${expectedAccount}:cluster/abasong-pilot-dev`,
    },
    {
      name: "project_load_balancers",
      args: ["elbv2", "describe-load-balancers"],
      key: "LoadBalancers",
      field: "LoadBalancerName",
      prefix: "abasong-pilot-dev",
    },
    {
      name: "project_repositories",
      args: ["ecr", "describe-repositories"],
      key: "repositories",
      field: "repositoryName",
      prefix: "abasong-pilot-dev",
    },
    {
      name: "project_key_aliases",
      args: ["kms", "list-aliases"],
      key: "Aliases",
      field: "AliasName",
      prefix: "alias/abasong-pilot-dev",
    },
    {
      name: "project_certificates",
      args: ["acm", "list-certificates"],
      key: "CertificateSummaryList",
      field: "DomainName",
      exact: "api-dev.abasong.com",
    },
  ];
  const inventory: Array<{
    name: string;
    state: string;
    count: number | null;
    partial: boolean;
  }> = [];
  for (const d of definitions) {
    const result = await read(d.args);
    if (!result.ok) {
      inventory.push({
        name: d.name,
        state: result.reason,
        count: null,
        partial: true,
      });
      continue;
    }
    const rows = result.data[d.key];
    if (!Array.isArray(rows))
      throw new Error("Unexpected AWS inventory response");
    const selected = rows.filter((row) => {
      if (
        d.name === "project_stacks" &&
        (row as Record<string, unknown>).StackStatus === "DELETE_COMPLETE"
      )
        return false;
      const value = d.field ? (row as Record<string, unknown>)[d.field] : row;
      return d.exact
        ? value === d.exact
        : d.prefix
          ? typeof value === "string" && value.startsWith(d.prefix)
          : true;
    });
    inventory.push({
      name: d.name,
      state: "read",
      count: selected.length,
      partial: Boolean(
        result.data.NextToken ??
        result.data.nextToken ??
        result.data.NextMarker,
      ),
    });
  }
  return {
    environment: "pilot-dev",
    region: PILOT_REGION,
    account_suffix: expectedAccount.slice(-4),
    identity_kind: identityKind,
    root_mfa_enabled:
      map?.AccountMFAEnabled === 1
        ? true
        : map?.AccountMFAEnabled === 0
          ? false
          : null,
    root_access_keys_present:
      map?.AccountAccessKeysPresent === 1
        ? true
        : map?.AccountAccessKeysPresent === 0
          ? false
          : null,
    account_security_state: summary.ok ? "read" : summary.reason,
    plan_type: planType,
    plan_state: plan.ok
      ? String(plan.data.accountPlanStatus ?? "unknown")
      : plan.reason,
    inventory,
    read_only: true,
    // An assumed-role name and account MFA alone do not prove its policy scope.
    // This inventory never authorizes provisioning; review the actual role next.
    deployment_role_scope_verified: false,
    provisioning_identity_ready: false,
  };
}
