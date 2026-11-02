import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from "@aws-sdk/client-kms";
import { ApiError } from "../common/api-error";
import type { DataEnvelope, EnvelopeCrypto } from "./envelope";

export type KmsConfig = {
  keyArn: string;
  region: "us-west-1";
  environment: "pilot-dev";
  hmacKey: Buffer;
  hmacVersion: string;
};
type Context = Record<string, string>;
export interface DataKeyGateway {
  generate(
    keyArn: string,
    context: Context,
  ): Promise<{ plaintext: Uint8Array; wrapped: Uint8Array; keyId?: string }>;
  decrypt(
    keyArn: string,
    wrapped: Uint8Array,
    context: Context,
  ): Promise<{ plaintext?: Uint8Array; keyId?: string }>;
}
const unavailable = () =>
  new ApiError(503, "ENCRYPTION_UNAVAILABLE", "加密服务暂不可用");
export class AwsDataKeyGateway implements DataKeyGateway {
  private readonly client: KMSClient;
  constructor(region: string) {
    // ECS task role credentials; no keys or custom endpoint in application code.
    this.client = new KMSClient({ region, maxAttempts: 2 });
  }
  async generate(keyArn: string, context: Context) {
    const result = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: keyArn,
        KeySpec: "AES_256",
        EncryptionContext: context,
      }),
      { abortSignal: AbortSignal.timeout(3000) },
    );
    if (!result.Plaintext || !result.CiphertextBlob) {
      result.Plaintext?.fill(0);
      throw unavailable();
    }
    return {
      plaintext: result.Plaintext,
      wrapped: result.CiphertextBlob,
      keyId: result.KeyId,
    };
  }
  async decrypt(keyArn: string, wrapped: Uint8Array, context: Context) {
    const result = await this.client.send(
      new DecryptCommand({
        KeyId: keyArn,
        CiphertextBlob: wrapped,
        EncryptionContext: context,
        EncryptionAlgorithm: "SYMMETRIC_DEFAULT",
      }),
      { abortSignal: AbortSignal.timeout(3000) },
    );
    return { plaintext: result.Plaintext, keyId: result.KeyId };
  }
}
export class KmsEnvelope implements EnvelopeCrypto {
  readonly format = "aws-kms-envelope-v1";
  readonly keyId: string;
  readonly hmacVersion: string;
  private readonly secret: Buffer;
  constructor(
    private readonly config: KmsConfig,
    private readonly gateway: DataKeyGateway = new AwsDataKeyGateway(
      config.region,
    ),
  ) {
    if (
      config.region !== "us-west-1" ||
      config.environment !== "pilot-dev" ||
      !/^arn:aws:kms:us-west-1:\d{12}:key\/[0-9a-f-]{36}$/.test(
        config.keyArn,
      ) ||
      config.hmacKey.length !== 32 ||
      !/^pilot-v[1-9]\d*$/.test(config.hmacVersion)
    )
      throw unavailable();
    this.keyId = config.keyArn;
    this.hmacVersion = config.hmacVersion;
    this.secret = Buffer.from(config.hmacKey);
  }
  hmacKey(label: string) {
    return Buffer.from(
      hkdfSync(
        "sha256",
        this.secret,
        `abasong:${this.config.environment}:${this.hmacVersion}`,
        label,
        32,
      ),
    );
  }
  private context(aad: string): Context {
    // Encryption context is visible in CloudTrail: only app/env and an opaque digest.
    return {
      app: "abasong",
      environment: this.config.environment,
      aad_sha256: createHash("sha256").update(aad).digest("hex"),
    };
  }
  private aad(aad: string) {
    return Buffer.from(`${this.format}:${this.config.environment}:${aad}`);
  }
  async seal(value: unknown, aad: string): Promise<DataEnvelope> {
    let plaintext: Uint8Array | undefined;
    try {
      const result = await this.gateway.generate(this.keyId, this.context(aad));
      plaintext = result.plaintext;
      if (
        result.keyId !== this.keyId ||
        plaintext.length !== 32 ||
        !result.wrapped.length ||
        result.wrapped.length > 6144
      )
        throw unavailable();
      const nonce = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", plaintext, nonce);
      cipher.setAAD(this.aad(aad));
      const body = Buffer.concat([
        cipher.update(Buffer.from(JSON.stringify(value))),
        cipher.final(),
      ]);
      return {
        format: this.format,
        keyId: this.keyId,
        body: [
          nonce.toString("base64"),
          body.toString("base64"),
          cipher.getAuthTag().toString("base64"),
        ],
        wrapped: [Buffer.from(result.wrapped).toString("base64")],
      };
    } catch {
      throw unavailable();
    } finally {
      plaintext?.fill(0);
    }
  }
  async open<T>(envelope: unknown, aad: string): Promise<T> {
    let plaintext: Uint8Array | undefined;
    try {
      const data = envelope as DataEnvelope;
      if (
        !data ||
        data.format !== this.format ||
        data.keyId !== this.keyId ||
        !Array.isArray(data.body) ||
        data.body.length !== 3 ||
        !Array.isArray(data.wrapped) ||
        data.wrapped.length !== 1 ||
        [...data.body, ...data.wrapped].some((v) => typeof v !== "string")
      )
        throw unavailable();
      const [nonce, body, tag] = data.body.map((v) => Buffer.from(v, "base64")),
        wrapped = Buffer.from(data.wrapped[0]!, "base64");
      if (
        nonce!.length !== 12 ||
        tag!.length !== 16 ||
        !wrapped.length ||
        wrapped.length > 6144
      )
        throw unavailable();
      const result = await this.gateway.decrypt(
        this.keyId,
        wrapped,
        this.context(aad),
      );
      plaintext = result.plaintext;
      if (result.keyId !== this.keyId || plaintext?.length !== 32)
        throw unavailable();
      const decipher = createDecipheriv("aes-256-gcm", plaintext, nonce!);
      decipher.setAAD(this.aad(aad));
      decipher.setAuthTag(tag!);
      return JSON.parse(
        Buffer.concat([decipher.update(body!), decipher.final()]).toString(),
      ) as T;
    } catch {
      throw unavailable();
    } finally {
      plaintext?.fill(0);
    }
  }
}
