import { buildRuntimeTemplates } from "./runtime-templates";

export const RUNTIME_DEPLOYER = "abasong-pilot-dev-runtime-deployer";
export const SERVICE_ROLE_STACK = "abasong-pilot-dev-service-roles";
export const SECRET_STACK = "abasong-pilot-dev-secrets";
const scope = "abasong-pilot-dev";
const secretSuffixes = [
  "api-db",
  "sensitive-db",
  "worker-db",
  "data-hmac",
  "mapbox-search",
];

export function assertRuntimeApproval(value: unknown, apply: boolean) {
  const approval = value as Record<string, unknown> | null;
  if (
    !approval ||
    approval.approved !== true ||
    approval.region !== "us-west-1" ||
    approval.environment !== "pilot-dev"
  )
    throw new Error("Runtime resource approval required");
  if (apply && approval.iam_expansion_approved !== true)
    throw new Error("Specific expanded IAM approval required");
}

/** Initial daily deployment permissions. Compute permissions are a separate
 * reviewed increment. IAM bootstrap stays outside this principal. */
export function runtimeSecretEncryptionPolicy(
  account: string,
  ownerEmail: string,
) {
  if (
    !/^\d{12}$/.test(account) ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)
  )
    throw new Error("Runtime identity target refused");
  const arn = (service: string, suffix: string, region = "us-west-1") =>
    `arn:aws:${service}:${region}:${account}:${suffix}`;
  const secrets = secretSuffixes.map((name) =>
    arn("secretsmanager", `secret:abasong/pilot-dev/${name}-??????`),
  );
  const stacks = [
    SECRET_STACK,
    `${scope}-notifications`,
    `${scope}-certificate`,
    `${scope}-runtime`,
  ];
  const roles = [
    "api-execution",
    "worker-execution",
    "api-task",
    "worker-task",
  ].map((name) => arn("iam", `role/${scope}-${name}`, ""));
  const topic = arn("sns", `${scope}-alerts`);
  const allow = (
    Sid: string,
    Action: string[],
    Resource: string | string[],
    Condition?: Record<string, unknown>,
  ) => ({
    Sid,
    Effect: "Allow",
    Action,
    Resource,
    ...(Condition ? { Condition } : {}),
  });
  return {
    Version: "2012-10-17",
    Statement: [
      allow(
        "OnlyReviewedStacks",
        [
          "cloudformation:CreateStack",
          "cloudformation:UpdateStack",
          "cloudformation:DescribeStacks",
          "cloudformation:DescribeStackEvents",
          "cloudformation:DescribeStackResources",
          "cloudformation:ListStackResources",
          "cloudformation:GetTemplate",
          "cloudformation:CreateChangeSet",
          "cloudformation:DescribeChangeSet",
          "cloudformation:ExecuteChangeSet",
          "cloudformation:DeleteChangeSet",
        ],
        stacks.flatMap((name) => [
          arn("cloudformation", `stack/${name}/*`),
          arn("cloudformation", `changeSet/${name}-*/*`),
        ]),
      ),
      allow("TemplateValidation", ["cloudformation:ValidateTemplate"], "*", {
        StringEquals: { "aws:RequestedRegion": "us-west-1" },
      }),
      allow(
        "OnlyFiveSecrets",
        [
          "secretsmanager:CreateSecret",
          "secretsmanager:DescribeSecret",
          "secretsmanager:UpdateSecret",
          "secretsmanager:PutSecretValue",
          "secretsmanager:TagResource",
          "secretsmanager:ListSecretVersionIds",
          "secretsmanager:GetResourcePolicy",
        ],
        secrets,
      ),
      allow("CertificateRequestForApiOnly", ["acm:RequestCertificate"], "*", {
        "ForAllValues:StringEquals": {
          "acm:DomainNames": ["api-dev.abasong.com"],
        },
        StringEquals: {
          "acm:ValidationMethod": "DNS",
          "aws:RequestedRegion": "us-west-1",
        },
      }),
      allow(
        "CertificateMetadata",
        [
          "acm:DescribeCertificate",
          "acm:ListTagsForCertificate",
          "acm:GetCertificate",
        ],
        arn("acm", "certificate/*"),
      ),
      allow(
        "CertificateInitialTags",
        ["acm:AddTagsToCertificate"],
        arn("acm", "certificate/*"),
        {
          StringEquals: {
            "aws:RequestTag/Project": "Abasong",
            "aws:RequestTag/Environment": "pilot-dev",
          },
        },
      ),
      allow(
        "ProjectCertificateTags",
        ["acm:AddTagsToCertificate", "acm:RemoveTagsFromCertificate"],
        arn("acm", "certificate/*"),
        {
          StringEquals: {
            "aws:ResourceTag/Project": "Abasong",
            "aws:ResourceTag/Environment": "pilot-dev",
          },
        },
      ),
      allow(
        "OnlyAlertTopic",
        [
          "sns:CreateTopic",
          "sns:GetTopicAttributes",
          "sns:SetTopicAttributes",
          "sns:TagResource",
          "sns:ListTagsForResource",
          "sns:ListSubscriptionsByTopic",
        ],
        topic,
      ),
      allow("OwnerEmailSubscription", ["sns:Subscribe"], topic, {
        StringEquals: { "sns:Protocol": "email", "sns:Endpoint": ownerEmail },
      }),
      allow(
        "OnlyPilotCostBudget",
        ["budgets:ViewBudget", "budgets:ModifyBudget"],
        `arn:aws:budgets::${account}:budget/${scope}-monthly`,
      ),
      allow(
        "ReadServiceRoleMetadata",
        [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
        ],
        roles,
      ),
      allow("PassOnlyEcsRuntimeRoles", ["iam:PassRole"], roles, {
        StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
      }),
      allow(
        "ReadOnlyTwoLogGroups",
        [
          "logs:DescribeLogStreams",
          "logs:GetLogEvents",
          "logs:FilterLogEvents",
        ],
        ["api", "worker"].map((k) =>
          arn("logs", `log-group:/abasong/pilot-dev/${k}:*`),
        ),
      ),
      {
        Sid: "NoCredentialReadOrDataKeyAccess",
        Effect: "Deny",
        Action: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:BatchGetSecretValue",
          "acm:ExportCertificate",
        ],
        Resource: "*",
      },
      {
        Sid: "NoDirectKms",
        Effect: "Deny",
        Action: ["kms:*"],
        Resource: "*",
        Condition: {
          StringNotEqualsIfExists: {
            "kms:ViaService": "secretsmanager.us-west-1.amazonaws.com",
          },
        },
      },
      {
        Sid: "NoNonSecretsManagerKey",
        Effect: "Deny",
        Action: ["kms:*"],
        Resource: "*",
        Condition: {
          "ForAllValues:StringNotEquals": {
            "kms:ResourceAliases": ["alias/aws/secretsmanager"],
          },
        },
      },
      {
        Sid: "NoIamMutation",
        Effect: "Deny",
        Action: [
          "iam:Create*",
          "iam:Put*",
          "iam:Update*",
          "iam:Delete*",
          "iam:Attach*",
          "iam:Detach*",
          "iam:Add*",
          "iam:Remove*",
          "iam:Set*",
          "iam:Reset*",
          "iam:Enable*",
          "iam:Deactivate*",
          "iam:Change*",
          "iam:Upload*",
          "iam:Tag*",
          "iam:Untag*",
        ],
        Resource: "*",
      },
      {
        Sid: "NoAccountOrPackageChanges",
        Effect: "Deny",
        Action: [
          "organizations:*",
          "account:*",
          "freetier:UpgradeAccountPlan",
          "secretsmanager:DeleteSecret",
        ],
        Resource: "*",
      },
    ],
  };
}

