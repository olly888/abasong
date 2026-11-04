import { buildRuntimeTemplates } from "./runtime-templates";
import { isDeepStrictEqual } from "node:util";

type Obj = Record<string, unknown>;
/** Resume only the exact failed initial runtime plan; preserve all successful
 * resources and never combine recovery with a new image or parameter change. */
export function assertInitialRuntimeRecovery(
  template: unknown,
  oldParameters: Array<{ ParameterKey: string; ParameterValue: string }>,
  resourceIds: string[],
  values: Record<string, string>,
) {
  if (
    !isDeepStrictEqual(template, buildRuntimeTemplates().runtime) ||
    oldParameters.length !== Object.keys(values).length ||
    new Set(oldParameters.map((p) => p.ParameterKey)).size !==
      oldParameters.length ||
    !isDeepStrictEqual(
      Object.fromEntries(
        oldParameters.map((p) => [p.ParameterKey, p.ParameterValue]),
      ),
      values,
    ) ||
    new Set(resourceIds).size !== resourceIds.length ||
    resourceIds.some((id) => !(id in buildRuntimeTemplates().runtime.Resources))
  )
    throw new Error(
      "Initial runtime recovery differs from exact reviewed plan",
    );
}
function obj(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Deployment structure refused");
  return value as Obj;
}
function at(value: unknown, ...path: string[]): unknown {
  for (const key of path) value = obj(value)[key];
  return value;
}
function equal(value: unknown, expected: unknown, label: string) {
  if (JSON.stringify(value) !== JSON.stringify(expected))
    throw new Error(label);
}

/** Detect implicit/explicit CloudFormation cycles, unknown refs and misspelled
 * logical names. It is not a substitute for the AWS provider schema check. */
export function assertDependencyGraph(template: unknown) {
  const resources = obj(at(template, "Resources"));
  const parameters = obj(at(template, "Parameters"));
  const graph = new Map<string, Set<string>>();
  for (const [name, value] of Object.entries(resources)) {
    const edges = new Set<string>();
    const add = (ref: string) => {
      if (ref.startsWith("AWS::") || ref in parameters) return;
      if (!(ref in resources)) throw new Error("Unknown template reference");
      edges.add(ref);
    };
    const walk = (v: unknown) => {
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (!v || typeof v !== "object") return;
      const record = obj(v);
      if (typeof record.Ref === "string") add(record.Ref);
      if (Array.isArray(record["Fn::GetAtt"]))
        add(String(record["Fn::GetAtt"][0]));
      if (typeof record["Fn::Sub"] === "string")
        for (const match of record["Fn::Sub"].matchAll(/\$\{([^!}][^}]*)\}/g))
          add(match[1]!.split(".")[0]!);
      Object.values(record).forEach(walk);
    };
    walk(value);
    const depends = obj(value).DependsOn;
    if (typeof depends === "string") add(depends);
    else if (Array.isArray(depends)) depends.forEach((v) => add(String(v)));
    graph.set(name, edges);
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(node: string) {
    if (visiting.has(node)) throw new Error("Template dependency cycle");
    if (visited.has(node)) return;
    visiting.add(node);
    for (const edge of graph.get(node) ?? []) visit(edge);
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node);
}

