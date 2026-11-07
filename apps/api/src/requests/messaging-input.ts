import { checked } from "./request-input";
import { ApiError } from "../common/api-error";
import { z } from "zod";
const uuid = z.uuid().transform((x) => x.toLowerCase());
export const sendInput = z.discriminatedUnion("kind", [
  z
    .object({
      client_message_id: uuid,
      kind: z.literal("text"),
      text: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .refine((x) =>
          [...x].every(
            (c) =>
              c === "\n" ||
              c === "\t" ||
              (c.codePointAt(0)! >= 32 && c.codePointAt(0) !== 127),
          ),
        ),
    })
    .strict(),
  z
    .object({
      client_message_id: uuid,
      kind: z.literal("request_card"),
      source_request_id: uuid,
      source_request_version: z.number().int().positive().max(2147483647),
    })
    .strict(),
]);
export const inboxQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().max(1000).optional(),
  })
  .strict();
export const preferenceInput = z
  .object({
    chat_push: z.boolean(),
    request_push: z.boolean(),
    system_push: z.boolean(),
  })
  .strict();
export const pageCursor = z
  .object({ at: z.iso.datetime({ offset: true }), id: uuid })
  .strict();

export function inboxCursor(query: unknown) {
  const q = checked(inboxQuery, query);
  if (!q.cursor) return { limit: q.limit, after: undefined };
  try {
    const after = checked(
      pageCursor,
      JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8")),
    );
    return { limit: q.limit, after };
  } catch {
    throw new ApiError(400, "INVALID_INPUT", "列表位置有误");
  }
}
