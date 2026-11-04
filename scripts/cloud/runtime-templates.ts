type Obj = Record<string, unknown>;
const ref = (name: string) => ({ Ref: name });
const sub = (value: string) => ({ "Fn::Sub": value });
const get = (name: string, property: string) => ({
  "Fn::GetAtt": [name, property],
});
const tags = [
  { Key: "Project", Value: "Abasong" },
  { Key: "Environment", Value: "pilot-dev" },
];
const scope = "abasong-pilot-dev";
const secretNames = {
  ApiDatabase: "api-db",
  SensitiveDatabase: "sensitive-db",
  WorkerDatabase: "worker-db",
  DataHmac: "data-hmac",
  MapboxSearch: "mapbox-search",
};
function resource(Type: string, Properties: Obj, retain = false): Obj {
  return {
    Type,
    ...(retain
      ? { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" }
      : {}),
    Properties,
  };
}
function template(
  description: string,
  Parameters: Obj,
  Resources: Obj,
  Outputs: Obj = {},
) {
  return {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: description,
    Metadata: {
      Environment: "pilot-dev",
      Region: "us-west-1",
      ReviewOnly: true,
    },
    Parameters,
    Resources,
    Outputs,
  };
}
const string = (pattern?: string): Obj => ({
  Type: "String",
  ...(pattern ? { AllowedPattern: pattern } : {}),
});
const policy = (Statement: Obj[]) => ({ Version: "2012-10-17", Statement });
const allow = (Action: string[], Resource: unknown, Condition?: Obj): Obj => ({
  Effect: "Allow",
  Action,
  Resource,
  ...(Condition ? { Condition } : {}),
});
const trust = () =>
  policy([
    {
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole",
      Condition: {
        StringEquals: { "aws:SourceAccount": ref("AWS::AccountId") },
        ArnLike: {
          "aws:SourceArn": sub(
            "arn:${AWS::Partition}:ecs:us-west-1:${AWS::AccountId}:*",
          ),
        },
      },
    },
  ]);
const roleName = (name: string) => `${scope}-${name}`;
const role = (name: string, statements: Obj[]) =>
  resource(
    "AWS::IAM::Role",
    {
      RoleName: roleName(name),
      AssumeRolePolicyDocument: trust(),
      MaxSessionDuration: 3600,
      Tags: tags,
      Policies: [
        { PolicyName: "PilotOnly", PolicyDocument: policy(statements) },
      ],
    },
    true,
  );

export function buildRuntimeTemplates() {
  const identityResources: Obj = {};
  for (const [name, suffix] of Object.entries(secretNames))
    identityResources[name] = resource(
      "AWS::SecretsManager::Secret",
      {
        Name: `abasong/pilot-dev/${suffix}`,
        Description:
          "Populate through the reviewed private credential workflow before starting tasks",
        Tags: tags,
      },
      true,
    );
  for (const kind of ["api", "worker"] as const) {
    const secrets =
      kind === "api"
        ? ["ApiDatabase", "SensitiveDatabase", "DataHmac", "MapboxSearch"]
        : ["WorkerDatabase"];
    identityResources[
      kind === "api" ? "ApiExecutionRole" : "WorkerExecutionRole"
    ] = role(`${kind}-execution`, [
      allow(["ecr:GetAuthorizationToken"], "*", {
        StringEquals: { "aws:RequestedRegion": "us-west-1" },
      }),
      allow(
        [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ],
        sub(
          `arn:\${AWS::Partition}:ecr:us-west-1:\${AWS::AccountId}:repository/${scope}-${kind}`,
        ),
      ),
      allow(
        ["logs:CreateLogStream", "logs:PutLogEvents"],
        sub(
          `arn:\${AWS::Partition}:logs:us-west-1:\${AWS::AccountId}:log-group:/abasong/pilot-dev/${kind}:log-stream:*`,
        ),
      ),
      allow(["secretsmanager:GetSecretValue"], secrets.map(ref)),
      { Effect: "Deny", Action: "kms:*", Resource: ref("BusinessKeyArn") },
    ]);
  }
  identityResources.ApiTaskRole = role("api-task", [
    allow(["kms:GenerateDataKey", "kms:Decrypt"], ref("BusinessKeyArn"), {
      StringEquals: {
        "kms:EncryptionContext:app": "abasong",
        "kms:EncryptionContext:environment": "pilot-dev",
      },
      Null: { "kms:EncryptionContext:aad_sha256": "false" },
      "ForAllValues:StringEquals": {
        "kms:EncryptionContextKeys": ["app", "environment", "aad_sha256"],
      },
    }),
  ]);
  identityResources.WorkerTaskRole = role("worker-task", [
    { Effect: "Deny", Action: "*", Resource: "*" },
  ]);
  const identityOutputs: Obj = {};
  for (const name of Object.keys(secretNames))
    identityOutputs[`${name}Arn`] = { Value: ref(name) };
  for (const name of [
    "ApiExecutionRole",
    "WorkerExecutionRole",
    "ApiTaskRole",
    "WorkerTaskRole",
  ])
    identityOutputs[`${name}Arn`] = { Value: get(name, "Arn") };
  const identities = template(
    "Review-only pilot service identities and empty secrets; no values, no runtime tasks",
    {
      BusinessKeyArn: string(
        "^arn:aws:kms:us-west-1:[0-9]{12}:key/[0-9a-f-]{36}$",
      ),
    },
    identityResources,
    identityOutputs,
  );

  const notifications = template(
    "Review-only owner-confirmed pilot alerts and account-wide monthly cost notifications",
    { OwnerEmail: string("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$") },
    {
      Alerts: resource("AWS::SNS::Topic", {
        TopicName: `${scope}-alerts`,
        Tags: tags,
      }),
      OwnerSubscription: resource("AWS::SNS::Subscription", {
        TopicArn: ref("Alerts"),
        Protocol: "email",
        Endpoint: ref("OwnerEmail"),
      }),
      AlertPublishPolicy: resource("AWS::SNS::TopicPolicy", {
        Topics: [ref("Alerts")],
        PolicyDocument: policy([
          {
            Effect: "Allow",
            Principal: { Service: "cloudwatch.amazonaws.com" },
            Action: "sns:Publish",
            Resource: ref("Alerts"),
            Condition: {
              StringEquals: { "aws:SourceAccount": ref("AWS::AccountId") },
              ArnLike: {
                "aws:SourceArn": sub(
                  `arn:\${AWS::Partition}:cloudwatch:us-west-1:\${AWS::AccountId}:alarm:${scope}-*`,
                ),
              },
            },
          },
        ]),
      }),
      MonthlyBudget: resource("AWS::Budgets::Budget", {
        Budget: {
          BudgetName: `${scope}-monthly`,
          BudgetType: "COST",
          TimeUnit: "MONTHLY",
          BudgetLimit: { Amount: 100, Unit: "USD" },
          CostTypes: { IncludeCredit: false, IncludeRefund: false },
        },
        NotificationsWithSubscribers: [50, 80, 100].map((Threshold) => ({
          Notification: {
            NotificationType: "ACTUAL",
            ComparisonOperator: "GREATER_THAN",
            Threshold,
            ThresholdType: "PERCENTAGE",
          },
          Subscribers: [
            { SubscriptionType: "EMAIL", Address: ref("OwnerEmail") },
          ],
        })),
      }),
    },
    { AlertTopicArn: { Value: ref("Alerts") } },
  );

  const certificate = template(
    "Review-only non-exportable public certificate; external DNS confirmation is required",
    {},
    {
      ApiCertificate: resource(
        "AWS::CertificateManager::Certificate",
        {
          DomainName: "api-dev.abasong.com",
          CertificateExport: "DISABLED",
          ValidationMethod: "DNS",
          Tags: tags,
        },
        true,
      ),
    },
    { CertificateArn: { Value: ref("ApiCertificate") } },
  );

  const parameters: Obj = {
    CertificateArn: string(
      "^arn:aws:acm:us-west-1:[0-9]{12}:certificate/[0-9a-f-]{36}$",
    ),
    BusinessKeyArn: string(
      "^arn:aws:kms:us-west-1:[0-9]{12}:key/[0-9a-f-]{36}$",
    ),
    DatabaseHost: string(
      "^(db\\.mxlmemaunzoramgemiju\\.supabase\\.co|aws-[0-9]+-us-west-1\\.pooler\\.supabase\\.com)$",
    ),
    ApiImageDigest: string("^[a-f0-9]{64}$"),
    WorkerImageDigest: string("^[a-f0-9]{64}$"),
    AlertTopicArn: string(`^arn:aws:sns:us-west-1:[0-9]{12}:${scope}-alerts$`),
  };
  for (const name of [
    "ApiExecutionRole",
    "WorkerExecutionRole",
    "ApiTaskRole",
    "WorkerTaskRole",
  ])
    parameters[`${name}Arn`] = string(
      `^arn:aws:iam::[0-9]{12}:role/${roleName(
        name
          .replace(/([a-z])([A-Z])/g, "$1-$2")
          .toLowerCase()
          .replace("-role", ""),
      )}$`,
    );
  for (const [name, suffix] of Object.entries(secretNames))
    parameters[`${name}Arn`] = string(
      `^arn:aws:secretsmanager:us-west-1:[0-9]{12}:secret:abasong/pilot-dev/${suffix}-[A-Za-z0-9]{6}$`,
    );
  const resources: Obj = {
    Vpc: resource("AWS::EC2::VPC", {
      CidrBlock: "10.42.0.0/16",
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
      Tags: tags,
    }),
    Gateway: resource("AWS::EC2::InternetGateway", { Tags: tags }),
    GatewayAttachment: resource("AWS::EC2::VPCGatewayAttachment", {
      VpcId: ref("Vpc"),
      InternetGatewayId: ref("Gateway"),
    }),
    Routes: resource("AWS::EC2::RouteTable", { VpcId: ref("Vpc"), Tags: tags }),
    InternetRoute: {
      ...resource("AWS::EC2::Route", {
        RouteTableId: ref("Routes"),
        DestinationCidrBlock: "0.0.0.0/0",
        GatewayId: ref("Gateway"),
      }),
      DependsOn: "GatewayAttachment",
    },
    ApiSecurity: resource("AWS::EC2::SecurityGroup", {
      GroupDescription: "API accepts only the load balancer",
      VpcId: ref("Vpc"),
      SecurityGroupIngress: [],
      SecurityGroupEgress: [443, 5432].map((p) => ({
        IpProtocol: "tcp",
        FromPort: p,
        ToPort: p,
        CidrIp: "0.0.0.0/0",
      })),
      Tags: tags,
    }),
    WorkerSecurity: resource("AWS::EC2::SecurityGroup", {
      GroupDescription: "Worker has no inbound access",
      VpcId: ref("Vpc"),
      SecurityGroupIngress: [],
      SecurityGroupEgress: [443, 5432].map((p) => ({
        IpProtocol: "tcp",
        FromPort: p,
        ToPort: p,
        CidrIp: "0.0.0.0/0",
      })),
      Tags: tags,
    }),
    EdgeSecurity: resource("AWS::EC2::SecurityGroup", {
      GroupDescription: "Public TLS entry",
      VpcId: ref("Vpc"),
      SecurityGroupIngress: [80, 443].map((p) => ({
        IpProtocol: "tcp",
        FromPort: p,
        ToPort: p,
        CidrIp: "0.0.0.0/0",
      })),
      SecurityGroupEgress: [
        {
          IpProtocol: "tcp",
          FromPort: 3001,
          ToPort: 3001,
          DestinationSecurityGroupId: ref("ApiSecurity"),
        },
      ],
      Tags: tags,
    }),
    ApiIngress: resource("AWS::EC2::SecurityGroupIngress", {
      GroupId: ref("ApiSecurity"),
      IpProtocol: "tcp",
      FromPort: 3001,
      ToPort: 3001,
      SourceSecurityGroupId: ref("EdgeSecurity"),
    }),
    LoadBalancer: resource("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      Name: `${scope}-alb`,
      Type: "application",
      Scheme: "internet-facing",
      IpAddressType: "ipv4",
      Subnets: [ref("SubnetA"), ref("SubnetB")],
      SecurityGroups: [ref("EdgeSecurity")],
      Tags: tags,
      LoadBalancerAttributes: [
        { Key: "access_logs.s3.enabled", Value: "false" },
        { Key: "routing.http.xff_header_processing.mode", Value: "append" },
        { Key: "routing.http.xff_client_port.enabled", Value: "false" },
        {
          Key: "routing.http.drop_invalid_header_fields.enabled",
          Value: "true",
        },
        { Key: "routing.http.desync_mitigation_mode", Value: "strictest" },
      ],
    }),
    Targets: resource("AWS::ElasticLoadBalancingV2::TargetGroup", {
      Name: `${scope}-api`,
      VpcId: ref("Vpc"),
      Port: 3001,
      Protocol: "HTTP",
      TargetType: "ip",
      HealthCheckPath: "/health/ready",
      HealthCheckIntervalSeconds: 15,
      HealthCheckTimeoutSeconds: 8,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      Matcher: { HttpCode: "200" },
      TargetGroupAttributes: [
        { Key: "deregistration_delay.timeout_seconds", Value: "30" },
      ],
      Tags: tags,
    }),
    HttpListener: resource("AWS::ElasticLoadBalancingV2::Listener", {
      LoadBalancerArn: ref("LoadBalancer"),
      Port: 80,
      Protocol: "HTTP",
      DefaultActions: [
        {
          Type: "redirect",
          RedirectConfig: {
            Protocol: "HTTPS",
            Port: "443",
            Host: "api-dev.abasong.com",
            Path: "/#{path}",
            Query: "#{query}",
            StatusCode: "HTTP_301",
          },
        },
      ],
    }),
    HttpsListener: resource("AWS::ElasticLoadBalancingV2::Listener", {
      LoadBalancerArn: ref("LoadBalancer"),
      Port: 443,
      Protocol: "HTTPS",
      SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
      Certificates: [{ CertificateArn: ref("CertificateArn") }],
      DefaultActions: [
        {
          Type: "fixed-response",
          FixedResponseConfig: {
            StatusCode: "404",
            ContentType: "text/plain",
            MessageBody: "Not found",
          },
        },
      ],
    }),
    ApiHostRule: resource("AWS::ElasticLoadBalancingV2::ListenerRule", {
      ListenerArn: ref("HttpsListener"),
      Priority: 1,
      Conditions: [
        {
          Field: "host-header",
          HostHeaderConfig: { Values: ["api-dev.abasong.com"] },
        },
      ],
      Actions: [{ Type: "forward", TargetGroupArn: ref("Targets") }],
    }),
    Cluster: resource("AWS::ECS::Cluster", {
      ClusterName: scope,
      ClusterSettings: [{ Name: "containerInsights", Value: "disabled" }],
      Tags: tags,
    }),
  };
  for (const [i, suffix] of ["A", "B"].entries()) {
    resources[`Subnet${suffix}`] = resource("AWS::EC2::Subnet", {
      VpcId: ref("Vpc"),
      AvailabilityZone: { "Fn::Select": [i, { "Fn::GetAZs": "" }] },
      CidrBlock: `10.42.${i}.0/24`,
      MapPublicIpOnLaunch: false,
      Tags: tags,
    });
    resources[`Subnet${suffix}Routes`] = resource(
      "AWS::EC2::SubnetRouteTableAssociation",
      { RouteTableId: ref("Routes"), SubnetId: ref(`Subnet${suffix}`) },
    );
  }
  for (const kind of ["api", "worker"] as const) {
    const upper = kind === "api" ? "Api" : "Worker";
    const environment: Record<string, unknown> = {
      ABASONG_ENV: "pilot-dev",
      NODE_ENV: "production",
      AWS_REGION: "us-west-1",
      PILOT_DATABASE_HOST: ref("DatabaseHost"),
      TMPDIR: "/app-tmp",
    };
    const secrets: Record<string, string> =
      kind === "api"
        ? {
            DATABASE_URL: "ApiDatabaseArn",
            DATABASE_SENSITIVE_URL: "SensitiveDatabaseArn",
            DATA_HMAC_KEY: "DataHmacArn",
            IDEMPOTENCY_HMAC_KEY: "DataHmacArn",
            MAPBOX_SEARCH_TOKEN: "MapboxSearchArn",
          }
        : { WORKER_DATABASE_URL: "WorkerDatabaseArn" };
    Object.assign(
      environment,
      kind === "api"
        ? {
            PUBLIC_API_ORIGIN: "https://api-dev.abasong.com",
            API_HOST: "0.0.0.0",
            API_PORT: "3001",
            AUTH_ISSUER: "https://mxlmemaunzoramgemiju.supabase.co/auth/v1",
            AUTH_AUDIENCE: "authenticated",
            AUTH_JWT_ALGORITHM: "ES256",
            DATA_ENCRYPTION_PROVIDER: "aws-kms",
            DATA_HMAC_KEY_VERSION: "pilot-v1",
            KMS_KEY_ARN: ref("BusinessKeyArn"),
            IDEMPOTENCY_RETENTION_SECONDS: "86400",
            MAPBOX_PERMANENT_GEOCODING_ENABLED: "false",
          }
        : {
            WORKER_POLL_MS: "30000",
            WORKER_HEARTBEAT_PATH: "/app-tmp/worker-health.json",
          },
    );
    resources[`${upper}Task`] = resource("AWS::ECS::TaskDefinition", {
      Family: `${scope}-${kind}`,
      Cpu: "256",
      Memory: "512",
      NetworkMode: "awsvpc",
      RequiresCompatibilities: ["FARGATE"],
      RuntimePlatform: {
        CpuArchitecture: "X86_64",
        OperatingSystemFamily: "LINUX",
      },
      ExecutionRoleArn: ref(`${upper}ExecutionRoleArn`),
      TaskRoleArn: ref(`${upper}TaskRoleArn`),
      Tags: tags,
      Volumes: [{ Name: "scratch" }],
      ContainerDefinitions: [
        {
          Name: kind,
          Essential: true,
          Image: sub(
            `\${AWS::AccountId}.dkr.ecr.us-west-1.\${AWS::URLSuffix}/${scope}-${kind}@sha256:\${${upper}ImageDigest}`,
          ),
          User: "1000:1000",
          ReadonlyRootFilesystem: true,
          LinuxParameters: { Capabilities: { Drop: ["ALL"] } },
          StopTimeout: 30,
          MountPoints: [
            {
              SourceVolume: "scratch",
              ContainerPath: "/app-tmp",
              ReadOnly: false,
            },
          ],
          Environment: Object.entries(environment).map(([Name, Value]) => ({
            Name,
            Value,
          })),
          Secrets: Object.entries(secrets).map(([Name, value]) => ({
            Name,
            ValueFrom: ref(value),
          })),
          ...(kind === "api"
            ? { PortMappings: [{ ContainerPort: 3001, Protocol: "tcp" }] }
            : {}),
          LogConfiguration: {
            LogDriver: "awslogs",
            Options: {
              "awslogs-group": `/abasong/pilot-dev/${kind}`,
              "awslogs-region": "us-west-1",
              "awslogs-stream-prefix": kind,
              mode: "non-blocking",
              "max-buffer-size": "1m",
            },
          },
          HealthCheck: {
            Command: [
              "CMD",
              "node",
              ...(kind === "api"
                ? [
                    "-e",
                    "fetch('http://127.0.0.1:3001/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
                  ]
                : ["dist/health.js"]),
            ],
            Interval: 30,
            Timeout: 5,
            Retries: 3,
            StartPeriod: 60,
          },
        },
      ],
    });
    resources[`${upper}Service`] = {
      ...resource("AWS::ECS::Service", {
        ServiceName: `${scope}-${kind}`,
        Cluster: ref("Cluster"),
        TaskDefinition: ref(`${upper}Task`),
        LaunchType: "FARGATE",
        PlatformVersion: "1.4.0",
        DesiredCount: 1,
        EnableExecuteCommand: false,
        PropagateTags: "SERVICE",
        Tags: tags,
        DeploymentConfiguration: {
          MinimumHealthyPercent: 0,
          MaximumPercent: 100,
          DeploymentCircuitBreaker: { Enable: true, Rollback: true },
        },
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            AssignPublicIp: "ENABLED",
            SecurityGroups: [
              ref(kind === "api" ? "ApiSecurity" : "WorkerSecurity"),
            ],
            Subnets: [ref("SubnetA"), ref("SubnetB")],
          },
        },
        ...(kind === "api"
          ? {
              HealthCheckGracePeriodSeconds: 120,
              LoadBalancers: [
                {
                  TargetGroupArn: ref("Targets"),
                  ContainerName: "api",
                  ContainerPort: 3001,
                },
              ],
            }
          : {}),
      }),
      DependsOn: [
        "InternetRoute",
        "SubnetARoutes",
        "SubnetBRoutes",
        "ApiIngress",
        "ApiHostRule",
      ],
    };
    for (const metric of ["CPU", "Memory"])
      resources[`${upper}${metric}Alarm`] = resource("AWS::CloudWatch::Alarm", {
        AlarmName: `${scope}-${kind}-${metric.toLowerCase()}`,
        Namespace: "AWS/ECS",
        MetricName: `${metric}Utilization`,
        Dimensions: [
          { Name: "ClusterName", Value: scope },
          { Name: "ServiceName", Value: `${scope}-${kind}` },
        ],
        Statistic: "Average",
        Period: 60,
        EvaluationPeriods: 3,
        Threshold: 85,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "breaching",
        AlarmActions: [ref("AlertTopicArn")],
      });
  }
  for (const [name, metric, threshold, comparison, statistic] of [
    ["HealthyTargets", "HealthyHostCount", 1, "LessThanThreshold", "Minimum"],
    [
      "TargetErrors",
      "HTTPCode_Target_5XX_Count",
      5,
      "GreaterThanOrEqualToThreshold",
      "Sum",
    ],
  ] as const)
    resources[`${name}Alarm`] = resource("AWS::CloudWatch::Alarm", {
      AlarmName: `${scope}-${name.toLowerCase()}`,
      Namespace: "AWS/ApplicationELB",
      MetricName: metric,
      Dimensions: [
        {
          Name: "LoadBalancer",
          Value: get("LoadBalancer", "LoadBalancerFullName"),
        },
        { Name: "TargetGroup", Value: get("Targets", "TargetGroupFullName") },
      ],
      Statistic: statistic,
      Period: 60,
      EvaluationPeriods: 3,
      Threshold: threshold,
      ComparisonOperator: comparison,
      TreatMissingData:
        name === "HealthyTargets" ? "breaching" : "notBreaching",
      AlarmActions: [ref("AlertTopicArn")],
    });
  const runtime = template(
    "Review-only bounded pilot runtime; one API/worker with maintenance-window deployments",
    parameters,
    resources,
    {
      LoadBalancerDnsName: { Value: get("LoadBalancer", "DNSName") },
      ApiOrigin: { Value: "https://api-dev.abasong.com" },
      ClusterArn: { Value: get("Cluster", "Arn") },
    },
  );
  return { identities, notifications, certificate, runtime };
}
