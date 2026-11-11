import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { circleStorage, type CircleVariant } from "@abasong/runtime";
import type { components } from "@abasong/contracts";
import type { PoolClient } from "pg";
import sharp from "sharp";
import { ApiError } from "../common/api-error";
import type { VerifiedIdentity } from "../common/request-context";
import { requestId } from "../requests/request-input";
import { RequestsService } from "../requests/requests.service";
import { postAuthor, visiblePost } from "./circle-visibility";

export const mediaBytesLimit = 5 * 1024 * 1024;
const invalidImage = () =>
  new ApiError(422, "INVALID_IMAGE", "无法读取这张图片，请重新选择");
const notReady = () =>
  new ApiError(409, "MEDIA_NOT_READY", "部分图片已失效，请重新上传");
const unavailable = () => new ApiError(404, "NOT_FOUND", "图片不可查看");

type MediaRow = {
  id: string;
  source_digest: Buffer;
  width: number | null;
  height: number | null;
  expires_at: Date;
  expired: boolean;
};
function uploadView(r: MediaRow & { width: number; height: number }) {
  return {
    id: r.id,
    width: r.width,
    height: r.height,
    expires_at: r.expires_at.toISOString(),
  } satisfies components["schemas"]["CircleMediaUpload"];
}
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function supportedImage(data: Buffer) {
  if (data.subarray(0, 8).equals(pngSignature)) {
    // libvips can decode the first frame of APNG without reporting pages.
    // Check PNG chunk boundaries and reject the animation control chunk.
    for (let offset = 8; offset + 12 <= data.length;) {
      if (data.toString("ascii", offset + 4, offset + 8) === "acTL")
        return false;
      offset += data.readUInt32BE(offset) + 12;
    }
    return true;
  }
  return (
    (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) ||
    (data.toString("ascii", 0, 4) === "RIFF" &&
      data.toString("ascii", 8, 12) === "WEBP") ||
    // The native picker converts HEIC when supported. Sharp verifies the
    // ISO image format and rejects formats the runtime cannot decode.
    (data.toString("ascii", 4, 8) === "ftyp" &&
      ["heic", "heix", "hevc", "mif1", "avif"].includes(
        data.toString("ascii", 8, 12),
      ))
  );
}

let activeDecodes = 0;
async function normalize(data: Buffer) {
  if (activeDecodes >= 3)
    throw new ApiError(503, "MEDIA_BUSY", "图片处理繁忙，请重试");
  activeDecodes++;
  try {
    const input = sharp(data, {
      limitInputPixels: 24_000_000,
      failOn: "warning",
    });
    const metadata = await input.metadata();
    if (
      !["jpeg", "png", "webp", "heif"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw invalidImage();
    const full = await input
      .autoOrient()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(full.data)
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 77 })
      .toBuffer();
    return { full, thumb };
  } catch {
    throw invalidImage();
  } finally {
    activeDecodes--;
  }
}

export async function attachCircleMedia(
  c: PoolClient,
  owner: string,
  post: string,
  ids: string[],
) {
  if (!ids.length) return;
  const locked = await c.query(
    `SELECT id FROM abasong.circle_media WHERE owner_id=$1 AND id=ANY($2::uuid[])
      AND post_id IS NULL AND width IS NOT NULL AND expires_at>now()
      ORDER BY id FOR UPDATE`,
    [owner, ids],
  );
  if (locked.rowCount !== ids.length) throw notReady();
  const written = await c.query(
    `UPDATE abasong.circle_media m SET post_id=$3, position=(chosen.ord-1)::smallint
      FROM unnest($2::uuid[]) WITH ORDINALITY chosen(id,ord)
      WHERE m.owner_id=$1 AND m.id=chosen.id AND m.post_id IS NULL AND m.expires_at>now()`,
    [owner, ids, post],
  );
  if (written.rowCount !== ids.length) throw notReady();
}

@Injectable()
export class CircleMediaService {
  private readonly storage = circleStorage("api");
  constructor(
    @Inject(RequestsService) private readonly requests: RequestsService,
  ) {}

