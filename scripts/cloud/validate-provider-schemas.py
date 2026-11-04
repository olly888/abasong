"""Offline property validation against previously fetched AWS provider schemas.

Uses the existing contract-validation jsonschema tool; never calls AWS or writes
resources. Fetch the exact regional schemas with cloudformation describe-type.
Only the intrinsics currently used by this fixed foundation are supported.
"""
import argparse
import json
from pathlib import Path

from jsonschema import Draft7Validator


def require_local_refs(value):
    if isinstance(value, list):
        for item in value:
            require_local_refs(item)
    elif isinstance(value, dict):
        # The Logs provider uses this filename as a self-reference. Normalize
        # it in memory so the validator never resolves a file/network URI.
        if str(value.get("$ref", "")).startswith("resource-schema.json#/"):
            value["$ref"] = value["$ref"][len("resource-schema.json"):]
        if "$ref" in value and not str(value["$ref"]).startswith("#/"):
            raise ValueError("External schema references are not allowed")
        for item in value.values():
            require_local_refs(item)


def resolve(value):
    if isinstance(value, list):
        return [resolve(item) for item in value]
    if not isinstance(value, dict):
        return value
    if set(value) == {"Ref"}:
        if value["Ref"] != "DataKey":
            raise ValueError("Unsupported reference")
        return "00000000-0000-0000-0000-000000000000"
    if set(value) == {"Fn::Sub"}:
        text = value["Fn::Sub"]
        if not isinstance(text, str):
            raise ValueError("Unsupported substitution")
        text = text.replace("${AWS::Partition}", "aws").replace(
            "${AWS::AccountId}", "111122223333"
        )
        if "${" in text:
            raise ValueError("Unsupported substitution")
        return text
    if any(key.startswith("Fn::") for key in value):
        raise ValueError("Unsupported intrinsic")
    return {key: resolve(item) for key, item in value.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schema-dir", required=True, type=Path)
    args = parser.parse_args()
    template = json.loads(Path("deploy/pilot-dev/foundation.json").read_text())
    results = []
    for logical, resource in template["Resources"].items():
        resource_type = resource["Type"]
        if resource_type not in {
            "AWS::KMS::Key", "AWS::KMS::Alias",
            "AWS::ECR::Repository", "AWS::Logs::LogGroup",
        }:
            raise ValueError("Unapproved resource type")
        schema = json.loads(
            (args.schema_dir / (resource_type.replace("::", "-") + ".json")).read_text()
        )
        if schema.get("typeName") != resource_type:
            raise ValueError("Provider schema type mismatch")
        require_local_refs(schema)
        errors = list(Draft7Validator(schema).iter_errors(resolve(resource["Properties"])))
        results.append({
            "resource": logical,
            "errors": [{"path": list(e.absolute_path), "validator": e.validator} for e in errors],
        })
    print(json.dumps({"resource_property_validation": results}, indent=2))
    if any(result["errors"] for result in results):
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError):
        raise SystemExit("Provider schema validation refused; check schemas and intrinsics.")
