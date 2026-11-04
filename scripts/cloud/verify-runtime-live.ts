import https from "node:https";
import http from "node:http";
import type { TLSSocket } from "node:tls";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  awsRuntime,
  assertRuntimeCaller,
  runtimeTarget,
  safeFailure,
} from "./runtime-aws";
import { isDeepStrictEqual } from "node:util";
import { buildRuntimeTemplates } from "./runtime-templates";

type Permission = {
  IpProtocol: string;
  FromPort: number;
  ToPort: number;
  IpRanges: Array<{ CidrIp: string }>;
  Ipv6Ranges: unknown[];
  PrefixListIds: unknown[];
  UserIdGroupPairs: Array<{ GroupId: string }>;
};
type Group = {
  GroupId: string;
  IpPermissions: Permission[];
  IpPermissionsEgress: Permission[];
};
type Resource = {
  LogicalResourceId: string;
  PhysicalResourceId: string;
  ResourceStatus: string;
};
type Task = {
  cpu: string;
  memory: string;
  healthStatus: string;
  lastStatus: string;
  containers: Array<{
    name: string;
    lastStatus: string;
    healthStatus: string;
    imageDigest: string;
  }>;
};
const requireValue = (ok: unknown) => {
  if (!ok)
    throw new Error("Live runtime observation differs from reviewed pilot");
};

