import { describe, expect, it } from "vitest";
import { assertFoundationIdentity } from "./foundation-target";

const account = "123456789012";
const identity = {
  Account: account,
  Arn: `arn:aws:sts::${account}:assumed-role/abasong-pilot-dev-deployer/abasong-pilot-dev`,
};

describe("foundation provisioning target", () => {
  it("accepts only the reviewed role in the explicit target account and region", () => {
    expect(() =>
      assertFoundationIdentity(identity, account, "us-west-1"),
    ).not.toThrow();
    for (const [expected, region] of [
      ["123456789013", "us-west-1"],
      [account, "us-west-2"],
      ["", "us-west-1"],
    ])
      expect(() =>
        assertFoundationIdentity(identity, expected!, region!),
      ).toThrow();
  });

  it("rejects root, plain users, other roles and ARN/account disagreement", () => {
    for (const Arn of [
      `arn:aws:iam::${account}:root`,
      `arn:aws:iam::${account}:user/abasong-pilot-operator`,
      `arn:aws:sts::${account}:assumed-role/Administrator/session`,
      "arn:aws:sts::123456789013:assumed-role/abasong-pilot-dev-deployer/session",
      `${identity.Arn}/unexpected`,
    ])
      expect(() =>
        assertFoundationIdentity({ ...identity, Arn }, account, "us-west-1"),
      ).toThrow();
  });
});
