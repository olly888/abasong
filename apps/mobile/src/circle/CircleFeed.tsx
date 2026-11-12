import { useCallback, useRef, useState, type ReactNode } from "react";
import { FlatList, View, type ListRenderItemInfo } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { BottomSheet } from "../ui/BottomSheet";
import { ActionButton, FormError } from "../ui/Controls";
import { StatusPanel } from "../ui/Feedback";
import { PageHeader } from "../ui/PageFrame";
import { CirclePostCard, TextButton } from "./CirclePostCard";
import type { Circle, CircleRequest } from "./session";

export function CircleFeed({
  request,
  mine = false,
  header,
  onBack,
  onPublish,
  onNewRequest,
  onOpen,
  onAuthor,
  onRequest,
}: {
  request: CircleRequest;
  mine?: boolean;
  header?: ReactNode;
  onBack?: () => void;
  onPublish: () => void;
  onNewRequest: () => void;
  onOpen: (id: string) => void;
  onAuthor: (id: string) => void;
  onRequest: (id: string) => void;
}) {
  const [rows, setRows] = useState<Circle["Post"][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState(false);
  const [menu, setMenu] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const pages = useRef(1);
  const load = useCallback(
    async (after?: string) => {
      if (ctrl.current) return;
      const c = new AbortController();
      ctrl.current = c;
      setBusy(true);
      setError(false);
      try {
        const items: Circle["Post"][] = [];
        let next = after ?? null;
        // Recheck previously displayed pages on return without resetting scroll depth.
        for (let i = 0; i < (after ? 1 : pages.current); i++) {
          const page = await request<Circle["PostPage"]>(
            `/v1/${mine ? "me/" : ""}posts?limit=20${next ? "&cursor=" + encodeURIComponent(next) : ""}`,
            { signal: c.signal },
          );
          if (c.signal.aborted) return;
          items.push(...page.items);
          next = page.next_cursor;
          if (!next) break;
        }
        if (after) pages.current++;
        setRows((current) =>
          after
            ? [
                ...current,
                ...items.filter((p) => !current.some((x) => x.id === p.id)),
              ]
            : items,
        );
        setCursor(next);
        setVerified(true);
      } catch {
        if (!c.signal.aborted) setError(true);
      } finally {
        if (ctrl.current === c) {
          ctrl.current = null;
          setBusy(false);
        }
      }
    },
    [mine, request],
  );
  useFocusEffect(
    useCallback(() => {
      setVerified(false);
      void load();
      return () => {
        ctrl.current?.abort();
        ctrl.current = null;
        setMenu(false);
        setVerified(false);
      };
    }, [load]),
  );

  const item = ({ item: p }: ListRenderItemInfo<Circle["Post"]>) => (
    <CirclePostCard
      request={request}
      post={p}
      onOpen={() => onOpen(p.id)}
      onAuthor={onAuthor}
      onRequest={onRequest}
    />
  );
  return (
    <SafeAreaView
      edges={mine ? ["top", "bottom"] : ["top"]}
      style={{ flex: 1, backgroundColor: tokens.color.surface }}
    >
      <PageHeader
        title={mine ? "我的发布" : "司机圈"}
        onBack={onBack}
        right={<TextButton label="发布" onPress={() => setMenu(true)} />}
      />
      {header}
      <View style={{ flex: 1 }}>
        <View
          style={{ flex: 1, opacity: verified ? 1 : 0 }}
          pointerEvents={verified ? "auto" : "none"}
          accessibilityElementsHidden={!verified}
          importantForAccessibility={verified ? "auto" : "no-hide-descendants"}
        >
          <FlatList
            data={rows}
            keyExtractor={(p) => p.id}
            renderItem={item}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
            ItemSeparatorComponent={() => (
              <View
                style={{
                  borderBottomWidth: 1,
                  borderColor: tokens.color.border,
                }}
              />
            )}
            refreshing={verified && busy && !cursor}
            onRefresh={() => {
              setVerified(false);
              void load();
            }}
            ListEmptyComponent={
              verified && !busy && !error ? (
                <StatusPanel
                  state="empty"
                  title="还没有动态"
                  action={{ label: "发布动态", onPress: onPublish }}
                />
              ) : undefined
            }
            ListFooterComponent={
              error && verified ? (
                <View>
                  <FormError message="动态暂时无法加载" />
                  <ActionButton
                    label="重试"
                    variant="text"
                    onPress={() => void load(cursor ?? undefined)}
                  />
                </View>
              ) : cursor ? (
                <ActionButton
                  label="加载更多"
                  variant="text"
                  busy={busy}
                  onPress={() => void load(cursor)}
                />
              ) : undefined
            }
          />
        </View>
        {!verified ? (
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", top: 16, left: 20, right: 20 }}
          >
            <StatusPanel
              state={error ? "error" : "loading"}
              title={error ? "动态暂时无法加载" : "正在加载动态"}
              action={
                error
                  ? { label: "重新加载", onPress: () => void load() }
                  : undefined
              }
            />
          </View>
        ) : null}
      </View>
      {menu ? (
        <BottomSheet onRequestClose={() => setMenu(false)}>
          <ActionButton
            label="发动态"
            onPress={() => {
              setMenu(false);
              onPublish();
            }}
          />
          <ActionButton
            label="发配送需求"
            secondary
            onPress={() => {
              setMenu(false);
              onNewRequest();
            }}
          />
          <ActionButton
            label="取消"
            variant="text"
            onPress={() => setMenu(false)}
          />
        </BottomSheet>
      ) : null}
    </SafeAreaView>
  );
}
