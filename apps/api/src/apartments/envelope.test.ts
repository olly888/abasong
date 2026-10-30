import { afterEach, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import { LocalEnvelope } from "./envelope";
const previous = {
  mode: process.env.DATA_ENCRYPTION_PROVIDER,
  key: process.env.LOCAL_DATA_KEK,
  node: process.env.NODE_ENV,
};
afterEach(() => {
  for (const [key, value] of Object.entries({
    DATA_ENCRYPTION_PROVIDER: previous.mode,
    LOCAL_DATA_KEK: previous.key,
    NODE_ENV: previous.node,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function configured() {
  process.env.NODE_ENV = "test";
  process.env.DATA_ENCRYPTION_PROVIDER = "local-development";
  process.env.LOCAL_DATA_KEK = randomBytes(32).toString("hex");
  return new LocalEnvelope();
}
test("envelope binds owner, object and version; cannot transplant ciphertext", () => {
  const crypto = configured(),
    value = { value: randomBytes(12).toString("hex") },
    aad = "private:owner:object:1",
    sealed = crypto.seal(value, aad);
  expect(crypto.open(sealed, aad)).toEqual(value);
  for (const wrong of [
    "private:other:object:1",
    "private:owner:other:1",
    "private:owner:object:2",
  ])
    expect(() => crypto.open(sealed, wrong)).toThrow();
});
test("tampered envelope and replaced wrapping key fail closed", () => {
  const crypto = configured(),
    sealed = crypto.seal({ value: randomBytes(12).toString("hex") }, "aad");
  sealed.body[1] = randomBytes(24).toString("base64");
  expect(() => crypto.open(sealed, "aad")).toThrow();
  const valid = crypto.seal({}, "aad");
  process.env.LOCAL_DATA_KEK = randomBytes(32).toString("hex");
  expect(() => crypto.open(valid, "aad")).toThrow();
});
test("missing provider/key and production cannot use local encryption", () => {
  const crypto = configured();
  delete process.env.LOCAL_DATA_KEK;
  expect(() => crypto.seal({}, "aad")).toThrow();
  configured();
  process.env.NODE_ENV = "production";
  expect(() => crypto.seal({}, "aad")).toThrow();
});
