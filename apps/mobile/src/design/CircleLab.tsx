import { useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { CircleFeed } from "../circle/CircleFeed";
import { CircleComposer } from "../circle/CircleComposer";
import { CircleDetail } from "../circle/CircleDetail";
import { InboxContent } from "../messages/InboxScreen";
import {
  nativeExitTransport,
  type ExitActor,
  type ExitFixture,
} from "./native-exit-transport";
import { ActionButton, FormError } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";

const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";
type Fixture = ExitFixture & { scenario: string };
export default function CircleLab() {
  return __DEV__ && Platform.OS !== "web" ? (
    <Lab />
  ) : (
    <Redirect href="/(tabs)/circle" />
  );
}
function Lab() {
  const params = useLocalSearchParams<{
    actor?: string;
    mode?: string;
    id?: string;
    comment?: string;
  }>();
  const actor: ExitActor = params.actor === "driver" ? "driver" : "owner";
  const request = useMemo(() => nativeExitTransport(base, actor), [actor]);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const c = new AbortController();
    void request<Fixture>("/fixture", { signal: c.signal })
      .then((f) => {
        if (f.isolated && f.scenario === "circle") setFixture(f);
        else setError("需要 B5-03 本机隔离服务");
      })
      .catch(() => {
        if (!c.signal.aborted) setError("本机隔离服务未就绪");
      });
    return () => c.abort();
  }, [request]);
  const link = (mode: string, id?: string, comment?: string, who = actor) => ({
    pathname: "/circle-lab" as const,
    params: {
      actor: who,
      mode,
      ...(id ? { id } : {}),
      ...(comment ? { comment } : {}),
    },
  });
  const back = () =>
    router.canGoBack() ? router.back() : router.replace(link("feed"));
  const open = (id: string, comment?: string) =>
    router.push(link("detail", id, comment));
  const info = (label: string) => setNote(label);
  const arm = async (operation: "circle_post" | "circle_reply") => {
    try {
      await request("/fixture/control", {
        method: "POST",
        body: { action: "fault", operation, after: true },
      });
      setNote("TEST · 已设一次响应丢失");
    } catch {
      setNote("TEST · 设置失败");
    }
  };
  if (!fixture)
    return (
      <PageFrame compact title="TEST · B5-03">
        <FormError message={error} />
        <Text>仅本机隔离服务</Text>
      </PageFrame>
    );
  if (params.mode === "compose")
    return (
      <CircleComposer
        request={request}
        actor={fixture[actor]}
        onBack={back}
        onDone={(post) => router.replace(link("detail", post.id))}
      />
    );
  if (params.mode === "detail" && params.id)
    return (
      <CircleDetail
        key={params.id}
        actor={fixture[actor]}
        id={params.id}
        request={request}
        commentId={params.comment}
        onBack={back}
        onHome={() => router.replace(link("feed"))}
        onAuthor={() => info("TEST · 作者")}
        onRequest={() => info("TEST · 需求")}
      />
    );
  if (params.mode === "inbox")
    return (
      <InboxContent
        request={request}
        initialTab="notifications"
        onPost={open}
        onBack={back}
      />
    );
  return (
    <CircleFeed
      key={actor}
      request={request}
      header={
        <View style={{ paddingHorizontal: 12 }}>
          <Text>
            TEST · {actor === "owner" ? "发布人" : "司机"}
            {note ? " · " + note : ""}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <ActionButton
              label={actor === "owner" ? "切换司机" : "切换发布人"}
              variant="text"
              onPress={() =>
                router.replace(
                  link(
                    "feed",
                    undefined,
                    undefined,
                    actor === "owner" ? "driver" : "owner",
                  ),
                )
              }
            />
            <ActionButton
              label="回复通知"
              variant="text"
              onPress={() => router.push(link("inbox"))}
            />
            <ActionButton
              label="测试发布重试"
              variant="text"
              onPress={() => void arm("circle_post")}
            />
            <ActionButton
              label="测试回复重试"
              variant="text"
              onPress={() => void arm("circle_reply")}
            />
          </View>
        </View>
      }
      onPublish={() => router.push(link("compose"))}
      onNewRequest={() => info("TEST · 复用发需求")}
      onOpen={open}
      onAuthor={() => info("TEST · 作者")}
      onRequest={() => info("TEST · 需求")}
    />
  );
}