/** Managed-service calls use AWS key policies, including ACM's ViaService,
 * GrantIsForAWSResource and GrantOperations restrictions. No KMS Allow here. */
export function runtimeSetupPolicy(account: string, ownerEmail: string) {
  const base = runtimeSecretEncryptionPolicy(account, ownerEmail);
  const statements: Record<string, unknown>[] = base.Statement.map((s) => {
    if (!["NoDirectKms", "NoNonSecretsManagerKey"].includes(s.Sid)) return s;
    const { Action: _action, Sid, ...rest } = s;
    void _action;
    return {
      ...rest,
      Sid,
      NotAction: "kms:DescribeKey",
      Resource: "arn:aws:kms:*:*:key/*",
      Condition:
        Sid === "NoDirectKms"
          ? {
              StringNotEqualsIfExists: {
                "kms:ViaService": [
                  "secretsmanager.us-west-1.amazonaws.com",
                  "acm.us-west-1.amazonaws.com",
                ],
              },
            }
          : {
              "ForAllValues:StringNotEquals": {
                "kms:ResourceAliases": [
                  "alias/aws/secretsmanager",
                  "alias/aws/acm",
                ],
              },
            },
    };
  });
  return { Version: base.Version, Statement: statements };
}

/** Fixed one-API/one-worker infrastructure scope. No account-wide IAM, database,
 * key administration, NAT, EC2 instances, RDS or arbitrary repository writes. */