  async upload(actor: VerifiedIdentity, uploadId: string, data: Buffer) {
    const storage = this.storage;
    if (!storage)
      throw new ApiError(503, "MEDIA_UNAVAILABLE", "图片服务暂不可用");
    const attempt = requestId(uploadId);
    if (!data.length || data.length > mediaBytesLimit) throw invalidImage();
    if (!supportedImage(data)) throw invalidImage();
    const digest = createHash("sha256").update(data).digest();
    const row = await this.requests.tx(actor, async (c) => {
      // Serialize creation of a user's pending uploads, including the quota.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `circle-media:${actor.userId}`,
      ]);
      const existing = (
        await c.query<MediaRow>(
          `SELECT id,source_digest,width,height,expires_at,expires_at<=now() AND post_id IS NULL AS expired
        FROM abasong.circle_media WHERE owner_id=$1 AND upload_id=$2`,
          [actor.userId, attempt],
        )
      ).rows[0];
      if (existing) return existing;
      const quota = await c.query(
        "SELECT 1 FROM abasong.circle_media WHERE owner_id=$1 AND post_id IS NULL AND expires_at>now() OFFSET 29 LIMIT 1",
        [actor.userId],
      );
      if (quota.rowCount)
        throw new ApiError(429, "MEDIA_QUOTA", "待发布图片过多，请稍后重试");
      return (
        await c.query<MediaRow>(
          `INSERT INTO abasong.circle_media(owner_id,upload_id,source_digest) VALUES($1,$2,$3)
        RETURNING id,source_digest,width,height,expires_at,false AS expired`,
          [actor.userId, attempt, digest],
        )
      ).rows[0]!;
    });
    const validate = (r: MediaRow) => {
      if (!r.source_digest.equals(digest))
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "上传编号已用于其他图片",
        );
      if (r.expired)
        throw new ApiError(410, "MEDIA_EXPIRED", "图片已过期，请重新上传");
      return r.width && r.height
        ? uploadView({ ...r, width: r.width, height: r.height })
        : null;
    };
    const replay = validate(row);
    if (replay) return replay;
    const { full, thumb } = await normalize(data);
    return this.requests.tx(actor, async (c) => {
      const locked = (
        await c.query<MediaRow>(
          `SELECT id,source_digest,width,height,expires_at,expires_at<=now() AND post_id IS NULL AS expired
        FROM abasong.circle_media WHERE owner_id=$1 AND id=$2 FOR UPDATE`,
          [actor.userId, row.id],
        )
      ).rows[0];
      if (!locked)
        throw new ApiError(410, "MEDIA_EXPIRED", "图片已过期，请重新上传");
      const previous = validate(locked);
      if (previous) return previous;
      try {
        // Await both outcomes before releasing the lock, including partial failures.
        const writes = await Promise.allSettled([
          storage.put(locked.id, "full", full.data),
          storage.put(locked.id, "thumb", thumb),
        ]);
        if (writes.some((result) => result.status === "rejected"))
          throw new Error();
      } catch {
        throw new ApiError(
          503,
          "MEDIA_UNAVAILABLE",
          "图片未上传成功，请重试或移除",
        );
      }
      await c.query(
        "UPDATE abasong.circle_media SET width=$2,height=$3 WHERE id=$1",
        [locked.id, full.info.width, full.info.height],
      );
      return uploadView({
        ...locked,
        width: full.info.width,
        height: full.info.height,
      });
    });
  }

  async read(
    actor: VerifiedIdentity,
    postId: string,
    mediaId: string,
    variant: CircleVariant,
  ) {
    const values = [actor.userId, requestId(postId), requestId(mediaId)];
    const sql = `SELECT 1 FROM abasong.circle_media m JOIN abasong.posts p ON p.id=m.post_id
      ${postAuthor} WHERE p.id=$2 AND m.id=$3 AND ${visiblePost}`;
    return this.requests.tx(actor, async (c) => {
      if (!(await c.query(sql, values)).rowCount) throw unavailable();
      let image: Uint8Array;
      try {
        if (!this.storage) throw new Error();
        image = await this.storage.read(values[2]!, variant);
      } catch {
        throw new ApiError(503, "MEDIA_UNAVAILABLE", "图片暂时无法加载");
      }
      if (!(await c.query(sql, values)).rowCount) throw unavailable();
      return image;
    });
  }
}
