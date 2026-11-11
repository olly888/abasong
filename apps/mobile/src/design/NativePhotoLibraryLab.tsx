import { useEffect, useMemo, useState } from "react";
import { Platform, Text } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import {
  LibraryContent,
  type LibraryParams,
} from "../apartments/LibraryContent";
import { ImportSession } from "../imports/ImportScreen";
import { ActionButton, FormError } from "../ui/Controls";
import { PageFrame } from "../ui/PageFrame";
import {
  nativeExitTransport,
  type ExitActor,
  type ExitFixture,
} from "./native-exit-transport";

const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";

export default function NativePhotoLibraryLab() {
  const { role, run } = useLocalSearchParams<{ role?: string; run?: string }>();
  return __DEV__ && Platform.OS !== "web" ? (
    <Lab
      key={`${role}:${run}`}
      actor={role === "driver" ? "driver" : "owner"}
    />
  ) : (
    <Redirect href="/" />
  );
}

function Lab({ actor }: { actor: ExitActor }) {
  const transport = useMemo(() => nativeExitTransport(base, actor), [actor]);
  const [userId, setUserId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "import" | "library">("home");
  const [params, setParams] = useState<LibraryParams>({});
  useEffect(() => {
    const controller = new AbortController();
    void transport<ExitFixture & { scenario: string }>("/fixture", {
      signal: controller.signal,
    })
      .then((fixture) => {
        if (!fixture.isolated || fixture.scenario !== "contribution")
          throw new Error("请启动本机贡献验收服务");
        if (!controller.signal.aborted) setUserId(fixture[actor]);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("本机隔离验收服务不可用");
      });
    return () => controller.abort();
  }, [actor, transport]);
  if (view === "import" && userId)
    return (
      <ImportSession
        session={{ user: { id: userId } } as Session}
        canContribute
        transport={transport}
        testControls={<Text>TEST · 合成截图，本机隔离库</Text>}
        onOpenLibrary={(destination) => {
          setParams(destination);
          setView("library");
        }}
      />
    );
  if (view === "library" && userId)
    return (
      <LibraryContent
        params={params}
        userId={userId}
        canRead
        canContribute
        transport={transport}
        onBack={() => setView("home")}
      />
    );
  return (
    <PageFrame title="TEST · 截图与我的公寓">
      <Text>
        {actor === "owner" ? "合成账号 A" : "合成账号 B"} · 本机隔离库
      </Text>
      <FormError message={error} />
      <ActionButton
        label="从截图添加"
        disabled={!userId}
        onPress={() => setView("import")}
      />
      <ActionButton
        label="重新打开我的公寓"
        secondary
        disabled={!userId}
        onPress={() => {
          setParams({ tab: "saved" });
          setView("library");
        }}
      />
    </PageFrame>
  );
}
