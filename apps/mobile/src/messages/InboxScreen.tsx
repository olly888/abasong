import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { useAuth } from "../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../auth/AuthControls";
import { dataRequest } from "../apartments/client";
import { ConversationRows, NotificationRows } from "./MessageViews";
import { StatusPanel } from "../ui/Feedback";
import { AccountError } from "../auth/api-client";
type S = components["schemas"];
export default function InboxScreen() {
  const { session } = useAuth(),
    [tab, setTab] = useState<"conversations" | "notifications">(
      "conversations",
    ),
    [conversations, setConversations] = useState<S["Conversation"][]>([]),
    [notifications, setNotifications] = useState<S["Notification"][]>([]),
    [summary, setSummary] = useState<S["InboxSummary"] | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<string | null>(null),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  const scope = useRef(0),
    active = useRef(false),
    controller = useRef<AbortController | null>(null),
    loading = useRef<number | null>(null),
    paginated = useRef(false);
  useEffect(() => {
    const s = AppState.addEventListener("change", (x) =>
      setForeground(x === "active"),
    );
    return () => s.remove();
  }, []);
  const load = useCallback(
    async (g: number, next?: string) => {
      if (!session || !active.current || loading.current === g) return;
      loading.current = g;
      const c = new AbortController();
      controller.current = c;
      setBusy(true);
      try {
        const [page, count] = await Promise.all([
          dataRequest<S["ConversationPage"] | S["NotificationPage"]>(
            session,
            `/v1/${tab === "conversations" ? "conversations" : "me/notifications"}?limit=30${next ? "&cursor=" + encodeURIComponent(next) : ""}`,
            { signal: c.signal },
          ),
          dataRequest<S["InboxSummary"]>(session, "/v1/me/inbox-summary", {
            signal: c.signal,
          }),
        ]);
        if (!active.current || g !== scope.current) return;
        if (next) paginated.current = true;
        setSummary(count);
        setCursor(page.next_cursor);
        setError(null);
        if (tab === "conversations")
          setConversations((old) =>
            next
              ? [
                  ...old,
                  ...(page as S["ConversationPage"]).items.filter(
                    (x) => !old.some((y) => y.id === x.id),
                  ),
                ]
              : (page as S["ConversationPage"]).items,
          );
        else
          setNotifications((old) =>
            next
              ? [
                  ...old,
                  ...(page as S["NotificationPage"]).items.filter(
                    (x) => !old.some((y) => y.id === x.id),
                  ),
                ]
              : (page as S["NotificationPage"]).items,
          );
      } catch (e) {
        if (!c.signal.aborted && active.current && g === scope.current) {
          if (e instanceof AccountError && [401, 403, 404].includes(e.status)) {
            setConversations([]);
            setNotifications([]);
            setSummary(null);
            setCursor(null);
          }
          setError(e instanceof Error ? e.message : "消息暂时无法加载");
        }
      } finally {
        if (loading.current === g) loading.current = null;
        if (active.current && g === scope.current) setBusy(false);
      }
    },
    [tab, session?.access_token],
  );
  useFocusEffect(
    useCallback(() => {
      if (!foreground) return;
      const g = ++scope.current;
      active.current = true;
      paginated.current = false;
      setCursor(null);
      setError(null);
      setBusy(true);
      void load(g);
      // Preserve the loaded history and its offset cursor while the driver reads
      // older rows. Re-entering the page or explicitly reloading refreshes it.
      const timer = setInterval(() => {
        if (!paginated.current) void load(g);
      }, 12000);
      return () => {
        active.current = false;
        scope.current++;
        clearInterval(timer);
        controller.current?.abort();
      };
    }, [foreground, load]),
  );
  async function openNotification(n: S["Notification"]) {
    if (!session) return;
    const g = scope.current;
    try {
      await dataRequest(session, `/v1/me/notifications/${n.id}/read`, {
        method: "PUT",
      });
      if (!active.current || g !== scope.current) return;
      setNotifications((old) =>
        old.map((x) =>
          x.id === n.id
            ? { ...x, read_at: x.read_at ?? new Date().toISOString() }
            : x,
        ),
      );
      if (
        n.object_type === "request" &&
        ["application_received", "application_withdrawn"].includes(n.kind)
      )
        router.push({
          pathname: "/requests/applications",
          params: { request_id: n.object_id },
        });
      else if (n.object_type === "request")
        router.push({
          pathname: "/requests/[id]",
          params: { id: n.object_id },
        });
      else if (n.object_type === "conversation")
        router.push({
          pathname: "/conversations/[id]",
          params: { id: n.object_id },
        });
      else void load(g);
    } catch (e) {
      if (active.current && g === scope.current)
        setError(e instanceof Error ? e.message : "通知暂不可用");
    }
  }
  const items = tab === "conversations" ? conversations : notifications;
  return (
    <AuthPage
      compact
      title="消息"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          borderBottomWidth: 1,
          borderColor: tokens.color.border,
        }}
      >
        {(["conversations", "notifications"] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: t === tab }}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 2,
              borderColor:
                t === tab ? tokens.color.brandPrimary : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: t === tab ? "600" : "400",
                color:
                  t === tab
                    ? tokens.color.brandPrimary
                    : tokens.color.textSecondary,
              }}
            >
              {t === "conversations" ? "对话" : "通知"}
              {summary &&
              (t === "conversations"
                ? summary.unread_conversations
                : summary.unread_notifications) > 0
                ? ` · ${t === "conversations" ? summary.unread_conversations : summary.unread_notifications}`
                : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      <FormError message={error} />
      {error ? (
        <ActionButton
          label="重新加载"
          variant="text"
          onPress={() => void load(scope.current)}
        />
      ) : null}
      {busy && !items.length ? (
        <StatusPanel state="loading" title="正在加载消息" />
      ) : null}
      {tab === "conversations" ? (
        <ConversationRows
          items={conversations}
          onOpen={(id) =>
            router.push({ pathname: "/conversations/[id]", params: { id } })
          }
        />
      ) : (
        <NotificationRows
          items={notifications}
          onOpen={(n) => void openNotification(n)}
        />
      )}
      {!busy && !error && !items.length ? (
        <StatusPanel
          state="empty"
          title={tab === "conversations" ? "暂无对话" : "暂无通知"}
        />
      ) : null}
      {cursor ? (
        <ActionButton
          label="加载更多"
          variant="text"
          busy={busy}
          onPress={() => void load(scope.current, cursor)}
        />
      ) : null}
    </AuthPage>
  );
}
