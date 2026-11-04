import { describe, it, expect } from "vitest";
import {
  sendInput,
  inboxQuery,
  pageCursor,
  preferenceInput,
} from "./messaging-input";
import { messageQuery } from "./collaboration-input";
const id = "11111111-1111-4111-8111-111111111111";
describe("message contract boundaries", () => {
  it("requires text and rejects mixed kinds or spoofed sender identity", () => {
    for (const body of [
      { client_message_id: id, kind: "text" },
      { client_message_id: id, kind: "text", text: " " },
      { client_message_id: id, kind: "text", text: "TEST", sender_id: id },
      {
        client_message_id: id,
        kind: "text",
        text: "TEST",
        source_request_id: id,
      },
      {
        client_message_id: id,
        kind: "request_card",
        text: "TEST",
        source_request_id: id,
        source_request_version: 1,
      },
    ])
      expect(sendInput.safeParse(body).success).toBe(false);
  });
  it("preserves multiline text and rejects oversized/control content", () => {
    expect(
      sendInput.parse({
        client_message_id: id,
        kind: "text",
        text: "TEST\nline",
      }),
    ).toMatchObject({ text: "TEST\nline" });
    for (const text of ["a".repeat(2001), "TEST\u0000x"])
      expect(
        sendInput.safeParse({ client_message_id: id, kind: "text", text })
          .success,
      ).toBe(false);
  });
  it("requires a complete source-card identity", () => {
    expect(
      sendInput.safeParse({
        client_message_id: id,
        kind: "request_card",
        source_request_id: id,
        source_request_version: 2,
      }).success,
    ).toBe(true);
    expect(
      sendInput.safeParse({
        client_message_id: id,
        kind: "request_card",
        source_request_id: id,
      }).success,
    ).toBe(false);
  });
  it("bounds page size, sequence and rejects ambiguous directions", () => {
    for (const q of [
      { limit: 101 },
      { before_sequence: 5, after_sequence: 1 },
      { cursor: "b:10", after_sequence: 5 },
      { cursor: "9007199254740992" },
      { after_sequence: 1, actor_id: id },
    ])
      expect(messageQuery.safeParse(q).success).toBe(false);
    expect(messageQuery.parse({ cursor: "b:30" }).cursor).toBe("b:30");
    expect(inboxQuery.safeParse({ limit: 0 }).success).toBe(false);
    expect(pageCursor.safeParse({ at: "invalid", id }).success).toBe(false);
  });
  it("requires explicit boolean push preferences", () => {
    expect(
      preferenceInput.safeParse({
        chat_push: false,
        request_push: false,
        system_push: false,
      }).success,
    ).toBe(true);
    expect(preferenceInput.safeParse({ chat_push: "false" }).success).toBe(
      false,
    );
  });
});
