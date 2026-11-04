import type { components } from "@abasong/contracts";
export type Message = components["schemas"]["Message"];
export type Conversation = components["schemas"]["Conversation"];
export type PendingMessage = {
  id: string;
  text: string;
  status: "sending" | "failed";
  error?: string;
};
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
