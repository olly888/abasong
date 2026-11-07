import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Pool, type Client } from "pg";
import { circleStorage } from "../../packages/runtime/src/circle-storage";
import { purgeCircleMedia } from "../../apps/worker/src/circle-cleanup";
import type { components } from "../../packages/contracts/src/generated";

const sharp = createRequire(resolve("apps/api/package.json"))(
  "sharp",
) as typeof import("../../apps/api/node_modules/sharp").default;

export async function verifyCircleMedia({
  db,
  base,
  auth,
  other,
  owner,
  reader,
  directory,
  workerUrl,
}: {
  db: Client;
  base: string;
  auth: string;
  other: string;
  owner: string;
  reader: string;
  directory: string;
  workerUrl: string;
}) {
  type S = components["schemas"];
  let checks = 0;
  async function call(
    path: string,
    status: number,
    method = "GET",
    token = auth,
    body?: Uint8Array | Record<string, unknown>,
    key?: string,
  ) {
    const bytes = body instanceof Uint8Array;
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body
          ? {
              "Content-Type": bytes
                ? "application/octet-stream"
                : "application/json",
            }
          : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body
        ? { body: bytes ? Uint8Array.from(body).buffer : JSON.stringify(body) }
        : {}),
    });
    assert.equal(
      r.status,
      status,
      `circle media check ${checks + 1} ${method}`,
    );
    checks++;
    return r;
  }
  const fixture = (background: string) =>
    sharp({ create: { width: 2200, height: 1300, channels: 3, background } })
      .withExif({
        IFD0: { Artist: "TEST_METADATA_SENTINEL" },
        IFD3: {
          GPSLatitude: "34/1 0/1 0/1",
          GPSLatitudeRef: "N",
          GPSLongitude: "118/1 0/1 0/1",
          GPSLongitudeRef: "W",
        },
      })
      .jpeg()
      .toBuffer();
  const [first, second, third] = await Promise.all([
    fixture("#272c80"),
    fixture("#117765"),
    fixture("#e18636"),
  ]);
  assert.ok(
    (await sharp(first).metadata()).exif?.includes(
      Buffer.from("TEST_METADATA_SENTINEL"),
    ),
  );
  const put = async (
    data: Uint8Array,
    status = 200,
    token = auth,
    id = randomUUID(),
  ) =>
    (await (
      await call("/v1/me/circle-media/" + id, status, "PUT", token, data)
    ).json()) as S["CircleMediaUpload"];
  await put(first, 401, "");
  await put(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), 422);
  // Synthetic two-frame 12x12 APNG; libvips alone sees only one frame.
  await put(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAAMAAAADAAAAAAAAAAAAAEACgAAkVrS4wAAABdJREFUeJxj/M9AGDARoYZhVBEDnYMAAM/gARck8m3VAAAAGmZjVEwAAAABAAAADAAAAAwAAAAAAAAAAAABAAoAAAopODcAAAAcZmRBVAAAAAJ4nGNkaGAgCJgIK2EYVcRA7yAAAPOMAJjEfaJcAAAAAElFTkSuQmCC",
      "base64",
    ),
    422,
  );
  await put(first.subarray(0, 100), 422);
  await put(new Uint8Array(5 * 1024 * 1024 + 1), 413);
  const attempt = randomUUID();
  const [a, replay] = await Promise.all([
    put(first, 200, auth, attempt),
    put(first, 200, auth, attempt),
  ]);
  assert.deepEqual(a, replay);
  await put(second, 409, auth, attempt);
  const b = await put(second);
  const c = await put(third);
  const peer = await put(first, 200, other, attempt);
  assert.notEqual(peer.id, a.id);
  const newPost = async (
    media_ids: string[],
    status = 201,
    token = auth,
    key = randomUUID(),
  ) =>
    (await (
      await call(
        "/v1/posts",
        status,
        "POST",
        token,
        { body: "TEST private photo post", media_ids },
        key,
      )
    ).json()) as S["Post"];
  await newPost([a.id, a.id.toUpperCase()], 400);
  await newPost([a.id, b.id, c.id, peer.id], 400);
  await newPost([peer.id], 409);
  await newPost([a.id, randomUUID()], 409);
  await call(`/v1/posts/${randomUUID()}/media/${a.id}/thumb`, 404);
  const before = (
    await db.query(
      "SELECT count(*)::int n FROM abasong.posts WHERE body='TEST private photo post'",
    )
  ).rows[0].n;
  assert.equal(before, 0);
  const postKey = randomUUID();
  const [post, samePost] = await Promise.all([
    newPost([b.id, a.id, c.id], 201, auth, postKey),
    newPost([b.id, a.id, c.id], 201, auth, postKey),
  ]);
  assert.equal(post.id, samePost.id);
  assert.deepEqual(
    post.media.map((m) => m.id),
    [b.id, a.id, c.id],
  );
  assert.deepEqual(Object.keys(post.media[0]!).sort(), [
    "height",
    "id",
    "width",
  ]);
  await newPost([a.id], 409);
  const photo = `/v1/posts/${post.id}/media/${a.id}`;
  await call(photo + "/full", 401, "GET", "");
  const thumb = await call(photo + "/thumb", 200, "GET", other);
  const full = await call(photo + "/full", 200, "GET", other);
  for (const [r, width] of [
    [thumb, 640],
    [full, 2048],
  ] as const) {
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.equal(r.headers.get("content-type"), "image/jpeg");
    assert.equal(r.headers.get("etag"), null);
    const metadata = await sharp(Buffer.from(await r.arrayBuffer())).metadata();
    assert.equal(metadata.width, width);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
  }
  await call(photo + "/original", 404);
  await call(photo + "/thumb?cache=yes", 404);
  await call(`/v1/posts/${post.id}/media/${peer.id}/full`, 404);
  await call(
    `/v1/posts/${post.id}/comments`,
    400,
    "POST",
    other,
    { body: "TEST text", media_ids: [a.id] },
    randomUUID(),
  );
  await call("/v1/me/blocks/" + owner, 200, "PUT", other);
  await call(photo + "/thumb", 404, "GET", other);
  await call(photo + "/full", 404, "GET", other);
  await call("/v1/me/blocks/" + owner, 200, "DELETE", other);
  await call("/v1/me/blocks/" + reader, 200, "PUT");
  await call(photo + "/thumb", 404, "GET", other);
  await call(photo + "/full", 404, "GET", other);
  await call("/v1/me/blocks/" + reader, 200, "DELETE");
  const kept = await put(second);
  const expiringId = randomUUID();
  const expiring = await put(third, 200, auth, expiringId);
  await db.query(
    "UPDATE abasong.circle_media SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expiring.id],
  );
  await put(third, 410, auth, expiringId);
  await newPost([expiring.id], 409);
  const storage = circleStorage("worker", {
    WORKER_DATABASE_URL: workerUrl,
    CIRCLE_MEDIA_DIRECTORY: directory,
  })!;
  const worker = new Pool({ connectionString: workerUrl, max: 1 });
  try {
    await assert.rejects(
      worker.query("SELECT source_digest FROM abasong.circle_media"),
      { code: "42501" },
    );
    const visible = (
      await worker.query("SELECT id FROM abasong.circle_media")
    ).rows.map((r) => r.id);
    assert.ok(
      visible.includes(expiring.id) &&
        !visible.includes(a.id) &&
        !visible.includes(kept.id),
    );
    await purgeCircleMedia(worker, storage, 10);
    await assert.rejects(storage.read(expiring.id, "full"), { code: "ENOENT" });
    assert.ok((await storage.read(kept.id, "full")).byteLength > 0);
    assert.ok((await storage.read(a.id, "thumb")).byteLength > 0);
    await call(`/v1/posts/${post.id}`, 200, "DELETE");
    await call(photo + "/full", 404);
    await call(photo + "/thumb", 404, "GET", other);
    await purgeCircleMedia(worker, storage, 10);
    for (const image of [a, b, c]) {
      await assert.rejects(storage.read(image.id, "thumb"), { code: "ENOENT" });
      await assert.rejects(storage.read(image.id, "full"), { code: "ENOENT" });
    }
    const rows = (
      await db.query(
        "SELECT owner_id,id FROM abasong.circle_media WHERE id=ANY($1::uuid[])",
        [[a.id, b.id, c.id, expiring.id, kept.id, peer.id]],
      )
    ).rows;
    assert.equal(rows.length, 2);
    assert.ok(rows.some((row) => row.id === kept.id && row.owner_id === owner));
    assert.ok(
      rows.some((row) => row.id === peer.id && row.owner_id === reader),
    );
  } finally {
    await worker.end();
  }
  console.log(
    `PASS: B5-04 private media, decode/EXIF, TTL, ownership, scoped reads and text replies (${checks} HTTP calls).`,
  );
  return checks;
}
