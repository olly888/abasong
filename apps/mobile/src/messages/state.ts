import type { components } from "@abasong/contracts";
import { kindLabels, scenarioLabels } from "../requests/presentation";
type SourceSummaryInput = Pick<
  components["schemas"]["RequestVersion"],
  "kind" | "parcel_count"
> &
  Partial<
    Pick<
      components["schemas"]["RequestVersionV2"],
      "request_schema_version" | "scenario" | "quantity_mode"
    >
  >;
export function sourceSummary(snapshot: SourceSummaryInput) {
  const v2 =
    "request_schema_version" in snapshot &&
    snapshot.request_schema_version === 2;
  return {
    title:
      v2 && snapshot.scenario
        ? scenarioLabels[snapshot.scenario]
        : (kindLabels[snapshot.kind as keyof typeof kindLabels] ?? "配送需求"),
    quantity:
      v2 && snapshot.quantity_mode === "unknown"
        ? "件数待确认"
        : snapshot.parcel_count !== null
          ? `${v2 && snapshot.quantity_mode === "estimate" ? "约 " : ""}${snapshot.parcel_count} 件`
          : "",
  };
}
export type Message = components["schemas"]["Message"];
export type Conversation = components["schemas"]["Conversation"];
export type PendingMessage = {
  id: string;
  text: string;
  status: "sending" | "failed";
  error?: string;
};
export function redactSourceMessages(rows: Message[]) {
  return rows.map((m) =>
    m.kind === "request_card"
      ? { ...m, request_snapshot: null, request_region_label: null }
      : m,
  );
}
export function requiresSourceRefresh(
  previous: Conversation | null,
  next: Conversation,
) {
  return (
    !!previous &&
    next.can_send &&
    (!previous.can_send ||
      (!previous.last_request_snapshot && !!next.last_request_snapshot))
  );
}
export function mergeMessages(
  conversationId: string,
  current: Message[],
  incoming: Message[],
) {
  const rows = new Map(
    current
      .filter((m) => m.conversation_id === conversationId)
      .map((m) => [m.id, m]),
  );
  for (const m of incoming)
    if (m.conversation_id === conversationId) rows.set(m.id, m);
  return [...rows.values()].sort((a, b) => a.sequence - b.sequence);
}
export function pendingAfterRead(
  pending: PendingMessage[],
  rows: Message[],
  sender: string,
) {
  const accepted = new Set(
    rows.filter((m) => m.sender_id === sender).map((m) => m.client_message_id),
  );
  return pending.filter((p) => !accepted.has(p.id));
}
export function deliveryLabel(message: Message, peerRead: number) {
  return message.sequence <= peerRead ? "对方已读" : "已发送";
}
export function retryInput(p: PendingMessage) {
  return { client_message_id: p.id, kind: "text" as const, text: p.text };
}
export function visibleWatermark(rows: Message[], ids: string[]) {
  const visible = new Set(ids);
  return rows.reduce(
    (n, m) => (visible.has(m.id) ? Math.max(n, m.sequence) : n),
    0,
  );
}
export const notificationLabel: Record<string, string> = {
  circle_reply: "你的司机圈动态有新回复",
  application_received: "有司机报名支援",
  application_withdrawn: "司机取消了报名",
  application_contacted: "发布者已标记联系",
  request_updated: "需求条件已更新",
  request_found: "需求已找到司机",
  request_closed: "需求已关闭",
};
// Sending may acknowledge seq 12 before a feed containing peer seq 11 arrives.
// Only feed pages advance the synchronization cursor; rendered order is separate.
export function updateMessageLog(
  conversationId: string,
  state: { messages: Message[]; synced: number },
  incoming: Message[],
  origin: "feed" | "send" | "history",
) {
  const accepted = incoming.filter((m) => m.conversation_id === conversationId);
  return {
    messages: mergeMessages(conversationId, state.messages, accepted),
    synced:
      origin === "feed"
        ? Math.max(state.synced, ...accepted.map((m) => m.sequence), 0)
        : state.synced,
  };
}
