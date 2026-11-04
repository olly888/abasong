import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assertFoundationTemplate } from "./foundation-template";

function template() {
  return JSON.parse(readFileSync("deploy/pilot-dev/foundation.json", "utf8"));
}

it("accepts the checked-in approved inventory and CloudFormation tag contract", () => {
  expect(() => assertFoundationTemplate(template())).not.toThrow();
});

it("reproduces the real KMS API versus CloudFormation tag-shape failure", () => {
  const t = template();
  t.Resources.DataKey.Properties.Tags = [
    { TagKey: "Project", TagValue: "Abasong" },
    { TagKey: "Environment", TagValue: "pilot-dev" },
  ];
  expect(() => assertFoundationTemplate(t)).toThrow("Key/Value");
});

it("refuses extra resources, missing retention and another environment", () => {
  const extra = template();
  extra.Resources.Unapproved = { Type: "AWS::S3::Bucket" };
  expect(() => assertFoundationTemplate(extra)).toThrow("inventory");
  const destructive = template();
  delete destructive.Resources.DataKeyAlias.DeletionPolicy;
  expect(() => assertFoundationTemplate(destructive)).toThrow("retention");
  const wrongScope = template();
  wrongScope.Resources.ApiLogs.Properties.Tags[1].Value = "production";
  expect(() => assertFoundationTemplate(wrongScope)).toThrow("scope");
});