export function runtimeParentNetworkPolicy(account: string) {
  if (!/^\d{12}$/.test(account)) throw new Error("Compute target refused");
  const arn = (service: string, resource: string) =>
    `arn:aws:${service}:us-west-1:${account}:${resource}`;
  const allow = (
    Sid: string,
    Action: string[],
    Resource: string | string[],
    Condition?: Record<string, unknown>,
  ) => ({
    Sid,
    Effect: "Allow",
    Action,
    Resource,
    ...(Condition ? { Condition } : {}),
  });
  const owned = {
    StringEquals: {
      "aws:ResourceTag/Project": "Abasong",
      "aws:ResourceTag/Environment": "pilot-dev",
    },
  };
  const ec2 = [
    "vpc",
    "subnet",
    "internet-gateway",
    "route-table",
    "security-group",
  ].map((type) => arn("ec2", `${type}/*`));
  const create = [
    "CreateVpc",
    "CreateSubnet",
    "CreateInternetGateway",
    "CreateRouteTable",
    "CreateSecurityGroup",
  ];
  return {
    Version: "2012-10-17",
    Statement: [
      allow(
        "RegionalMetadata",
        [
          "ec2:DescribeVpcs",
          "ec2:DescribeSubnets",
          "ec2:DescribeInternetGateways",
          "ec2:DescribeRouteTables",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeVpcAttribute",
          "ec2:DescribeNetworkAcls",
          "ec2:DescribeVpcEncryptionControls",
          "ec2:DescribeSecurityGroupRules",
          "elasticloadbalancing:Describe*",
        ],
        "*",
        { StringEquals: { "aws:RequestedRegion": "us-west-1" } },
      ),
      allow(
        "CreateTaggedNetworkOnly",
        create.map((a) => `ec2:${a}`),
        // Actions enumerate five creation APIs; AWS supplies their resource
        // kinds. This avoids repeating ARN lists without broadening actions.
        arn("ec2", "*/*"),
        {
          StringEquals: {
            "aws:RequestTag/Project": "Abasong",
            "aws:RequestTag/Environment": "pilot-dev",
          },
        },
      ),
      allow("TagNewNetworkOnly", ["ec2:CreateTags"], arn("ec2", "*/*"), {
        StringEquals: {
          "ec2:CreateAction": create,
          "aws:RequestTag/Project": "Abasong",
          "aws:RequestTag/Environment": "pilot-dev",
        },
      }),
      allow(
        "ManageOwnedNetworkOnly",
        [
          "ec2:CreateSubnet",
          "ec2:CreateSecurityGroup",
          "ec2:CreateRouteTable",
          "ec2:ModifyVpcAttribute",
          "ec2:ModifySubnetAttribute",
          "ec2:AttachInternetGateway",
          "ec2:DetachInternetGateway",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
          "ec2:AssociateRouteTable",
          "ec2:DisassociateRouteTable",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:DeleteVpc",
          "ec2:DeleteSubnet",
          "ec2:DeleteInternetGateway",
          "ec2:DeleteRouteTable",
          "ec2:DeleteSecurityGroup",
          "ec2:CreateTags",
          "ec2:DeleteTags",
        ],
        ec2,
        owned,
      ),
      allow(
        "OnlyPilotEcsFamilies",
        [
          "ecs:DescribeClusters",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:DescribeServiceDeployments",
          "ecs:ListServiceDeployments",
          "ecs:ListTagsForResource",
          "ecs:CreateCluster",
          "ecs:UpdateCluster",
          "ecs:DeleteCluster",
          "ecs:CreateService",
          "ecs:UpdateService",
          "ecs:DeleteService",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:TagResource",
          "ecs:UntagResource",
        ],
        [
          arn("ecs", `cluster/${scope}`),
          arn("ecs", `task/${scope}/*`),
          ...["api", "worker"].flatMap((kind) => [
            arn("ecs", `service/${scope}/${scope}-${kind}`),
            arn("ecs", `task-definition/${scope}-${kind}:*`),
            arn("ecs", `service-deployment/${scope}/${scope}-${kind}/*`),
          ]),
        ],
      ),
      allow(
        "OnlyPilotLoadBalancer",
        [
          "elasticloadbalancing:CreateLoadBalancer",
          "elasticloadbalancing:DeleteLoadBalancer",
          "elasticloadbalancing:ModifyLoadBalancerAttributes",
          "elasticloadbalancing:SetSecurityGroups",
          "elasticloadbalancing:SetSubnets",
          "elasticloadbalancing:SetIpAddressType",
          "elasticloadbalancing:CreateTargetGroup",
          "elasticloadbalancing:DeleteTargetGroup",
          "elasticloadbalancing:ModifyTargetGroup",
          "elasticloadbalancing:ModifyTargetGroupAttributes",
          "elasticloadbalancing:RegisterTargets",
          "elasticloadbalancing:DeregisterTargets",
          "elasticloadbalancing:CreateListener",
          "elasticloadbalancing:DeleteListener",
          "elasticloadbalancing:ModifyListener",
          "elasticloadbalancing:CreateRule",
          "elasticloadbalancing:DeleteRule",
          "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:SetRulePriorities",
          "elasticloadbalancing:AddTags",
          "elasticloadbalancing:RemoveTags",
        ],
        [
          arn("elasticloadbalancing", `loadbalancer/app/${scope}-alb/*`),
          arn("elasticloadbalancing", `targetgroup/${scope}-api/*`),
          arn("elasticloadbalancing", `listener/app/${scope}-alb/*/*`),
          arn("elasticloadbalancing", `listener-rule/app/${scope}-alb/*/*/*`),
        ],
      ),
      allow("EcrLoginInRegion", ["ecr:GetAuthorizationToken"], "*", {
        StringEquals: { "aws:RequestedRegion": "us-west-1" },
      }),
      allow(
        "PublishOnlyTwoRepositories",
        [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:DescribeImages",
          "ecr:DescribeImageScanFindings",
        ],
        ["api", "worker"].map((k) => arn("ecr", `repository/${scope}-${k}`)),
      ),
      allow(
        "OnlySixAlarms",
        [
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:TagResource",
          "cloudwatch:UntagResource",
          "cloudwatch:ListTagsForResource",
        ],
        [
          "api-cpu",
          "api-memory",
          "worker-cpu",
          "worker-memory",
          "healthytargets",
          "targeterrors",
        ].map((k) => arn("cloudwatch", `alarm:${scope}-${k}`)),
      ),

      {
        Sid: "KeepOwnershipTags",
        Effect: "Deny",
        Action: ["ec2:DeleteTags", "ecs:UntagResource"],
        Resource: "*",
        Condition: {
          "ForAnyValue:StringEquals": {
            "aws:TagKeys": ["Project", "Environment"],
          },
        },
      },
    ],
  };
}

