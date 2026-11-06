import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { AccountError } from "../auth/api-client";
import {
  updateMessageLog,
  pendingAfterRead,
  retryInput,
  visibleWatermark,
  type Conversation,
  type Message,
  type PendingMessage,
} from "./state";
type S = components["schemas"];
export function useConversation(id: string) {
  const { session } = useAuth();
  const request: ContributionRequest = useCallback(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
  return useConversationData(id, session?.user.id ?? "", request);
}
// The normal route keeps its authenticated adapter. The native exit fixture uses
// the same lifecycle/read-watermark/retry controller with an isolated transport.
export function useConversationData(
  id: string,
  userId: string,
  request: ContributionRequest,
) {
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [conversation, setConversation] = useState<Conversation | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [pending, setPending] = useState<PendingMessage[]>([]),
    [draft, setDraft] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [loadingOlder, setLoadingOlder] = useState(false),
    [cursor, setCursor] = useState<string | null>(null);
  const scope = useRef(0),
    live = useRef(false),
    controllers = useRef(new Set<AbortController>()),
    currentRows = useRef(messages),
    currentConversation = useRef(conversation),
    draftRef = useRef(""),
    refreshing = useRef<number | null>(null),
    loadingPage = useRef<number | null>(null),
    sending = useRef(new Set<string>()),
    visible = useRef<string[]>([]),
    readTarget = useRef(0),
    readAck = useRef(0),
    syncedSequence = useRef(0),
    readBusy = useRef(false),
    readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  currentRows.current = messages;
  currentConversation.current = conversation;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (x) =>
      setForeground(x === "active"),
    );
    return () => sub.remove();
  }, []);
  const valid = (g: number) => live.current && g === scope.current;
  const accept = (
    items: Message[],
    origin: "feed" | "send" | "history" = "send",
  ) => {
    const next = updateMessageLog(
      id,
      { messages: currentRows.current, synced: syncedSequence.current },
      items,
      origin,
    );
    currentRows.current = next.messages;
    syncedSequence.current = next.synced;
    readTarget.current = Math.max(
      readTarget.current,
      visibleWatermark(
        next.messages.filter((m) => m.sequence <= next.synced),
        visible.current,
      ),
    );
    setMessages(next.messages);
    setPending((old) => pendingAfterRead(old, items, userId));
  };
  function failed(e: unknown, g: number) {
    if (!valid(g)) return;
    setError(e instanceof Error ? e.message : "消息暂时无法加载");
    if (e instanceof AccountError && [401, 403, 404].includes(e.status)) {
      setConversation(null);
      setMessages([]);
      setPending([]);
      setDraft("");
      draftRef.current = "";
    }
  }
  const markRead = async (g: number) => {
    if (
      !userId ||
      !valid(g) ||
      readBusy.current ||
      readTarget.current <= readAck.current
    )
      return;
    readBusy.current = true;
    const target = readTarget.current,
      c = new AbortController();
    controllers.current.add(c);
    try {
      await request(`/v1/conversations/${id}/read`, {
        method: "PUT",
        body: { last_read_sequence: target },
        signal: c.signal,
      });
      if (valid(g)) readAck.current = Math.max(readAck.current, target);
    } catch {
      /* Keep the target for the next foreground poll. Never fake acknowledgement. */
    } finally {
      controllers.current.delete(c);
      readBusy.current = false;
    }
  };
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  const refresh = useCallback(
    async (g: number) => {
      if (!userId || !valid(g) || refreshing.current === g) return;
      refreshing.current = g;
      const c = new AbortController();
      controllers.current.add(c);
      const after = syncedSequence.current;
      try {
        const [meta, page] = await Promise.allSettled([
          request<Conversation>(`/v1/conversations/${id}`, {
            signal: c.signal,
          }),
          request<S["MessagePage"]>(
            `/v1/conversations/${id}/messages?limit=40&${after ? `after_sequence=${after}` : `before_sequence=${Number.MAX_SAFE_INTEGER}`}`,
            { signal: c.signal },
          ),
        ]);
        if (!valid(g)) return;
        if (meta.status === "rejected") throw meta.reason;
        setConversation(meta.value);
        readAck.current = Math.max(
          readAck.current,
          meta.value.my_last_read_sequence,
        );
        if (page.status === "rejected") throw page.reason;
        accept(page.value.items, "feed");
        if (!after) setCursor(page.value.next_cursor);
        setError(null);
        void markReadRef.current(g);
      } catch (e) {
        if (!c.signal.aborted) failed(e, g);
      } finally {
        controllers.current.delete(c);
        if (refreshing.current === g) refreshing.current = null;
        if (valid(g)) setBusy(false);
      }
    },
    [id, userId, request],
  );
  useFocusEffect(
    useCallback(() => {
      if (!foreground) return;
      const g = ++scope.current;
      live.current = true;
      setBusy(true);
      void refresh(g);
      const timer = setInterval(() => void refresh(g), 4000);
      return () => {
        live.current = false;
        scope.current++;
        clearInterval(timer);
        clearTimeout(readTimer.current);
        controllers.current.forEach((c) => c.abort());
        controllers.current.clear();
        setPending((old) =>
          old.map((p) =>
            p.status === "sending" ? { ...p, status: "failed" } : p,
          ),
        );
      };
    }, [foreground, refresh]),
  );
  async function deliver(p: PendingMessage) {
    if (
      !userId ||
      !live.current ||
      !currentConversation.current?.can_send ||
      sending.current.has(p.id)
    )
      return;
    const g = scope.current,
      c = new AbortController();
    sending.current.add(p.id);
    controllers.current.add(c);
    setPending((old) =>
      old.map((m) =>
        m.id === p.id ? { ...m, status: "sending", error: undefined } : m,
      ),
    );
    try {
      const result = await request<Message>(
        `/v1/conversations/${id}/messages`,
        { method: "POST", body: retryInput(p), key: p.id, signal: c.signal },
      );
      if (valid(g)) {
        accept([result]);
        void refresh(g);
      }
    } catch (e) {
      if (valid(g)) {
        setPending((old) =>
          old.map((m) =>
            m.id === p.id
              ? {
                  ...m,
                  status: "failed",
                  error: e instanceof Error ? e.message : "发送失败",
                }
              : m,
          ),
        );
        if (e instanceof AccountError && [401, 403, 404].includes(e.status))
          void refresh(g);
      }
    } finally {
      controllers.current.delete(c);
      sending.current.delete(p.id);
    }
  }
  function send() {
    const text = draftRef.current.trim();
    if (
      !text ||
      text.length > 2000 ||
      !currentConversation.current?.can_send ||
      !live.current
    )
      return;
    draftRef.current = "";
    setDraft("");
    const p: PendingMessage = { id: randomUUID(), text, status: "sending" };
    setPending((old) => [...old, p]);
    void deliver(p);
  }
  async function older() {
    if (
      !userId ||
      !cursor ||
      !live.current ||
      loadingPage.current === scope.current
    )
      return;
    const g = scope.current,
      c = new AbortController();
    loadingPage.current = g;
    controllers.current.add(c);
    setLoadingOlder(true);
    try {
      const page = await request<S["MessagePage"]>(
        `/v1/conversations/${id}/messages?limit=40&cursor=${encodeURIComponent(cursor)}`,
        { signal: c.signal },
      );
      if (valid(g)) {
        accept(page.items, "history");
        setCursor(page.next_cursor);
        setError(null);
      }
    } catch (e) {
      if (!c.signal.aborted) failed(e, g);
    } finally {
      controllers.current.delete(c);
      if (loadingPage.current === g) loadingPage.current = null;
      if (valid(g)) setLoadingOlder(false);
    }
  }
  function onVisible(ids: string[]) {
    visible.current = ids;
    const target = visibleWatermark(
      currentRows.current.filter((m) => m.sequence <= syncedSequence.current),
      ids,
    );
    readTarget.current = Math.max(readTarget.current, target);
    clearTimeout(readTimer.current);
    const g = scope.current;
    readTimer.current = setTimeout(() => void markReadRef.current(g), 450);
  }
  return {
    conversation,
    messages,
    pending,
    draft,
    error,
    busy,
    loadingOlder,
    hasOlder: !!cursor,
    userId,
    canSend: !!conversation?.can_send && foreground,
    onDraft: (v: string) => {
      draftRef.current = v;
      setDraft(v);
    },
    onSend: send,
    onRetry: (p: PendingMessage) => void deliver(p),
    onReload: () => void refresh(scope.current),
    onOlder: () => void older(),
    onVisible,
  };
}
