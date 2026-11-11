import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { MapModeSwitch } from "../ui/MapControls";
import { typeStyles } from "../ui/foundation";
import { useAuth } from "../auth/AuthProvider";
import { useBusinessRequest } from "../auth/useBusinessRequest";
import type { ProfileRequest } from "../profile/profile-session";
import { openPost } from "../circle/navigation";
import { AuthPage, ActionButton, FormError } from "../auth/AuthControls";
import { ConversationRows, NotificationRows } from "./MessageViews";
import { StatusPanel } from "../ui/Feedback";
import { AccountError } from "../auth/api-client";
type S = components["schemas"];
export default function InboxScreen() {
  const request = useBusinessRequest();
  const { session } = useAuth();
  return (
    <InboxContent key={session?.user.id} request={request} onPost={openPost} />
  );
}

export function InboxContent({
  request,
  onPost,
  initialTab = "conversations",
  onBack,
}: {
  request: ProfileRequest;
  onPost: (id: string, commentId?: string) => void;
  initialTab?: "conversations" | "notifications";
  onBack?: () => void;
}) {
  const [tab, setTab] = useState<"conversations" | "notifications">(initialTab),
    [conversations, setConversations] = useState<S["Conversation"][]>([]),
    [notifications, setNotifications] = useState<S["Notification"][]>([]),
    [summary, setSummary] = useState<S["InboxSummary"] | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [verified, setVerified] = useState<{
      request: ProfileRequest;
      tab: string;
    } | null>(null),
    [openingId, setOpeningId] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  const scope = useRef(0),
    active = useRef(false),
    controller = useRef<AbortController | null>(null),
    loading = useRef<number | null>(null),
    paginated = useRef(false),
    reading = useRef(false),
    readRevision = useRef(0),
    summaryRequest = useRef(0);
  useEffect(() => {
    const s = AppState.addEventListener("change", (x) =>
      setForeground(x === "active"),
    );
    return () => s.remove();
  }, []);
  const load = useCallback(
    async (g: number, next?: string) => {
      if (
        !active.current ||
        g !== scope.current ||
        loading.current === g ||
        reading.current
      )
        return;
      loading.current = g;
      const revision = readRevision.current;
      const summaryId = ++summaryRequest.current;
      const c = new AbortController();
      controller.current = c;
      setBusy(true);
      try {
        const [page, count] = await Promise.all([
          request<S["ConversationPage"] | S["NotificationPage"]>(
            `/v1/${tab === "conversations" ? "conversations" : "me/notifications"}?limit=30${next ? "&cursor=" + encodeURIComponent(next) : ""}`,
            { signal: c.signal },
          ),
          request<S["InboxSummary"]>("/v1/me/inbox-summary", {
            signal: c.signal,
          }),
        ]);
        if (
          !active.current ||
          g !== scope.current ||
          revision !== readRevision.current
        )
          return;
        setVerified({ request, tab });
        if (next) paginated.current = true;
        if (summaryId === summaryRequest.current) setSummary(count);
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
        if (
          !c.signal.aborted &&
          active.current &&
          g === scope.current &&
          revision === readRevision.current
        ) {
          if (e instanceof AccountError && [401, 403, 404].includes(e.status)) {
            setVerified(null);
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
    [tab, request],
  );
  useFocusEffect(
    useCallback(() => {
      if (!foreground) return;
      const g = ++scope.current;
      active.current = true;
      paginated.current = false;
      reading.current = false;
      setOpeningId(null);
      setCursor(null);
      setVerified(null);
      setSummary(null);
      setError(null);
      setBusy(true);
      void load(g);
      // Preserve the loaded history and its offset cursor while the driver reads
      // older rows. Re-entering the page or explicitly reloading refreshes it.
      const timer = setInterval(() => {
        if (!paginated.current) void load(g);
      }, 12000);
      return () => {
        setVerified(null);
        active.current = false;
        scope.current++;
        clearInterval(timer);
        controller.current?.abort();
      };
    }, [foreground, load]),
  );
  async function refreshSummary(g: number) {
    const revision = readRevision.current;
    const summaryId = ++summaryRequest.current;
    const current = () =>
      active.current &&
      g === scope.current &&
      revision === readRevision.current &&
      summaryId === summaryRequest.current;
    try {
      const value = await request<S["InboxSummary"]>("/v1/me/inbox-summary");
      if (current()) setSummary(value);
    } catch (e) {
      if (current()) {
        setSummary(null);
        if (e instanceof AccountError && [401, 403].includes(e.status)) {
          setVerified(null);
          setConversations([]);
          setNotifications([]);
          setCursor(null);
          setError(e.message);
        }
      }
    }
  }
  async function openNotification(n: S["Notification"]) {
    if (reading.current || !active.current) return;
    const g = scope.current;
    reading.current = true;
    readRevision.current++;
    controller.current?.abort();
    setOpeningId(n.id);
    setError(null);
    try {
      await request(`/v1/me/notifications/${n.id}/read`, { method: "PUT" });
      if (!active.current || g !== scope.current) return;
      setNotifications((old) =>
        old.map((x) =>
          x.id === n.id
            ? { ...x, read_at: x.read_at ?? new Date().toISOString() }
            : x,
        ),
      );
      // Only the server acknowledges this notification. Never clear other
      // notifications or conversation watermarks when entering the circle.
      setSummary(null);
      void refreshSummary(g);
      if (n.kind === "circle_reply" && n.object_type === "post")
        onPost(n.object_id, n.comment_id);
      else if (
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
    } catch (e) {
      if (active.current && g === scope.current) {
        if (e instanceof AccountError && [401, 403].includes(e.status)) {
          setVerified(null);
          setSummary(null);
          setConversations([]);
          setNotifications([]);
          setCursor(null);
        } else if (e instanceof AccountError && e.status === 404) {
          setNotifications((old) => old.filter((item) => item.id !== n.id));
          setSummary(null);
          void refreshSummary(g);
        }
        setError(
          e instanceof AccountError && e.status === 404
            ? "这条通知已不可查看"
            : e instanceof Error
              ? e.message
              : "通知暂不可用",
        );
      }
    } finally {
      if (active.current && g === scope.current) {
        reading.current = false;
        setOpeningId(null);
        setBusy(false);
      }
    }
  }
  const visible =
    verified?.request === request && verified?.tab === tab && foreground;
  const counts = visible ? summary : null;
  const items = !visible
    ? []
    : tab === "conversations"
      ? conversations
      : notifications;
  return (
    <AuthPage
      compact
      title="消息"
      onBack={
        onBack ??
        (() => (router.canGoBack() ? router.back() : router.replace("/")))
      }
    >
      <MapModeSwitch
        items={["对话", "通知"] as const}
        fullWidth
        selected={tab === "conversations" ? "对话" : "通知"}
        onSelect={(value) =>
          setTab(value === "对话" ? "conversations" : "notifications")
        }
        badges={{
          对话: counts?.unread_messages ?? 0,
          通知: counts?.unread_notifications ?? 0,
        }}
      />
      {tab === "notifications" && (counts?.unread_circle_replies ?? 0) > 0 ? (
        <Text style={typeStyles.metadata}>
          其中司机圈回复 {counts!.unread_circle_replies} 条
        </Text>
      ) : null}
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
          items={visible ? conversations : []}
          onOpen={(id) =>
            router.push({ pathname: "/conversations/[id]", params: { id } })
          }
        />
      ) : (
        <NotificationRows
          items={visible ? notifications : []}
          openingId={openingId}
          onOpen={(n) => void openNotification(n)}
        />
      )}
      {visible && !busy && !error && !items.length ? (
        <StatusPanel
          state="empty"
          title={tab === "conversations" ? "暂无对话" : "暂无通知"}
        />
      ) : null}
      {visible && cursor ? (
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