export function assertRuntimePlan(plan: unknown) {
  const templates = obj(plan);
  equal(
    Object.keys(templates).sort(),
    ["certificate", "identities", "notifications", "runtime"],
    "Template inventory changed",
  );
  const expected = buildRuntimeTemplates();
  for (const name of Object.keys(expected)) {
    const t = templates[name];
    equal(at(t, "Metadata", "Environment"), "pilot-dev", "Wrong environment");
    equal(at(t, "Metadata", "Region"), "us-west-1", "Wrong region");
    const resources = obj(at(t, "Resources"));
    equal(
      Object.keys(resources).sort(),
      Object.keys(obj(at(expected, name, "Resources"))).sort(),
      "Resource inventory changed",
    );
    assertDependencyGraph(t);
  }
  const r = obj(at(templates.runtime, "Resources"));
  for (const kind of ["Api", "Worker"]) {
    const service = at(r, `${kind}Service`, "Properties");
    equal(at(service, "DesiredCount"), 1, "Single-instance pilot required");
    equal(
      at(service, "DeploymentConfiguration"),
      {
        MinimumHealthyPercent: 0,
        MaximumPercent: 100,
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      },
      "Maintenance-window deployment required",
    );
    equal(
      at(service, "EnableExecuteCommand"),
      false,
      "Remote shell is not approved",
    );
    const task = at(r, `${kind}Task`, "Properties");
    equal(at(task, "Cpu"), "256", "Unreviewed compute size");
    equal(at(task, "Memory"), "512", "Unreviewed compute size");
    const container = (at(task, "ContainerDefinitions") as unknown[])[0];
    equal(
      at(container, "ReadonlyRootFilesystem"),
      true,
      "Read-only root required",
    );
    equal(at(container, "User"), "1000:1000", "Non-root required");
    const image = at(container, "Image", "Fn::Sub");
    if (
      typeof image !== "string" ||
      !image.endsWith(`@sha256:\${${kind}ImageDigest}`)
    )
      throw new Error("Immutable image digest required");
    const environments = at(container, "Environment") as Obj[];
    if (
      environments.some((v) =>
        /DATABASE.*URL|(?:DATA|IDEMPOTENCY)_HMAC_KEY$|TOKEN|SECRET|LOCAL_DATA_KEK/.test(
          String(v.Name),
        ),
      )
    )
      throw new Error("Secret in plain environment");
    if (kind === "Worker")
      equal(
        at(container, "PortMappings"),
        undefined,
        "Worker cannot have ingress",
      );
  }
  equal(
    at(r, "WorkerSecurity", "Properties", "SecurityGroupIngress"),
    [],
    "Worker ingress refused",
  );
  equal(
    at(r, "ApiSecurity", "Properties", "SecurityGroupIngress"),
    [],
    "Direct API ingress refused",
  );
  equal(
    at(r, "ApiIngress", "Properties", "SourceSecurityGroupId"),
    { Ref: "EdgeSecurity" },
    "API must be ALB-only",
  );
  equal(
    at(r, "HttpsListener", "Properties", "SslPolicy"),
    "ELBSecurityPolicy-TLS13-1-2-2021-06",
    "TLS policy changed",
  );
  equal(
    at(r, "ApiHostRule", "Properties", "Conditions"),
    [
      {
        Field: "host-header",
        HostHeaderConfig: { Values: ["api-dev.abasong.com"] },
      },
    ],
    "API hostname changed",
  );
  const identities = obj(at(templates.identities, "Resources"));
  for (const [name, item] of Object.entries(identities)) {
    equal(
      at(item, "DeletionPolicy"),
      "Retain",
      "Identity/secret retention required",
    );
    if (at(item, "Type") === "AWS::SecretsManager::Secret") {
      if (
        at(item, "Properties", "SecretString") ||
        at(item, "Properties", "GenerateSecretString")
      )
        throw new Error("Credential preparation must not create values");
    } else {
      // Trust and policies are privileged: reject any deviation from the
      // reviewed role split, including wildcard decrypt or cross-service trust.
      equal(
        at(item, "Properties"),
        at(expected, "identities", "Resources", name, "Properties"),
        "Role boundary changed",
      );
    }
  }
  return { templates: 4, secrets: 5, runtime_roles: 4, services: 2, alarms: 6 };
}

/** Validate future deployment bindings, without printing values or calling AWS. */
export function assertRuntimeParameters(
  values: unknown,
  expectedAccount: string,
) {
  if (!/^\d{12}$/.test(expectedAccount))
    throw new Error("Explicit account required");
  const input = obj(values),
    definitions = obj(buildRuntimeTemplates().runtime.Parameters);
  equal(
    Object.keys(input).sort(),
    Object.keys(definitions).sort(),
    "Parameter inventory changed",
  );
  for (const [name, definition] of Object.entries(definitions)) {
    const value = input[name],
      pattern = obj(definition).AllowedPattern;
    if (
      typeof value !== "string" ||
      typeof pattern !== "string" ||
      !new RegExp(pattern).test(value)
    )
      throw new Error("Runtime parameter refused");
    if (value.startsWith("arn:") && value.split(":")[4] !== expectedAccount)
      throw new Error("Cross-account resource refused");
  }
}
