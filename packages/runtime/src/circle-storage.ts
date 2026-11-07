import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CircleVariant = "thumb" | "full";
export type CircleStorage = {
  put(id: string, variant: CircleVariant, data: Uint8Array): Promise<void>;
  read(id: string, variant: CircleVariant): Promise<Uint8Array>;
  remove(id: string): Promise<void>;
};

function objectName(id: string, variant: CircleVariant) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid media ID");
  return `${id.toLowerCase()}-${variant}.jpg`;
}

export function circleStorage(
  service: "api" | "worker",
  env = process.env,
): CircleStorage | null {
  if (env.ABASONG_ENV === "pilot-dev") {
    const bucket = env.CIRCLE_MEDIA_BUCKET;
    if (!bucket) return null;
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
      throw new Error("Invalid private media bucket");
    const s3 = new S3Client({
      region: "us-west-1",
      maxAttempts: 1,
      // Use the runtime task role and the AWS regional service endpoint.
      endpoint: "https://s3.us-west-1.amazonaws.com",
    });
    const key = (id: string, variant: CircleVariant) =>
      `circle-posts/${objectName(id, variant)}`;
    return {
      async put(id, variant, data) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key(id, variant),
            Body: data,
            ContentType: "image/jpeg",
            CacheControl: "private, no-store",
            ServerSideEncryption: "AES256",
          }),
          { abortSignal: AbortSignal.timeout(5000) },
        );
      },
      async read(id, variant) {
        const result = await s3.send(
          new GetObjectCommand({ Bucket: bucket, Key: key(id, variant) }),
          { abortSignal: AbortSignal.timeout(5000) },
        );
        if (
          !result.Body ||
          result.ContentType !== "image/jpeg" ||
          !result.ContentLength ||
          result.ContentLength > 5 * 1024 * 1024
        )
          throw new Error("Private image invalid");
        return result.Body.transformToByteArray();
      },
      async remove(id) {
        const result = await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: (["thumb", "full"] as const).map((v) => ({
                Key: key(id, v),
              })),
            },
          }),
          { abortSignal: AbortSignal.timeout(5000) },
        );
        if (result.Errors?.length)
          throw new Error("Private image cleanup failed");
      },
    };
  }
  const url = new URL(
    env[service === "api" ? "DATABASE_URL" : "WORKER_DATABASE_URL"] ?? "",
  );
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
  const directory =
    env.CIRCLE_MEDIA_DIRECTORY ??
    join(tmpdir(), "abasong-circle-media", url.pathname.slice(1));
  const file = (id: string, variant: CircleVariant) =>
    join(directory, objectName(id, variant));
  return {
    async put(id, variant, data) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      const target = file(id, variant);
      await writeFile(target + ".pending", data, { mode: 0o600 });
      await rename(target + ".pending", target);
    },
    read: (id, variant) => readFile(file(id, variant)),
    async remove(id) {
      await Promise.all(
        (["thumb", "full"] as const).flatMap((variant) => {
          const target = file(id, variant);
          return [
            rm(target, { force: true }),
            rm(target + ".pending", { force: true }),
          ];
        }),
      );
    },
  };
}
