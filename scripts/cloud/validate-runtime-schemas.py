"""Offline AWS provider-property validation for the four prepared templates.

Schemas must be fetched separately with read-only cloudformation describe-type.
Intrinsics use synthetic typed references, not live account/credential values.
This checks provider properties, not a change set, IAM authorization or deployability.
"""
import argparse
import json
import importlib.util
import hashlib
import re
from pathlib import Path
from jsonschema import Draft7Validator
_spec = importlib.util.spec_from_file_location("foundation_schema", Path(__file__).with_name("validate-provider-schemas.py"))
_foundation = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_foundation)
require_local_refs = _foundation.require_local_refs


ACCOUNT = "111122223333"
UUID = "11111111-1111-4111-8111-111111111111"
BASE = f"arn:aws:"


def bindings():
    result = {
        "AWS::AccountId": ACCOUNT, "AWS::Partition": "aws",
        "AWS::Region": "us-west-1", "AWS::URLSuffix": "amazonaws.com",
        "BusinessKeyArn": f"{BASE}kms:us-west-1:{ACCOUNT}:key/{UUID}",
        "CertificateArn": f"{BASE}acm:us-west-1:{ACCOUNT}:certificate/{UUID}",
        "DatabaseHost": "db.mxlmemaunzoramgemiju.supabase.co",
        "ApiImageDigest": "a" * 64, "WorkerImageDigest": "b" * 64,
        "AlertTopicArn": f"{BASE}sns:us-west-1:{ACCOUNT}:abasong-pilot-dev-alerts",
        "OwnerEmail": "test@example.com",
    }
    for name, suffix in {"ApiExecutionRole": "api-execution", "WorkerExecutionRole": "worker-execution", "ApiTaskRole": "api-task", "WorkerTaskRole": "worker-task"}.items():
        result[name + "Arn"] = f"{BASE}iam::{ACCOUNT}:role/abasong-pilot-dev-{suffix}"
    for name, suffix in {"ApiDatabase": "api-db", "SensitiveDatabase": "sensitive-db", "WorkerDatabase": "worker-db", "DataHmac": "data-hmac", "MapboxSearch": "mapbox-search"}.items():
        result[name + "Arn"] = f"{BASE}secretsmanager:us-west-1:{ACCOUNT}:secret:abasong/pilot-dev/{suffix}-ABC123"
    return result


def resolver(template):
    values = bindings()
    resources = template["Resources"]

    def resource_value(name, attribute=None):
        resource = resources[name]
        kind = resource["Type"].split("::")[-1]
        props = resource["Properties"]
        if kind in ("VPC", "InternetGateway", "RouteTable", "Subnet", "SecurityGroup"):
            prefix = {"VPC": "vpc", "InternetGateway": "igw", "RouteTable": "rtb", "Subnet": "subnet", "SecurityGroup": "sg"}[kind]
            return f"{prefix}-{hashlib.sha256(name.encode()).hexdigest()[:17]}"
        if kind == "Role":
            role = props["RoleName"]
            return f"{BASE}iam::{ACCOUNT}:role/{role}" if attribute == "Arn" else role
        if kind == "Secret":
            return f"{BASE}secretsmanager:us-west-1:{ACCOUNT}:secret:{props['Name']}-ABC123"
        if kind == "Certificate":
            return values["CertificateArn"]
        if kind == "Topic":
            return values["AlertTopicArn"]
        if kind == "Cluster":
            return f"{BASE}ecs:us-west-1:{ACCOUNT}:cluster/{props['ClusterName']}" if attribute == "Arn" else props["ClusterName"]
        if kind == "TaskDefinition":
            return f"{BASE}ecs:us-west-1:{ACCOUNT}:task-definition/{props['Family']}:1"
        if kind in ("LoadBalancer", "TargetGroup", "Listener", "ListenerRule"):
            if attribute == "DNSName":
                return "test.us-west-1.elb.amazonaws.com"
            suffix = "app/abasong-pilot-dev-alb/0123456789abcdef" if kind == "LoadBalancer" else "targetgroup/abasong-pilot-dev-api/0123456789abcdef"
            if kind == "Listener": suffix = "listener/app/abasong-pilot-dev-alb/0123456789abcdef/0123456789abcdef"
            if kind == "ListenerRule": suffix = "listener-rule/app/abasong-pilot-dev-alb/0123456789abcdef/0123456789abcdef/0123456789abcdef"
            if attribute in ("LoadBalancerFullName", "TargetGroupFullName"): return suffix
            return f"{BASE}elasticloadbalancing:us-west-1:{ACCOUNT}:{'loadbalancer/' if kind == 'LoadBalancer' else ''}{suffix}"
        raise ValueError("Unsupported synthetic resource reference")

    def resolve(value):
        if isinstance(value, list): return [resolve(item) for item in value]
        if not isinstance(value, dict): return value
        if set(value) == {"Ref"}:
            name = value["Ref"]
            return values[name] if name in values else resource_value(name)
        if set(value) == {"Fn::GetAtt"}:
            name, attribute = value["Fn::GetAtt"]
            return resource_value(name, attribute)
        if set(value) == {"Fn::GetAZs"}: return ["us-west-1a", "us-west-1b"]
        if set(value) == {"Fn::Select"}:
            index, sequence = value["Fn::Select"]
            return resolve(sequence)[index]
        if set(value) == {"Fn::Sub"}:
            def replace(match):
                name = match.group(1)
                if name in values: return values[name]
                if "." in name: return resource_value(*name.split(".", 1))
                return resource_value(name)
            return re.sub(r"\$\{([^}]+)\}", replace, value["Fn::Sub"])
        if any(key.startswith("Fn::") for key in value): raise ValueError("Unsupported intrinsic")
        return {key: resolve(item) for key, item in value.items()}
    return resolve


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schema-dir", required=True, type=Path)
    args = parser.parse_args()
    results = []
    for name in ("identities", "notifications", "certificate", "runtime"):
        template = json.loads(Path(f"deploy/pilot-dev/{name}.json").read_text())
        resolve = resolver(template)
        for logical, resource in template["Resources"].items():
            kind = resource["Type"]
            schema = json.loads((args.schema_dir / (kind.replace("::", "-") + ".json")).read_text())
            if schema.get("typeName") != kind: raise ValueError("Schema type mismatch")
            require_local_refs(schema)
            errors = list(Draft7Validator(schema).iter_errors(resolve(resource["Properties"])))
            results.append({"template": name, "resource": logical, "errors": [{"path": list(e.absolute_path), "validator": e.validator} for e in errors]})
    print(json.dumps({"provider_property_validation": results}, indent=2))
    if any(result["errors"] for result in results): raise SystemExit(1)


if __name__ == "__main__":
    try: main()
    except (ValueError, KeyError, OSError, IndexError):
        raise SystemExit("Runtime provider schema validation refused; inspect local schemas and intrinsics.")