function request(path: string, plain = false, wrongHost = false) {
  return new Promise<{
    status: number;
    authorized: boolean;
    tls?: string | null;
    location?: string;
  }>((resolve, reject) => {
    const host = "api-dev.abasong.com";
    const req = (plain ? http : https).request(
      {
        hostname: host,
        servername: host,
        path,
        method: "GET",
        headers: wrongHost ? { host: "invalid.abasong.example" } : {},
        timeout: 8000,
      },
      (res) => {
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 32768) req.destroy(new Error("Response limit"));
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            authorized: plain || (req.socket as TLSSocket).authorized === true,
            tls: plain ? undefined : (req.socket as TLSSocket).getProtocol(),
            location: res.headers.location,
          }),
        );
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("HTTPS observation timed out")),
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const { account, mode } = runtimeTarget();
  if (mode !== "--verify-live")
    throw new Error("Explicit live observation mode required");
  const aws = awsRuntime();
  assertRuntimeCaller(aws, account);
  const folder = ".tooling/cloud-runtime";
  const stack = (
    aws([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      "abasong-pilot-dev-runtime",
    ]).Stacks as Array<{ StackStatus: string }>
  )[0]!;
  requireValue(
    ["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(stack.StackStatus),
  );
  const resources = aws([
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    "abasong-pilot-dev-runtime",
  ]).StackResourceSummaries as Resource[];
  const ids = Object.fromEntries(
    resources.map((r) => [r.LogicalResourceId, r.PhysicalResourceId]),
  );
  let preserved: number | null = null;
  if (existsSync(`${folder}/runtime-recovery-before.json`)) {
    const before = JSON.parse(
      readFileSync(`${folder}/runtime-recovery-before.json`, "utf8"),
    ).resources as Resource[];
    const completed = before.filter(
      (r) => r.ResourceStatus === "CREATE_COMPLETE" && r.PhysicalResourceId,
    );
    const changed = completed.filter(
      (r) => ids[r.LogicalResourceId] !== r.PhysicalResourceId,
    );
    if (changed.length) {
      // The reviewed first-login fix replaces only the API task definition.
      // The failed-initial-create snapshot must not forbid this intended update.
      requireValue(
        changed.length === 1 && changed[0]!.LogicalResourceId === "ApiTask",
      );
      const receipt = JSON.parse(
        readFileSync(`${folder}/bootstrap-changeset.json`, "utf8"),
      );
      requireValue(
        receipt.account === account &&
          receipt.stack === "abasong-pilot-dev-runtime",
      );
      const change = aws([
        "cloudformation",
        "describe-change-set",
        "--stack-name",
        receipt.stack,
        "--change-set-name",
        receipt.id,
      ]);
      requireValue(change.ExecutionStatus === "EXECUTE_COMPLETE");
      const raw = aws([
        "cloudformation",
        "get-template",
        "--stack-name",
        receipt.stack,
      ]).TemplateBody;
      requireValue(
        isDeepStrictEqual(
          typeof raw === "string" ? JSON.parse(raw) : raw,
          buildRuntimeTemplates().runtime,
        ),
      );
    }
    preserved = completed.length - changed.length;
  }
  const taskArns = aws([
    "ecs",
    "list-tasks",
    "--cluster",
    "abasong-pilot-dev",
    "--desired-status",
    "RUNNING",
  ]).taskArns as string[];
  requireValue(taskArns.length === 2);
  const tasks = aws([
    "ecs",
    "describe-tasks",
    "--cluster",
    "abasong-pilot-dev",
    "--tasks",
    ...taskArns,
  ]).tasks as Task[];
  const published = JSON.parse(
    readFileSync(`${folder}/published-images.json`, "utf8"),
  );
  requireValue(
    tasks.length === 2 &&
      new Set(tasks.map((t) => t.containers[0]?.name)).size === 2 &&
      tasks.every(
        (t) =>
          t.cpu === "256" &&
          t.memory === "512" &&
          t.lastStatus === "RUNNING" &&
          t.healthStatus === "HEALTHY" &&
          t.containers.length === 1 &&
          t.containers[0]?.lastStatus === "RUNNING" &&
          t.containers[0]?.healthStatus === "HEALTHY" &&
          t.containers[0]?.imageDigest ===
            published.images.find(
              (i: { kind: string }) => i.kind === t.containers[0]?.name,
            )?.digest,
      ),
  );
  const groups = aws([
    "ec2",
    "describe-security-groups",
    "--group-ids",
    ids.ApiSecurity!,
    ids.WorkerSecurity!,
    ids.EdgeSecurity!,
  ]).SecurityGroups as Group[];
  const api = groups.find((g) => g.GroupId === ids.ApiSecurity)!,
    worker = groups.find((g) => g.GroupId === ids.WorkerSecurity)!,
    edge = groups.find((g) => g.GroupId === ids.EdgeSecurity)!;
  const extrasEmpty = (p: Permission) =>
    p.Ipv6Ranges.length === 0 && p.PrefixListIds.length === 0;
  const onlyGroup = (p: Permission, port: number, id: string) =>
    p.IpProtocol === "tcp" &&
    p.FromPort === port &&
    p.ToPort === port &&
    p.IpRanges.length === 0 &&
    extrasEmpty(p) &&
    p.UserIdGroupPairs.length === 1 &&
    p.UserIdGroupPairs[0]?.GroupId === id;
  const worldPort = (p: Permission, ports: number[]) =>
    p.IpProtocol === "tcp" &&
    ports.includes(p.FromPort) &&
    p.FromPort === p.ToPort &&
    p.IpRanges.length === 1 &&
    p.IpRanges[0]?.CidrIp === "0.0.0.0/0" &&
    p.UserIdGroupPairs.length === 0 &&
    extrasEmpty(p);
  requireValue(
    api.IpPermissions.length === 1 &&
      onlyGroup(api.IpPermissions[0]!, 3001, edge.GroupId) &&
      worker.IpPermissions.length === 0,
  );
  for (const group of [api, worker])
    requireValue(
      group.IpPermissionsEgress.length === 2 &&
        new Set(group.IpPermissionsEgress.map((p) => p.FromPort)).size === 2 &&
        group.IpPermissionsEgress.every((p) => worldPort(p, [443, 5432])),
    );
  requireValue(
    edge.IpPermissions.length === 2 &&
      new Set(edge.IpPermissions.map((p) => p.FromPort)).size === 2 &&
      edge.IpPermissions.every((p) => worldPort(p, [80, 443])) &&
      edge.IpPermissionsEgress.length === 1 &&
      onlyGroup(edge.IpPermissionsEgress[0]!, 3001, api.GroupId),
  );
  const attributes = aws([
    "elbv2",
    "describe-load-balancer-attributes",
    "--load-balancer-arn",
    ids.LoadBalancer!,
  ]).Attributes as Array<{ Key: string; Value: string }>;
  requireValue(
    attributes.find((v) => v.Key === "access_logs.s3.enabled")?.Value ===
      "false" &&
      attributes.find((v) => v.Key === "routing.http.desync_mitigation_mode")
        ?.Value === "strictest",
  );
  const logs = aws([
    "logs",
    "filter-log-events",
    "--log-group-name",
    "/abasong/pilot-dev/worker",
    "--filter-pattern",
    '"Worker database ready"',
    "--limit",
    "5",
  ]).events as Array<{ message: string }>;
  requireValue(logs.some((e) => e.message.trim() === "Worker database ready"));
  const alarmNames = [
    "api-cpu",
    "api-memory",
    "worker-cpu",
    "worker-memory",
    "healthytargets",
    "targeterrors",
  ].map((n) => `abasong-pilot-dev-${n}`);
  const alarms = aws([
    "cloudwatch",
    "describe-alarms",
    "--alarm-names",
    ...alarmNames,
  ]).MetricAlarms as Array<{ StateValue: string }>;
  requireValue(
    alarms.length === 6 && alarms.every((a) => a.StateValue === "OK"),
  );
  const boundaries = [];
  for (const c of [
    { path: "/health/live", expected: 200 },
    { path: "/health/ready", expected: 200 },
    { path: "/v1/me", expected: 401 },
    { path: "/health/live", expected: 301, plain: true },
    { path: "/health/live", expected: 404, wrong: true },
  ]) {
    const response = await request(c.path, c.plain, c.wrong);
    requireValue(
      response.status === c.expected &&
        response.authorized &&
        (!c.plain ||
          new URL(response.location!).href ===
            `https://api-dev.abasong.com${c.path}`),
    );
    boundaries.push({
      path: c.path,
      plain: Boolean(c.plain),
      wrong_host: Boolean(c.wrong),
      status: response.status,
      tls: response.tls,
    });
  }
  const result = {
    checked_at: new Date().toISOString(),
    stack: stack.StackStatus,
    preserved_existing_resources: preserved,
    healthy_tasks: 2,
    exact_tested_images: true,
    worker_database_ready: true,
    network_rules_verified: true,
    alb_url_logs_disabled: true,
    alarms_ok: 6,
    boundaries,
    business_rows_written: 0,
    credentials_sent: false,
  };
  writeFileSync(
    `${folder}/live-verification.json`,
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      healthy_tasks: 2,
      alarms_ok: 6,
      https_checks: boundaries.length,
      network_and_logs_verified: true,
      private_data_output: false,
    }),
  );
}
void main().catch(safeFailure);
