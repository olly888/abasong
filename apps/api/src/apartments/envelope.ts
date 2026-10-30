import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { ApiError } from "../common/api-error";
// Deliberately local only. A production KMS adapter must be implemented before enabling this in production.
export class LocalEnvelope {
  private key() {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.DATA_ENCRYPTION_PROVIDER !== "local-development" ||
      !/^[a-f0-9]{64}$/i.test(process.env.LOCAL_DATA_KEK ?? "")
    )
      throw new ApiError(503, "ENCRYPTION_UNAVAILABLE", "加密服务暂不可用");
    return Buffer.from(process.env.LOCAL_DATA_KEK!, "hex");
  }
  hmacKey(label: string) {
    return Buffer.from(
      hkdfSync("sha256", this.key(), "abasong-local-v1", label, 32),
    );
  }
  seal(value: unknown, aad: string) {
    const dek = randomBytes(32),
      body = this.encrypt(Buffer.from(JSON.stringify(value)), dek, aad);
    return {
      format: "local-envelope-v1",
      body,
      wrapped: this.encrypt(dek, this.key(), `${aad}:dek`),
    };
  }
  open<T>(envelope: unknown, aad: string): T {
    try {
      const data = envelope as {
        format: string;
        body: string[];
        wrapped: string[];
      };
      if (data.format !== "local-envelope-v1") throw new Error("format");
      const dek = this.decrypt(data.wrapped, this.key(), `${aad}:dek`);
      return JSON.parse(this.decrypt(data.body, dek, aad).toString()) as T;
    } catch {
      throw new ApiError(503, "ENCRYPTION_UNAVAILABLE", "加密服务暂不可用");
    }
  }
  private encrypt(value: Buffer, key: Buffer, aad: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(aad));
    return [
      nonce.toString("base64"),
      Buffer.concat([cipher.update(value), cipher.final()]).toString("base64"),
      cipher.getAuthTag().toString("base64"),
    ];
  }
  private decrypt(parts: string[], key: Buffer, aad: string) {
    if (parts.length !== 3 || parts.some((x) => typeof x !== "string"))
      throw new Error("format");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(parts[0]!, "base64"),
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(parts[2]!, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[1]!, "base64")),
      decipher.final(),
    ]);
  }
}
