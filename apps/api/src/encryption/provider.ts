import { LocalEnvelope } from "../apartments/envelope";
import { ApiError } from "../common/api-error";
import type { EnvelopeCrypto } from "./envelope";
import { KmsEnvelope } from "./kms-envelope";
export const ENVELOPE_CRYPTO = "ABASONG_ENVELOPE_CRYPTO";
export function createEnvelope(): EnvelopeCrypto {
  if (process.env.DATA_ENCRYPTION_PROVIDER === "aws-kms") {
    if (
      process.env.ABASONG_ENV !== "pilot-dev" ||
      !/^[0-9a-f]{64}$/i.test(process.env.DATA_HMAC_KEY ?? "")
    )
      throw new ApiError(503, "ENCRYPTION_UNAVAILABLE", "加密服务暂不可用");
    return new KmsEnvelope({
      keyArn: process.env.KMS_KEY_ARN ?? "",
      region: process.env.AWS_REGION as "us-west-1",
      environment: "pilot-dev",
      hmacKey: Buffer.from(process.env.DATA_HMAC_KEY!, "hex"),
      hmacVersion: process.env.DATA_HMAC_KEY_VERSION ?? "",
    });
  }
  // This adapter itself refuses missing providers, production and cloud envs.
  // A KMS exception is never caught here or retried with a local key.
  return new LocalEnvelope();
}
