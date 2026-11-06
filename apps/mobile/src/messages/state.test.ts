import { it, expect } from "vitest";
import {
  mergeMessages,
  updateMessageLog,
  pendingAfterRead,
  retryInput,
  visibleWatermark,
  deliveryLabel,
  sourceSummary,
  type Message,
  type PendingMessage,
} from "./state";
it("keeps V2 source-card estimates and the two-scene title consistent with request details", () => {
  expect(
    sourceSummary({
      kind: "extra_drivers",
      parcel_count: 150,
      request_schema_version: 2,
      scenario: "warehouse_shortage",
      quantity_mode: "estimate",
    }),
  ).toEqual({ title: "仓库缺人，找司机", quantity: "约 150 件" });
});
it("shows unknown source quantities explicitly, without fabricating zero", () => {
  expect(
    sourceSummary({
      kind: "partial_route",
      parcel_count: null,
      request_schema_version: 2,
      scenario: "delivery_handoff",
      quantity_mode: "unknown",
    }),
  ).toEqual({ title: "送不完，找人代送", quantity: "件数待确认" });
});
it("preserves exact quantities and legacy source labels without inventing a V2 scenario", () => {
  expect(
    sourceSummary({
      kind: "extra_drivers",
      parcel_count: 150,
      request_schema_version: 2,
      scenario: "warehouse_shortage",
      quantity_mode: "exact",
    }).quantity,
  ).toBe("150 件");
  expect(
    sourceSummary({ kind: "partial_route", parcel_count: 80 }).quantity,
  ).toBe("80 件");
});
const row = (sequence: number, cid = "one", sender = "peer"): Message => ({
  id: `m${sequence}`,
  client_message_id: `client${sequence}`,
  conversation_id: cid,
  sender_id: sender,
  sequence,
  kind: "text",
  text: "TEST",
  request_snapshot: null,
  request_region_label: null,
  created_at: "2026-11-04T19:00:00Z",
});
it("merges delayed history and acknowledgements in sequence without duplicates or another conversation", () => {
  expect(
    mergeMessages(
      "one",
      [row(12), row(10)],
      [row(11), row(12), row(99, "other")],
    ).map((m) => m.sequence),
  ).toEqual([10, 11, 12]);
});
it("retries the exact client ID and body after an uncertain response", () => {
  const p: PendingMessage = {
    id: "same",
    text: "TEST original",
    status: "failed",
  };
  expect(retryInput(p)).toEqual({
    client_message_id: "same",
    kind: "text",
    text: "TEST original",
  });
  expect(retryInput({ ...p, status: "sending" })).toEqual(retryInput(p));
});
it("reconciles an accepted response only against the sender client ID", () => {
  const p: PendingMessage = { id: "client12", text: "TEST", status: "failed" };
  expect(pendingAfterRead([p], [row(12)], "me")).toHaveLength(1);
  expect(pendingAfterRead([p], [row(12, "one", "me")], "me")).toHaveLength(0);
});
it("does not call server acceptance a read receipt", () => {
  expect(deliveryLabel(row(12), 11)).toBe("已发送");
  expect(deliveryLabel(row(12), 12)).toBe("对方已读");
});
it("acknowledges visible messages only and never bridges an un-synced gap", () => {
  const rows = [row(10), row(12)];
  expect(visibleWatermark(rows, ["missing"])).toBe(0);
  expect(
    visibleWatermark(
      rows.filter((m) => m.sequence <= 10),
      ["m12"],
    ),
  ).toBe(0);
  expect(visibleWatermark(rows, ["m12"])).toBe(12);
});
it("does not skip peer sequence 11 when the own send response 12 arrives first", () => {
  let state = { messages: [] as Message[], synced: 0 };
  state = updateMessageLog("one", state, [row(10)], "feed");
  state = updateMessageLog("one", state, [row(12, "one", "me")], "send");
  expect(state.synced).toBe(10);
  state = updateMessageLog(
    "one",
    state,
    [row(11), row(12, "one", "me")],
    "feed",
  );
  expect(state.synced).toBe(12);
  expect(state.messages.map((m) => m.sequence)).toEqual([10, 11, 12]);
  state = updateMessageLog("one", state, [row(1)], "history");
  expect(state.synced).toBe(12);
});
