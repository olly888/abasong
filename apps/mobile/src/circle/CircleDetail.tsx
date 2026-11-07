import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { tokens } from "@abasong/ui";
import { AccountError } from "../auth/api-client";
import { BottomSheet } from "../ui/BottomSheet";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { StatusPanel } from "../ui/Feedback";
import { IconButton } from "../ui/Primitives";
import { requestTime } from "../requests/presentation";
import { CirclePostCard, TextButton } from "./CirclePostCard";
import {
  forgetReplyDraft,
  getReplyDraft,
  setReplyDraft,
  type Circle,
  type CircleRequest,
} from "./session";

type Target = { id: string; author: string; type: "post" | "comment" };
const reportReasons = [
  "包含住户信息或门禁码",
  "垃圾广告或诈骗",
  "骚扰或不当内容",
];
export function CircleDetail({
  actor,
  id,
  commentId,
  request,
  onBack,
  onHome,
  onAuthor,
  onRequest,
}: {
  actor: string;
  id: string;
  commentId?: string;
  request: CircleRequest;
  onBack: () => void;
  onHome: () => void;
  onAuthor: (id: string) => void;
  onRequest: (id: string) => void;
}) {
  const [post, setPost] = useState<Circle["Post"] | null>(null);
  const [replies, setReplies] = useState<Circle["Comment"][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [readState, setReadState] = useState<
    "loading" | "ready" | "unavailable" | "error"
  >("loading");
  const [draft, setDraft] = useState(() => getReplyDraft(actor, id));
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [report, setReport] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const reading = useRef(false);
  const busy = useRef(false);
  const reportAttempt = useRef<{
    target: string;
    reason: string;
    key: string;
  } | null>(null);
  const endpoint = `/v1/posts/${encodeURIComponent(id)}`;

  const load = useCallback(
    async (c: AbortController, after?: string) => {
      if (reading.current || c.signal.aborted) return;
      reading.current = true;
      const signal = c.signal;
      if (after) setPaging(true);
      else setReadState("loading");
      try {
        const [detail, page] = await Promise.all([
          request<Circle["Post"]>(endpoint, { signal }),
          request<Circle["CommentPage"]>(
            `${endpoint}/comments?limit=25${after ? "&cursor=" + encodeURIComponent(after) : ""}`,
            { signal },
          ),
        ]);
        if (signal.aborted) return;
        setPost(detail);
        setReplies((old) =>
          after
            ? [
                ...old,
                ...page.items.filter((r) => !old.some((x) => x.id === r.id)),
              ]
            : page.items,
        );
        setCursor(page.next_cursor);
        setReadState("ready");
      } catch (e) {
        if (!signal.aborted) {
          if (e instanceof AccountError && [401, 403, 404].includes(e.status)) {
            setReadState("unavailable");
            setPost(null);
            setReplies([]);
          } else if (after) setMessage("回复暂时无法加载");
          else setReadState("error");
        }
      } finally {
        if (!signal.aborted) {
          reading.current = false;
          setPaging(false);
        }
      }
    },
    [endpoint, request],
  );
  useFocusEffect(
    useCallback(() => {
      const c = new AbortController();
      lifetime.current = c;
      reading.current = false;
      setWriteError(null);
      setMessage(null);
      setPaging(false);
      setWriting(false);
      void load(c);
      return () => {
        c.abort();
        busy.current = false;
        setReadState("loading");
        setTarget(null);
        setReport(false);
      };
    }, [load]),
  );

  async function mutate(
    run: (signal: AbortSignal) => Promise<void>,
    failure: string,
    reply = false,
  ) {
    const signal = lifetime.current?.signal;
    if (busy.current || !signal || signal.aborted) return;
    busy.current = true;
    setWriting(true);
    setWriteError(null);
    setMessage(null);
    try {
      await run(signal);
    } catch (e) {
      if (!signal.aborted) {
        if (e instanceof AccountError && [401, 403, 404].includes(e.status)) {
          if (lifetime.current) void load(lifetime.current);
        }
        const copy =
          e instanceof AccountError && e.code === "ACCESS_CODE_NOT_ALLOWED"
            ? e.message
            : failure;
        if (reply) setWriteError(copy);
        else setMessage(copy);
      }
    } finally {
      if (!signal.aborted) {
        busy.current = false;
        setWriting(false);
      }
    }
  }
  function send() {
    if (!draft.fields.body.trim() || readState !== "ready") return;
    void mutate(
      async (signal) => {
        const comment = await request<Circle["Comment"]>(
          endpoint + "/comments",
          {
            method: "POST",
            body: draft.fields,
            key: draft.key,
            signal,
          },
        );
        if (signal.aborted) return;
        forgetReplyDraft(actor, id, draft.key);
        setDraft(getReplyDraft(actor, id));
        setReplies((items) =>
          items.some((r) => r.id === comment.id) ? items : [comment, ...items],
        );
        if (!replies.some((r) => r.id === comment.id))
          setPost((p) => (p ? { ...p, reply_count: p.reply_count + 1 } : p));
        Keyboard.dismiss();
      },
      "回复未成功，内容已保留",
      true,
    );
  }
  function remove(t: Target) {
    setTarget(null);
    Alert.alert(
      t.type === "post" ? "删除这条动态？" : "删除这条回复？",
      undefined,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () =>
            void mutate(async (signal) => {
              await request(
                `/v1/${t.type === "post" ? "posts" : "comments"}/${t.id}`,
                { method: "DELETE", signal },
              );
              if (!signal.aborted && lifetime.current)
                void load(lifetime.current);
            }, "删除未成功，请重试"),
        },
      ],
    );
  }
  function block(t: Target) {
    setTarget(null);
    Alert.alert("屏蔽该作者？", "双方的动态和回复将不再互相显示。", [
      { text: "取消", style: "cancel" },
      {
        text: "屏蔽",
        style: "destructive",
        onPress: () =>
          void mutate(async (signal) => {
            await request(`/v1/me/blocks/${t.author}`, {
              method: "PUT",
              signal,
            });
            if (!signal.aborted && lifetime.current)
              void load(lifetime.current);
          }, "屏蔽未成功，请重试"),
      },
    ]);
  }
  function sendReport(t: Target, reason: string) {
    const intent = reportAttempt.current;
    if (!intent || intent.target !== t.id || intent.reason !== reason)
      reportAttempt.current = { target: t.id, reason, key: randomUUID() };
    const key = reportAttempt.current!.key;
    void mutate(async (signal) => {
      await request("/v1/reports", {
        method: "POST",
        body: { object_type: t.type, object_id: t.id, reason },
        key,
        signal,
      });
      if (!signal.aborted) {
        setTarget(null);
        setReport(false);
        setMessage("已提交举报");
      }
    }, "举报未成功，请重试");
  }
  const reload = () => {
    if (lifetime.current) void load(lifetime.current);
  };
  const visible = readState === "ready" && post;
  return (
    <PageFrame
      compact
      title="动态与回复"
      onBack={onBack}
      footer={
        visible ? (
          <>
            <FormError message={writeError} />
            <View style={s.composer}>
              <TextInput
                accessibilityLabel="回复动态"
                multiline
                maxLength={1000}
                editable={!writing}
                placeholder="分享你的看法"
                placeholderTextColor={tokens.color.textMuted}
                style={s.input}
                value={draft.fields.body}
                onChangeText={(body) => {
                  setDraft(setReplyDraft(actor, id, body));
                  setWriteError(null);
                }}
              />
              <ActionButton
                label={writing ? "发送中" : "发送"}
                busy={writing}
                disabled={!draft.fields.body.trim()}
                onPress={send}
              />
            </View>
          </>
        ) : null
      }
    >
      {message && !target ? (
        <Text accessibilityLiveRegion="polite" style={s.meta}>
          {message}
        </Text>
      ) : null}
      {!visible ? (
        <StatusPanel
          state={readState === "ready" ? "loading" : readState}
          title={
            readState === "unavailable"
              ? "动态已删除或不可查看"
              : readState === "error"
                ? "动态暂时无法加载"
                : "正在加载动态"
          }
          action={
            readState === "unavailable"
              ? { label: "返回司机圈", onPress: onHome }
              : readState === "error"
                ? { label: "重新加载", onPress: reload }
                : undefined
          }
        />
      ) : (
        <>
          <CirclePostCard
            post={post}
            onAuthor={onAuthor}
            onRequest={onRequest}
            onMore={() => {
              setReport(false);
              setTarget({
                id: post.id,
                author: post.author.user_id,
                type: "post",
              });
            }}
          />
          <View style={s.comments}>
            <Text accessibilityRole="header" style={s.section}>
              {post.reply_count ? `回复 ${post.reply_count}` : "还没有回复"}
            </Text>
            {cursor ? (
              <ActionButton
                label="加载较早回复"
                variant="text"
                busy={paging}
                onPress={() => {
                  if (lifetime.current) void load(lifetime.current, cursor);
                }}
              />
            ) : null}
            {[...replies].reverse().map((r) => (
              <View
                key={r.id}
                style={[
                  s.comment,
                  commentId === r.id && {
                    backgroundColor: tokens.color.brandSurface,
                  },
                ]}
              >
                <View style={s.commentHead}>
                  <TextButton
                    label={r.author.display_name}
                    onPress={() => onAuthor(r.author.user_id)}
                  />
                  <Text style={s.meta}>{requestTime(r.created_at)}</Text>
                  <IconButton
                    name="more"
                    label="回复更多操作"
                    onPress={() => {
                      setReport(false);
                      setTarget({
                        id: r.id,
                        author: r.author.user_id,
                        type: "comment",
                      });
                    }}
                  />
                </View>
                <Text selectable style={s.body}>
                  {r.body}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
      {target && visible ? (
        <BottomSheet
          onRequestClose={() => {
            if (!busy.current) setTarget(null);
          }}
        >
          {report ? (
            <>
              <Text style={s.section}>选择举报原因</Text>
              {reportReasons.map((reason) => (
                <ActionButton
                  key={reason}
                  label={reason}
                  secondary
                  disabled={writing}
                  onPress={() => sendReport(target, reason)}
                />
              ))}
            </>
          ) : target.author === actor ? (
            <ActionButton
              label="删除"
              variant="danger"
              disabled={writing}
              onPress={() => remove(target)}
            />
          ) : (
            <>
              <ActionButton
                label="举报"
                secondary
                onPress={() => setReport(true)}
              />
              <ActionButton
                label="屏蔽作者"
                secondary
                onPress={() => block(target)}
              />
            </>
          )}
          <FormError message={message} />
          <ActionButton
            label="取消"
            variant="text"
            disabled={writing}
            onPress={() => setTarget(null)}
          />
        </BottomSheet>
      ) : null}
    </PageFrame>
  );
}
const s = StyleSheet.create({
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    minHeight: 48,
    maxHeight: 110,
    flex: 1,
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: tokens.color.ink,
  },
  comments: {
    gap: 8,
    borderTopWidth: 1,
    borderColor: tokens.color.border,
    paddingTop: 16,
  },
  section: {
    color: tokens.color.ink,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600",
  },
  comment: {
    borderBottomWidth: 1,
    borderColor: tokens.color.border,
    paddingBottom: 12,
    gap: 3,
  },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  body: { color: tokens.color.ink, fontSize: 16, lineHeight: 26 },
  meta: { color: tokens.color.textSecondary, fontSize: 12, lineHeight: 18 },
});
