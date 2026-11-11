import { afterEach, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import {
  KmsEnvelope,
  type DataKeyGateway,
  type KmsConfig,
} from "./kms-envelope";
import { createEnvelope } from "./provider";
import { LocalEnvelope } from "../apartments/envelope";

const keyArn =
  "arn:aws:kms:us-west-1:000000000000:key/11111111-1111-4111-8111-111111111111";
function config(): KmsConfig {
  return {
    keyArn,
    region: "us-west-1",
    environment: "pilot-dev",
    hmacKey: randomBytes(32),
    hmacVersion: "pilot-v1",
  };
}
class FakeGateway implements DataKeyGateway {
  fail = false;
  issued: Uint8Array[] = [];
  keys = new Map<string, { key: Buffer; context: string }>();
  async generate(keyArn: string, context: Record<string, string>) {
    if (this.fail) throw new Error("provider detail must not leak");
    const key = randomBytes(32),
      wrapped = randomBytes(32),
      plaintext = Buffer.from(key);
    this.keys.set(wrapped.toString("hex"), {
      key,
      context: JSON.stringify(context),
    });
    this.issued.push(plaintext);
    return { plaintext, wrapped, keyId: keyArn };
  }
  async decrypt(
    keyArn: string,
    wrapped: Uint8Array,
    context: Record<string, string>,
  ) {
    if (this.fail) throw new Error("provider detail must not leak");
    const stored = this.keys.get(Buffer.from(wrapped).toString("hex"));
    if (!stored || stored.context !== JSON.stringify(context))
      throw new Error("context");
    const plaintext = Buffer.from(stored.key);
    this.issued.push(plaintext);
    return { plaintext, keyId: keyArn };
  }
}
test("KMS round-trips all sensitive payload kinds and wipes each plaintext data key", async () => {
  const g = new FakeGateway(),
    c = new KmsEnvelope(config(), g);
  for (const aad of [
    "shared:TEST-record:1",
    "private:TEST-owner:TEST-record:1",
    "entry:TEST-owner:TEST-entry:1",
    "import:TEST-owner:TEST-batch:2",
  ]) {
    const payload = { value: "0017#", scope_label: "TEST", note: "" },
      sealed = await c.seal(payload, aad);
    expect(JSON.stringify(sealed)).not.toContain("0017#");
    expect(sealed.keyId).toBe(keyArn);
    expect(await c.open(sealed, aad)).toEqual(payload);
    expect(g.issued.every((v) => v.every((x) => x === 0))).toBe(true);
    for (const wrong of [aad + ":wrong", aad.replace("TEST", "OTHER")])
      await expect(c.open(sealed, wrong)).rejects.toMatchObject({
        status: 503,
        code: "ENCRYPTION_UNAVAILABLE",
      });
  }
});
test("KMS failures, tampering and foreign key/version fail closed with no local fallback", async () => {
  const g = new FakeGateway(),
    c = new KmsEnvelope(config(), g),
    sealed = await c.seal({ value: "TEST#" }, "aad");
  g.fail = true;
  await expect(c.open(sealed, "aad")).rejects.toMatchObject({
    status: 503,
    message: "加密服务暂不可用",
  });
  await expect(c.seal({}, "aad")).rejects.toMatchObject({ status: 503 });
  g.fail = false;
  for (const bad of [
    { ...sealed, keyId: keyArn.replace("000000000000", "999999999999") },
    { ...sealed, format: "local-envelope-v1" },
    {
      ...sealed,
      body: [...sealed.body.slice(0, 2), randomBytes(16).toString("base64")],
    },
  ])
    await expect(c.open(bad, "aad")).rejects.toMatchObject({ status: 503 });
  expect(g.issued.every((v) => v.every((x) => x === 0))).toBe(true);
});
test("KMS rejects invalid plaintext-key output and clears it on failure", async () => {
  const key = randomBytes(16),
    g: DataKeyGateway = {
      generate: async () => ({
        plaintext: key,
        wrapped: randomBytes(30),
        keyId: keyArn,
      }),
      decrypt: async () => ({ plaintext: key, keyId: keyArn }),
    };
  await expect(
    new KmsEnvelope(config(), g).seal({}, "aad"),
  ).rejects.toMatchObject({ status: 503 });
  expect(key.every((x) => x === 0)).toBe(true);
});
test("dedup keys are stable per environment/version/label and require valid cloud configuration", () => {
  const cfg = config(),
    a = new KmsEnvelope(cfg, new FakeGateway()),
    b = new KmsEnvelope(cfg, new FakeGateway());
  expect(a.hmacKey("shared-dedup")).toEqual(b.hmacKey("shared-dedup"));
  expect(a.hmacKey("request")).not.toEqual(a.hmacKey("shared-dedup"));
  expect(
    () =>
      new KmsEnvelope({ ...cfg, hmacVersion: "local-v1" }, new FakeGateway()),
  ).toThrow();
  expect(
    () =>
      new KmsEnvelope(
        { ...cfg, region: "us-east-1" as "us-west-1" },
        new FakeGateway(),
      ),
  ).toThrow();
});
const before = { ...process.env };
afterEach(() => {
  for (const key of [
    "NODE_ENV",
    "ABASONG_ENV",
    "DATA_ENCRYPTION_PROVIDER",
    "LOCAL_DATA_KEK",
    "AWS_REGION",
    "KMS_KEY_ARN",
    "DATA_HMAC_KEY",
    "DATA_HMAC_KEY_VERSION",
  ]) {
    if (before[key] === undefined) delete process.env[key];
    else process.env[key] = before[key];
  }
});
test("changing NODE_ENV cannot enable a local key in the pilot cloud environment", () => {
  process.env.NODE_ENV = "development";
  process.env.ABASONG_ENV = "pilot-dev";
  process.env.DATA_ENCRYPTION_PROVIDER = "local-development";
  process.env.LOCAL_DATA_KEK = randomBytes(32).toString("hex");
  expect(() => new LocalEnvelope().seal({}, "aad")).toThrow();
  process.env.DATA_ENCRYPTION_PROVIDER = "aws-kms";
  delete process.env.DATA_HMAC_KEY;
  expect(() => createEnvelope()).toThrow();
});
