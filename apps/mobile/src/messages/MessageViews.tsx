import { memo, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, FormError } from "../auth/AuthControls";
import { Icon } from "../ui/Icon";
import { UnreadBadge } from "../ui/UnreadBadge";
import { typeStyles } from "../ui/foundation";
import { requestPrice, requestTime } from "../requests/presentation";
import {
  deliveryLabel,
  notificationLabel,
  sourceSummary,
  type Message,
  type PendingMessage,
  type Conversation,
} from "./state";
type S = components["schemas"];
export function ConversationRows({
  items,
  onOpen,
}: {
  items: Conversation[];
  onOpen: (id: string) => void;
}) {
  return (
    <View>
      {items.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`${c.other_profile.display_name}${c.unread_count ? `，${c.unread_count}条未读` : ""}`}
          onPress={() => onOpen(c.id)}
          style={({ pressed }) => [
            s.inboxRow,
            pressed && { backgroundColor: tokens.color.surfaceMuted },
          ]}
        >
          <View style={s.avatar}>
            <Icon name="person" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text numberOfLines={1} style={[s.name, { flex: 1 }]}>
                {c.other_profile.display_name}
              </Text>
              <Text style={s.meta}>{requestTime(c.updated_at)}</Text>
            </View>
            <Text numberOfLines={1} style={s.secondary}>
              {c.last_request_snapshot
                ? [
                    c.last_request_region_label ??
                      c.last_request_snapshot.carrier,
                    sourceSummary(c.last_request_snapshot).title,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "同行对话"}
            </Text>
          </View>
          <UnreadBadge count={c.unread_count} />
        </Pressable>
      ))}
    </View>
  );
}
export function NotificationRows({
  items,
  onOpen,
  openingId,
}: {
  openingId?: string | null;
  items: S["Notification"][];
  onOpen: (n: S["Notification"]) => void;
}) {
  return (
    <View>
      {items.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel={`${notificationLabel[n.kind] ?? "系统通知"}${!n.read_at ? "，未读" : ""}`}
          disabled={!!openingId}
          accessibilityState={{
            disabled: !!openingId,
            busy: openingId === n.id,
          }}
          onPress={() => onOpen(n)}
          style={({ pressed }) => [
            s.inboxRow,
            pressed && { backgroundColor: tokens.color.surfaceMuted },
          ]}
        >
          <View style={s.avatar}>
            <Icon name="message" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.name}>
              {notificationLabel[n.kind] ?? "系统通知"}
            </Text>
            <Text style={s.meta}>{requestTime(n.created_at)}</Text>
          </View>
          <UnreadBadge count={n.read_at ? 0 : 1} dot />
        </Pressable>
      ))}
    </View>
  );
}
const Bubble = memo(function Bubble({
  message: m,
  own,
  peerRead,
  onOpenRequest,
}: {
  message: Message;
  own: boolean;
  peerRead: number;
  onOpenRequest?: (id: string) => void;
}) {
  if (m.kind === "request_card") {
    const snapshot = m.request_snapshot;
    const summary = snapshot ? sourceSummary(snapshot) : null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          snapshot
            ? `${m.request_region_label ?? snapshot.carrier ?? "来源需求"}，第${snapshot.version}版，查看当前需求`
            : "来源需求当前不可见"
        }
        disabled={!snapshot}
        onPress={() =>
          snapshot &&
          (onOpenRequest
            ? onOpenRequest(snapshot.request_id)
            : router.push({
                pathname: "/requests/[id]",
                params: { id: snapshot.request_id },
              }))
        }
        style={({ pressed }) => [
          s.sourceCard,
          pressed && { backgroundColor: tokens.color.surfaceMuted },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={s.meta}>
            来源需求{snapshot ? ` · 第${snapshot.version}版` : ""}
          </Text>
          {snapshot ? (
            <Icon name="chevron" size={18} color={tokens.color.textSecondary} />
          ) : null}
        </View>
        {snapshot ? (
          <>
            <Text style={s.name}>
              {m.request_region_label ?? snapshot.carrier} · {summary?.title}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {!["vehicle_help", "other_help"].includes(snapshot.kind) ? (
                <Text style={s.quote}>{requestPrice(snapshot)}</Text>
              ) : null}
              <Text style={s.secondary}>
                {summary?.quantity ? `${summary.quantity} · ` : ""}
                {snapshot.carrier}
              </Text>
            </View>
            <Text style={s.meta}>{requestTime(snapshot.starts_at)}</Text>
          </>
        ) : (
          <Text style={s.secondary}>来源需求当前不可见</Text>
        )}
      </Pressable>
    );
  }
  return (
    <View style={[s.messageRow, own && { alignItems: "flex-end" }]}>
      <View style={[s.bubble, own && s.ownBubble]}>
        <Text
          selectable
          style={[s.body, own && { color: tokens.color.onBrand }]}
        >
          {m.text}
        </Text>
      </View>
      <Text style={s.meta}>
        {requestTime(m.created_at)}
        {own ? ` · ${deliveryLabel(m, peerRead)}` : ""}
      </Text>
    </View>
  );
});
type ChatProps = {
  onOpenRequest?: (id: string) => void;
  conversation: Conversation | null;
  userId: string;
  messages: Message[];
  pending: PendingMessage[];
  draft: string;
  error: string | null;
  busy: boolean;
  loadingOlder: boolean;
  hasOlder: boolean;
  canSend: boolean;
  onDraft: (v: string) => void;
  onSend: () => void;
  onRetry: (p: PendingMessage) => void;
  onReload: () => void;
  onOlder: () => void;
  onVisible: (ids: string[]) => void;
};
export function ChatHistory(p: ChatProps) {
  const list = useRef<FlatList<Message>>(null),
    lastSequence = useRef(0),
    lastPending = useRef<string | null>(null),
    nearBottom = useRef(true),
    initialized = useRef(false),
    visible = useRef(p.onVisible);
  visible.current = p.onVisible;
  const viewability = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 400,
  }).current;
  const onVisible = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: { item: Message; isViewable: boolean }[];
    }) =>
      visible.current(
        viewableItems.filter((v) => v.isViewable).map((v) => v.item.id),
      ),
    [],
  );
  useEffect(() => {
    if (!p.messages.length) return;
    const latest = p.messages.at(-1)!.sequence;
    const first = !initialized.current;
    initialized.current = true;
    if (first || (latest > lastSequence.current && nearBottom.current))
      requestAnimationFrame(() =>
        list.current?.scrollToEnd({ animated: !first }),
      );
    lastSequence.current = latest;
  }, [p.messages]);
  useEffect(() => {
    const latest = p.pending.at(-1)?.id ?? null;
    if (latest && latest !== lastPending.current)
      requestAnimationFrame(() =>
        list.current?.scrollToEnd({ animated: true }),
      );
    lastPending.current = latest;
  }, [p.pending]);
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.surfaceMuted }}>
      {p.error ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 10, gap: 4 }}>
          <FormError message={p.error} />
          <ActionButton label="重新加载" variant="text" onPress={p.onReload} />
        </View>
      ) : null}
      <FlatList
        ref={list}
        data={p.messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <Bubble
            message={item}
            own={item.sender_id === p.userId}
            peerRead={p.conversation?.other_last_read_sequence ?? 0}
            onOpenRequest={p.onOpenRequest}
          />
        )}
        contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={(e) => {
          const n = e.nativeEvent;
          nearBottom.current =
            n.contentSize.height -
              n.layoutMeasurement.height -
              n.contentOffset.y <
            100;
        }}
        scrollEventThrottle={16}
        onLayout={() => {
          if (nearBottom.current)
            requestAnimationFrame(() =>
              list.current?.scrollToEnd({ animated: false }),
            );
        }}
        onViewableItemsChanged={onVisible}
        viewabilityConfig={viewability}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={
          p.hasOlder ? (
            <ActionButton
              label="更早消息"
              variant="text"
              busy={p.loadingOlder}
              onPress={p.onOlder}
            />
          ) : undefined
        }
        ListEmptyComponent={
          p.busy ? (
            <ActivityIndicator />
          ) : !p.error ? (
            <Text
              style={[s.secondary, { textAlign: "center", paddingTop: 32 }]}
            >
              暂无消息
            </Text>
          ) : undefined
        }
        ListFooterComponent={
          <View style={{ gap: 16 }}>
            {p.pending.map((m) => (
              <View
                key={m.id}
                style={[s.messageRow, { alignItems: "flex-end" }]}
              >
                <View style={[s.bubble, s.ownBubble]}>
                  <Text style={[s.body, { color: tokens.color.onBrand }]}>
                    {m.text}
                  </Text>
                </View>
                {m.status === "failed" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="重新发送这条消息"
                    disabled={!p.canSend}
                    onPress={() => p.onRetry(m)}
                    style={{ minHeight: 48, justifyContent: "center" }}
                  >
                    <Text style={{ color: tokens.color.danger, fontSize: 14 }}>
                      发送失败 · 重新发送
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={s.meta}>发送中…</Text>
                )}
              </View>
            ))}
          </View>
        }
      />
    </View>
  );
}
export function ChatComposer(
  p: Pick<ChatProps, "draft" | "canSend" | "onDraft" | "onSend"> & {
    readOnlyReason?: string;
  },
) {
  return (
    <View style={s.composer}>
      {!p.canSend ? (
        <Text style={s.secondary}>
          {p.readOnlyReason ?? "当前仅可查看历史消息"}
        </Text>
      ) : (
        <>
          <TextInput
            accessibilityLabel="消息内容"
            value={p.draft}
            onChangeText={p.onDraft}
            multiline
            maxLength={2000}
            placeholder="发送消息"
            placeholderTextColor={tokens.color.textMuted}
            style={s.input}
          />
          <View style={{ width: 72 }}>
            <ActionButton
              label="发送"
              disabled={!p.draft.trim()}
              onPress={p.onSend}
            />
          </View>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: tokens.color.border,
    minHeight: 88,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { ...typeStyles.label },
  secondary: {
    fontSize: 14,
    lineHeight: 22,
    color: tokens.color.textSecondary,
  },
  meta: { fontSize: 12, lineHeight: 18, color: tokens.color.textSecondary },
  messageRow: { alignItems: "flex-start", gap: 6 },
  bubble: {
    maxWidth: "86%",
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ownBubble: { backgroundColor: tokens.color.brandPrimary },
  body: { fontSize: 16, lineHeight: 24, color: tokens.color.ink },
  sourceCard: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  quote: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    color: tokens.color.ink,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 132,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24,
    color: tokens.color.ink,
    backgroundColor: tokens.color.surfaceMuted,
  },
});