/** SIDs are review labels only; omit them in the quota-limited managed policy.
 * Fargate task listing needs a wildcard resource with the exact cluster context,
 * rather than the cluster/task ARN list used by object-level operations. */
export function runtimeComputePolicy(account: string) {
  const base = runtimeParentNetworkPolicy(account);
  const statements: Record<string, unknown>[] = base.Statement.map((s) => {
    const { Sid: _sid, ...statement } = s;
    void _sid;
    return {
      ...statement,
      Action: statement.Action.filter((a) => a !== "ecs:ListTasks"),
    };
  });
  statements.push({
    Effect: "Allow",
    Action: ["ecs:ListTasks"],
    Resource: "*",
    Condition: {
      ArnEquals: {
        "ecs:cluster": `arn:aws:ecs:us-west-1:${account}:cluster/abasong-pilot-dev`,
      },
    },
  });
  return { Version: base.Version, Statement: statements };
}

/** Split the reviewed blueprint so root is used only for IAM initialization,
 * while the MFA project principal creates all billable resources. */
export function serviceRoleTemplate() {
  const identity = buildRuntimeTemplates().identities;
  const resources = Object.fromEntries(
    Object.entries(identity.Resources).filter(
      ([, r]) => (r as Record<string, unknown>).Type === "AWS::IAM::Role",
    ),
  );
  const parameters = {
    BusinessKeyArn: identity.Parameters.BusinessKeyArn,
    ...Object.fromEntries(
      secretSuffixes.map((suffix, i) => {
        const name = [
          "ApiDatabase",
          "SensitiveDatabase",
          "WorkerDatabase",
          "DataHmac",
          "MapboxSearch",
        ][i]!;
        return [
          name,
          {
            Type: "String",
            AllowedPattern: `^arn:aws:secretsmanager:us-west-1:[0-9]{12}:secret:abasong/pilot-dev/${suffix}-[A-Za-z0-9]{6}$`,
          },
        ];
      }),
    ),
  };
  const outputs = Object.fromEntries(
    Object.entries(identity.Outputs).filter(([name]) =>
      name.endsWith("RoleArn"),
    ),
  );
  return {
    ...identity,
    Description: "IAM-only initialization of four reviewed ECS service roles",
    Parameters: parameters,
    Resources: resources,
    Outputs: outputs,
  };
}

export function serviceSecretTemplate() {
  const identity = buildRuntimeTemplates().identities;
  return {
    ...identity,
    Description: "Five empty pilot service secrets; no values in template",
    Parameters: {},
    Resources: Object.fromEntries(
      Object.entries(identity.Resources).filter(
        ([, r]) =>
          (r as Record<string, unknown>).Type === "AWS::SecretsManager::Secret",
      ),
    ),
    Outputs: Object.fromEntries(
      Object.entries(identity.Outputs).filter(
        ([name]) => !name.endsWith("RoleArn"),
      ),
    ),
  };
}
