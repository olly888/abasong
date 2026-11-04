import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { buildRuntimeTemplates } from "./runtime-templates";
import { assertRuntimePlan } from "./runtime-plan";
import { prepareRuntimeBindings } from "./runtime-bindings";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";

function main() {
  const { account, mode, approval } = runtimeTarget();
  const match =
    /^--(certificate|notifications|runtime)-(check|create|repair|status)$/.exec(
      mode,
    );
  if (!match) throw new Error("Reviewed stack and mode required");
  const name = match[1] as "certificate" | "notifications" | "runtime",
    action = match[2];
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const stackName = `abasong-pilot-dev-${name}`,
    folder = ".tooling/cloud-runtime";
  const save = (file: string, value: unknown) =>
    writeFileSync(`${folder}/${file}.json`, JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  if (action === "status") {
    const result = aws([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
    ]);
    save(`${name}-status`, result);
    const stack = (
      result.Stacks as Array<{
        StackStatus: string;
        Outputs?: Array<{ OutputKey: string; OutputValue: string }>;
      }>
    )[0]!;
    let certificate: string | undefined, pending: number | undefined;
    if (name === "certificate") {
      const resources = aws([
        "cloudformation",
        "list-stack-resources",
        "--stack-name",
        stackName,
      ]).StackResourceSummaries as Array<{
        LogicalResourceId: string;
        PhysicalResourceId: string;
      }>;
      const arn = resources.find(
        (r) => r.LogicalResourceId === "ApiCertificate",
      )?.PhysicalResourceId;
      if (arn) {
        const description = aws([
          "acm",
          "describe-certificate",
          "--certificate-arn",
          arn,
        ]).Certificate as {
          DomainName: string;
          Status: string;
          DomainValidationOptions: Array<{
            ResourceRecord?: { Name: string; Type: string; Value: string };
          }>;
        };
        if (description.DomainName !== "api-dev.abasong.com")
          throw new Error("Certificate hostname refused");
        save("certificate-validation", { arn, ...description });
        certificate = description.Status;
      }
    } else if (name === "notifications" && stack.Outputs?.length) {
      const arn = stack.Outputs.find(
        (o) => o.OutputKey === "AlertTopicArn",
      )?.OutputValue;
      if (arn) {
        const subscriptions = aws([
          "sns",
          "list-subscriptions-by-topic",
          "--topic-arn",
          arn,
        ]).Subscriptions as Array<{ SubscriptionArn: string }>;
        pending = subscriptions.filter(
          (s) => s.SubscriptionArn === "PendingConfirmation",
        ).length;
      }
    }
    console.log(
      JSON.stringify({
        stack: stackName,
        status: stack.StackStatus,
        certificate,
        pending_email_confirmations: pending,
      }),
    );
    return;
  }
  const templates = buildRuntimeTemplates();
  assertRuntimePlan(templates);
  const template = templates[name];
  if (
    JSON.stringify(template) !==
    JSON.stringify(
      JSON.parse(readFileSync(`deploy/pilot-dev/${name}.json`, "utf8")),
    )
  )
    throw new Error("Source template differs");
  save(`${name}-template`, template);
  const runtime =
    name === "runtime"
      ? prepareRuntimeBindings(account, approval, aws)
      : undefined;
  const parameters = runtime
    ? Object.entries(runtime).map(([ParameterKey, ParameterValue]) => ({
        ParameterKey,
        ParameterValue,
      }))
    : name === "notifications"
      ? [{ ParameterKey: "OwnerEmail", ParameterValue: approval.alert_email }]
      : [];
  save(`${name}-parameters`, parameters);
  aws([
    "cloudformation",
    "validate-template",
    "--template-body",
    `file://${folder}/${name}-template.json`,
  ]);
  if (action === "check") {
    console.log(`${name} exact template and MFA target verified; no writes.`);
    return;
  }
  if (action === "repair") {
    if (name !== "certificate")
      throw new Error("Only initial empty certificate failure can be repaired");
    const before = (
      aws(["cloudformation", "describe-stacks", "--stack-name", stackName])
        .Stacks as Array<{ StackStatus: string }>
    )[0]!;
    const resources = aws([
      "cloudformation",
      "list-stack-resources",
      "--stack-name",
      stackName,
    ]).StackResourceSummaries as Array<{
      ResourceType: string;
      PhysicalResourceId?: string;
    }>;
    if (
      !["CREATE_FAILED", "UPDATE_FAILED"].includes(before.StackStatus) ||
      resources.some(
        (r) =>
          r.PhysicalResourceId ||
          r.ResourceType !== "AWS::CertificateManager::Certificate",
      )
    )
      throw new Error("Certificate repair scope refused");
    const prior = aws([
      "cloudformation",
      "get-template",
      "--stack-name",
      stackName,
    ]).TemplateBody;
    const old = structuredClone(template);
    (
      old.Resources.ApiCertificate as { Properties: Record<string, unknown> }
    ).Properties.DomainValidationOptions = [
      { DomainName: "api-dev.abasong.com" },
    ];
    const priorValue = typeof prior === "string" ? JSON.parse(prior) : prior;
    if (
      !isDeepStrictEqual(priorValue, old) &&
      !isDeepStrictEqual(priorValue, template)
    )
      throw new Error("Failed template differs from exact initial template");
    save("certificate-failed-template", priorValue);
  }
  const result = aws([
    "cloudformation",
    action === "repair" ? "update-stack" : "create-stack",
    "--stack-name",
    stackName,
    "--template-body",
    `file://${folder}/${name}-template.json`,
    ...(parameters.length
      ? ["--parameters", `file://${folder}/${name}-parameters.json`]
      : []),
    "--disable-rollback",
    "--client-request-token",
    `abasong-${name}-${randomUUID()}`,
  ]);
  save(`${name}-create`, { requested_at: new Date().toISOString(), result });
  console.log(
    `${name} stack requested; actual completion and external confirmation remain to be verified.`,
  );
}
try {
  main();
} catch (error) {
  safeFailure(error);
}
