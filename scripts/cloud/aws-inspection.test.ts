import { expect, it } from "vitest";
import { inspectAwsAccount, type AwsReadResult } from "./aws-inspection";
const account = "123456789012";
function reader(
  options: {
    account?: string;
    billingAccount?: string;
    root?: boolean;
    denied?: boolean;
    partial?: boolean;
  } = {},
) {
  const calls: string[][] = [];
  const read = async (args: string[]): Promise<AwsReadResult> => {
    calls.push(args);
    if (args[0] === "sts")
      return {
        ok: true,
        data: {
          Account: options.account ?? account,
          Arn: `arn:aws:iam::${options.account ?? account}:${options.root ? "root" : "user/TEST"}`,
        },
      };
    if (args[0] === "iam")
      return {
        ok: true,
        data: {
          SummaryMap: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 0 },
        },
      };
    if (args[0] === "freetier")
      return {
        ok: true,
        data: {
          accountId: options.billingAccount ?? account,
          accountPlanType: "FREE",
          accountPlanStatus: "ACTIVE",
        },
      };
    if (options.denied) return { ok: false, reason: "denied" };
    return {
      ok: true,
      data: {
        AvailabilityZones: [{ ZoneName: "TEST" }],
        StackSummaries: [
          { StackName: "unrelated" },
          { StackName: "abasong-pilot-dev-core" },
          {
            StackName: "abasong-pilot-dev-retired",
            StackStatus: "DELETE_COMPLETE",
          },
        ],
        clusterArns: [],
        LoadBalancers: [],
        repositories: [],
        Aliases: [],
        CertificateSummaryList: [{ DomainName: "unrelated.example" }],
        ...(options.partial ? { NextToken: "TEST_ONLY_DO_NOT_LOG" } : {}),
      },
    };
  };
  return { calls, read };
}
it("refuses a wrong account before any billing or resource call", async () => {
  const r = reader({ account: "222222222222" });
  await expect(inspectAwsAccount(r.read, account)).rejects.toThrow("mismatch");
  expect(r.calls).toEqual([["sts", "get-caller-identity"]]);
});
it("refuses inconsistent billing identity before region inventory", async () => {
  const r = reader({ billingAccount: "222222222222" });
  await expect(inspectAwsAccount(r.read, account)).rejects.toThrow(
    "billing account mismatch",
  );
  expect(r.calls).toHaveLength(3);
});
it("returns metadata only, counts project resources and never marks root as deployment-ready", async () => {
  const r = reader({ root: true, partial: true }),
    result = await inspectAwsAccount(r.read, account);
  expect(result.identity_kind).toBe("root");
  expect(result.root_mfa_enabled).toBe(true);
  expect(result.provisioning_identity_ready).toBe(false);
  expect(result.inventory.find((x) => x.name === "project_stacks")?.count).toBe(
    1,
  );
  expect(
    result.inventory.find((x) => x.name === "project_certificates")?.count,
  ).toBe(0);
  expect(result.inventory.every((x) => x.partial)).toBe(true);
  expect(JSON.stringify(result)).not.toContain("TEST_ONLY_DO_NOT_LOG");
  expect(JSON.stringify(result)).not.toContain(account);
  expect(r.calls).toHaveLength(10);
});
it("reports denied inventory as unknown instead of claiming no resources", async () => {
  const result = await inspectAwsAccount(
    reader({ denied: true }).read,
    account,
  );
  expect(
    result.inventory.every((x) => x.count === null && x.state === "denied"),
  ).toBe(true);
});
