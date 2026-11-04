import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { AuthPage } from "../auth/AuthControls";
import { ConversationLayout } from "../messages/ConversationLayout";
import {
  ChatHistory,
  ChatComposer,
  ConversationRows,
  NotificationRows,
} from "../messages/MessageViews";
import {
  mergeMessages,
  pendingAfterRead,
  retryInput,
  type Message,
  type PendingMessage,
  type Conversation,
} from "../messages/state";
type S = components["schemas"];
const id = "11111111-1111-4111-8111-111111111111",
  me = "22222222-2222-4222-8222-222222222222",
  peer = "33333333-3333-4333-8333-333333333333";
const source: S["RequestVersion"] = {
  request_id: id,
  version: 1,
  kind: "partial_route",
  region_id: id,
  starts_at: "2026-11-04T23:00:00Z",
  expires_at: "2026-11-05T03:00:00Z",
  price_cents: 180,
  price_unit: "per_parcel",
  parcel_count: 150,
  handoff_requirement: "contact_confirm",
  pickup_area: null,
  carrier: "SwiftX",
  route_label: "TEST-01",
  pickup_deadline_at: null,
  delivery_deadline_at: null,
  timezone: "America/Los_Angeles",
  drivers_needed: null,
  stop_count: null,
  sorted_state: "sorted",
  currency: "USD",
  private_payment_terms: null,
  accepts_partial: true,
  minimum_parcels: 50,
  experience_requirement: "any",
  pickup_region_id: id,
};
const initial: Message[] = [
  {
    id: "source",
    client_message_id: "source",
    conversation_id: id,
    sender_id: peer,
    sequence: 1,
    kind: "request_card",
    text: null,
    request_snapshot: source,
    request_region_label: "TEST · Pasadena",
    created_at: "2026-11-04T22:00:00Z",
  },
  {
    id: "text2",
    client_message_id: "text2",
    conversation_id: id,
    sender_id: peer,
    sequence: 2,
    kind: "text",
    text: "TEST · 还有80件，下午可以接手吗？",
    request_snapshot: null,
    request_region_label: null,
    created_at: "2026-11-04T22:01:00Z",
  },
  {
    id: "text3",
    client_message_id: "text3",
    conversation_id: id,
    sender_id: me,
    sequence: 3,
    kind: "text",
    text: "TEST · 可以，我预计3:30 PM到。",
    request_snapshot: null,
    request_region_label: null,
    created_at: "2026-11-04T22:02:00Z",
  },
];
const base: Conversation = {
  id,
  other_profile: {
    user_id: peer,
    display_name: "TEST 阿杰",
    bio: null,
    vehicle_type: null,
    experience: [],
  },
  unread_count: 2,
  last_sequence: 3,
  my_last_read_sequence: 0,
  other_last_read_sequence: 3,
  can_send: true,
  last_request_region_label: "TEST · Pasadena",
  last_request_snapshot: source,
  updated_at: "2026-11-04T22:02:00Z",
};
const notices: S["Notification"][] = [
  {
    id,
    kind: "application_received",
    object_type: "request",
    object_id: id,
    read_at: null,
    created_at: "2026-11-04T22:00:00Z",
  },
  {
    id: me,
    kind: "request_updated",
    object_type: "request",
    object_id: id,
    read_at: "2026-11-04T22:00:00Z",
    created_at: "2026-11-04T21:00:00Z",
  },
];
// DEV-only in-memory adapter. Never calls the real API or publishes a message.
export default function MessageLab() {
  const params = useLocalSearchParams<{ case?: string }>(),
    [screen, setScreen] = useState<"inbox" | "chat">("chat"),
    [tab, setTab] = useState<"chat" | "notices">("chat"),
    [messages, setMessages] = useState(initial),
    [pending, setPending] = useState<PendingMessage[]>([]),
    [draft, setDraft] = useState(""),
    [readOnly, setReadOnly] = useState(false),
    [error, setError] = useState<string | null>(null),
    [receipt, setReceipt] = useState(3),
    [notifications, setNotifications] = useState(notices),
    [annotation, setAnnotation] = useState("");
  const draftRef = useRef(""),
    sequence = useRef(3),
    serial = useRef(0),
    alive = useRef(true),
    timers = useRef(new Set<ReturnType<typeof setTimeout>>()),
    locks = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (params.case === "inbox") setScreen("inbox");
    if (params.case === "readonly") setReadOnly(true);
    if (params.case === "error") setError("网络连接暂不可用");
    if (params.case === "retry")
      setPending([
        {
          id: "TEST-retry-original",
          text: "TEST · 这条消息发送失败，点击重新发送。",
          status: "failed",
        },
      ]);
  }, [params.case]);
  function deliver(p: PendingMessage) {
    if (readOnly || locks.current.has(p.id)) return;
    const intent = retryInput(p);
    locks.current.add(p.id);
    setPending((old) =>
      old.map((x) => (x.id === p.id ? { ...x, status: "sending" } : x)),
    );
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      locks.current.delete(p.id);
      if (!alive.current) return;
      if (error) {
        setPending((old) =>
          old.map((x) => (x.id === p.id ? { ...x, status: "failed" } : x)),
        );
        return;
      }
      const accepted: Message = {
        id: "accepted:" + intent.client_message_id,
        client_message_id: intent.client_message_id,
        conversation_id: id,
        sender_id: me,
        sequence: ++sequence.current,
        kind: "text",
        text: intent.text,
        request_snapshot: null,
        request_region_label: null,
        created_at: new Date().toISOString(),
      };
      setMessages((old) => mergeMessages(id, old, [accepted]));
      setPending((old) => pendingAfterRead(old, [accepted], me));
      setAnnotation("同一消息编号 · 已接受");
    }, 500);
    timers.current.add(timer);
  }
  function send() {
    const text = draftRef.current.trim();
    if (!text || readOnly) return;
    draftRef.current = "";
    setDraft("");
    const p: PendingMessage = {
      id: `TEST-new-${++serial.current}`,
      text,
      status: "sending",
    };
    setPending((old) => [...old, p]);
    deliver(p);
  }
  const controls = (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 6,
        backgroundColor: tokens.color.surfaceMuted,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 12, color: tokens.color.textSecondary }}>
        TEST · 合成消息 · 不发送{annotation ? " · " + annotation : ""}
      </Text>
      <View style={{ flexDirection: "row", gap: 18 }}>
        {[
          ["列表", () => setScreen("inbox")],
          ["对话", () => setScreen("chat")],
          ["只读", () => setReadOnly((x) => !x)],
          ["弱网", () => setError((x) => (x ? null : "网络连接暂不可用"))],
          ["对方读到", () => setReceipt(sequence.current)],
        ].map(([label, fn]) => (
          <Pressable
            key={String(label)}
            accessibilityRole="button"
            onPress={fn as () => void}
            style={{ minHeight: 40, justifyContent: "center" }}
          >
            <Text style={{ fontSize: 13, color: tokens.color.brandPrimary }}>
              {String(label)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const p = {
    conversation: {
      ...base,
      other_last_read_sequence: receipt,
      can_send: !readOnly,
    },
    userId: me,
    messages,
    pending,
    draft,
    error,
    busy: false,
    loadingOlder: false,
    hasOlder: false,
    canSend: !readOnly,
    onDraft: (v: string) => {
      draftRef.current = v;
      setDraft(v);
    },
    onSend: send,
    onRetry: deliver,
    onReload: () => setError(null),
    onOlder: () => {},
    onVisible: () => {},
  };
  if (screen === "inbox")
    return (
      <AuthPage
        compact
        title="消息"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      >
        {controls}
        <View style={{ flexDirection: "row", gap: 24 }}>
          {(["chat", "notices"] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={{ minHeight: 48, justifyContent: "center" }}
            >
              <Text
                style={{
                  fontSize: 16,
                  color:
                    tab === t
                      ? tokens.color.brandPrimary
                      : tokens.color.textSecondary,
                }}
              >
                {t === "chat" ? "对话 · 1" : "通知 · 1"}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === "chat" ? (
          <ConversationRows items={[base]} onOpen={() => setScreen("chat")} />
        ) : (
          <NotificationRows
            items={notifications}
            onOpen={(n) =>
              setNotifications((old) =>
                old.map((x) =>
                  x.id === n.id
                    ? { ...x, read_at: new Date().toISOString() }
                    : x,
                ),
              )
            }
          />
        )}
      </AuthPage>
    );
  return (
    <ConversationLayout
      title={base.other_profile.display_name}
      onBack={() => setScreen("inbox")}
      onReload={() => setError(null)}
    >
      {controls}
      <ChatHistory {...p} />
      <ChatComposer {...p} />
    </ConversationLayout>
  );
}
