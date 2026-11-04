import { SharedContributions } from "../../apartments/SharedContributions";
import { AddressLine } from "../../apartments/AddressLine";
import { openContributionMenu } from "../../apartments/contribution-entry";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { IconButton } from "../../ui/Primitives";
import { Icon } from "../../ui/Icon";
import { tokens } from "@abasong/ui";
import {
  ActionButton,
  ApartmentPage,
  Field,
  FormError,
} from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { dataRequest } from "../../apartments/client";
type S = components["schemas"];
export default function Library() {
  const a = useAuth();
  return (
    <SensitiveScreen>
      <LibraryContent key={a.session?.user.id} />
    </SensitiveScreen>
  );
}
function LibraryContent() {
  const params = useLocalSearchParams<{ tab?: string; revision?: string }>();
  const [sharedRevision, setSharedRevision] = useState(0);
  const auth = useAuth(),
    session = auth.session!,
    controller = useRef(new AbortController());
  const [items, setItems] = useState<
      (S["LibraryDetail"] & {
        shared?: S["AccessRecord"];
        sharedError?: string;
      })[]
    >([]),
    [tab, setTab] = useState<"saved" | "shared">(
      params.tab === "shared" ? "shared" : "saved",
    ),
    [selected, setSelected] = useState<S["LibraryDetail"] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [region, setRegion] = useState(""),
    [code, setCode] = useState(""),
    [scope, setScope] = useState("大门"),
    [note, setNote] = useState(""),
    [edit, setEdit] = useState<S["PrivateRecord"] | null>(null),
    [next, setNext] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (params.tab === "shared") setTab("shared");
  }, [params.tab, params.revision]);
  const request = <T,>(
    path: string,
    opts: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, path, {
      ...opts,
      signal: controller.current.signal,
    });
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, []);
  async function load(cursor?: string) {
    const version = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const page = await request<S["LibraryPage"]>(
        "/v1/me/apartment-library?limit=20" +
          (cursor ? "&cursor=" + cursor : ""),
      );
      const details = await Promise.all(
        page.items.map(async (e) => {
          const detail = await request<S["LibraryDetail"]>(
            "/v1/me/apartment-library/" + e.id,
          );
          if (
            !detail.records.length &&
            e.apartment_id &&
            auth.me?.capabilities.includes("access.read")
          ) {
            try {
              const shared = await request<S["AccessList"]>(
                "/v1/apartments/" + e.apartment_id + "/access-records",
              );
              return { ...detail, shared: shared.items[0] };
            } catch {
              return { ...detail, sharedError: "共享资料暂不可用" };
            }
          }
          return detail;
        }),
      );
      if (version !== generation.current || controller.current.signal.aborted)
        return;
      setItems((old) => (cursor ? [...old, ...details] : details));
      setNext(page.next_cursor);
    } catch (e) {
      if (version === generation.current && !controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [session.user.id]),
  );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  function choose(item: S["LibraryDetail"]) {
    setSelected(item);
    setRegion(item.entry.region);
    setCode("");
    setNote("");
    setScope("大门");
    setEdit(null);
  }
  async function refreshSelected(id: string) {
    const detail = await request<S["LibraryDetail"]>(
      "/v1/me/apartment-library/" + id,
    );
    choose(detail);
    await load();
  }
  function confirmDelete(label: string, action: () => Promise<void>) {
    Alert.alert(label, "共享贡献不会被删除。", [
      { text: "取消", style: "cancel" },
      { text: "删除", style: "destructive", onPress: () => void run(action) },
    ]);
  }
  if (selected)
    return (
      <ApartmentPage title="公寓详情" onBack={() => setSelected(null)}>
        <AddressLine line={selected.entry.address} expanded />
        {selected.entry.name !== selected.entry.address ? (
          <Text style={styles.muted}>{selected.entry.name}</Text>
        ) : null}
        <FormError message={error} />
        <Text style={styles.label}>我的记录 · 仅自己可见</Text>
        {selected.records.map((r) => (
          <View style={styles.card} key={r.id}>
            <Text style={styles.code}>{r.value}</Text>
            <Text>{r.scope_label}</Text>
            {r.note ? <Text>{r.note}</Text> : null}
            <View style={styles.row}>
              <ActionButton
                label="修改"
                secondary
                disabled={busy}
                onPress={() => {
                  setEdit(r);
                  setCode(r.value);
                  setScope(r.scope_label);
                  setNote(r.note);
                }}
              />
              <ActionButton
                label="删除"
                secondary
                disabled={busy}
                onPress={() =>
                  confirmDelete("删除私人记录？", async () => {
                    await request("/v1/me/private-access-records/" + r.id, {
                      method: "DELETE",
                    });
                    await refreshSelected(selected.entry.id);
                  })
                }
              />
            </View>
            {auth.me?.capabilities.includes("access.contribute") ? (
              <ActionButton
                label="共享这条"
                secondary
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "共享这条资料？",
                    "我确认有权共享给有资格的司机。私人备注不会共享。",
                    [
                      { text: "取消" },
                      {
                        text: "确认共享",
                        onPress: () =>
                          void run(async () => {
                            const result = await request<
                              S["ContributionResult"]
                            >(
                              "/v1/me/private-access-records/" +
                                r.id +
                                "/share",
                              {
                                method: "POST",
                                key: randomUUID(),
                                body: {
                                  expected_version: r.version,
                                  source_attested: true,
                                },
                              },
                            );
                            Alert.alert(
                              result.outcome === "created_pending"
                                ? "历史贡献尚未发布"
                                : "已共享",
                            );
                            await load();
                          }),
                      },
                    ],
                  )
                }
              />
            ) : null}
          </View>
        ))}
        <Text style={styles.label}>
          {edit ? "修改私人记录" : "添加私人记录"}
        </Text>
        <Field
          label="密码"
          value={code}
          onChangeText={setCode}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label="门别"
          value={scope}
          onChangeText={setScope}
          maxLength={100}
        />
        <Field
          label="私人备注"
          value={note}
          onChangeText={setNote}
          maxLength={300}
        />
        <ActionButton
          label="仅自己保存"
          busy={busy}
          disabled={!code.trim() || !scope.trim()}
          onPress={() =>
            void run(async () => {
              await request(
                edit
                  ? "/v1/me/private-access-records/" + edit.id
                  : "/v1/me/apartment-library/" +
                      selected.entry.id +
                      "/records",
                {
                  method: edit ? "PATCH" : "POST",
                  key: randomUUID(),
                  body: {
                    value: code,
                    scope_label: scope,
                    note,
                    ...(edit ? { expected_version: edit.version } : {}),
                  },
                },
              );
              await refreshSelected(selected.entry.id);
            })
          }
        />
        <Field
          label="区域"
          value={region}
          onChangeText={setRegion}
          maxLength={60}
        />
        <ActionButton
          label="保存区域"
          secondary
          busy={busy}
          onPress={() =>
            void run(async () => {
              await request("/v1/me/apartment-library/" + selected.entry.id, {
                method: "PATCH",
                key: randomUUID(),
                body: { expected_version: selected.entry.version, region },
              });
              await refreshSelected(selected.entry.id);
            })
          }
        />
        {selected.entry.apartment_id ? (
          <ActionButton
            label="查看当前共享资料"
            secondary
            onPress={() =>
              router.push({
                pathname: "/apartments",
                params: { apartment_id: selected.entry.apartment_id! },
              })
            }
          />
        ) : null}
        <ActionButton
          label="移除我的公寓"
          secondary
          disabled={busy}
          onPress={() =>
            confirmDelete("移除本人公寓及私人记录？", async () => {
              await request("/v1/me/apartment-library/" + selected.entry.id, {
                method: "DELETE",
              });
              setSelected(null);
              await load();
            })
          }
        />
      </ApartmentPage>
    );
  return (
    <ApartmentPage
      title="我的公寓"
      headerRight={
        <IconButton
          name="refresh"
          label="刷新"
          disabled={busy}
          onPress={() => {
            if (tab === "shared") setSharedRevision((v) => v + 1);
            else void load();
          }}
        />
      }
      footer={
        <>
          <ActionButton
            label="＋ 贡献公寓密码"
            onPress={openContributionMenu}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert("添加私人记录", undefined, [
                {
                  text: "从截图导入",
                  onPress: () => router.push("/apartments/import?mode=private"),
                },
                {
                  text: "快速填写",
                  onPress: () =>
                    router.push("/apartments/contribute?mode=private"),
                },
                { text: "取消", style: "cancel" },
              ])
            }
            style={styles.inline}
          >
            <Text style={styles.link}>添加私人记录</Text>
          </Pressable>
        </>
      }
    >
      <View style={styles.tabs}>
        {(["saved", "shared"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.selectedTab]}
          >
            <Text
              style={[
                styles.tabLabel,
                tab === value && {
                  color: tokens.color.brandPrimary,
                  fontWeight: "600",
                },
              ]}
            >
              {value === "saved" ? "我保存的" : "我共享的"}
            </Text>
          </Pressable>
        ))}
      </View>
      <FormError message={tab === "saved" ? error : null} />
      {tab === "saved" ? (
        <>
          {items.length === 0 && !busy ? (
            <View style={styles.empty}>
              <Icon name="bookmark" size={32} color={tokens.color.textMuted} />
              <Text style={styles.label}>还没有保存的公寓</Text>
            </View>
          ) : null}
          {items.map((d) => (
            <Pressable
              accessibilityRole="button"
              key={d.entry.id}
              style={styles.card}
              onPress={() => choose(d)}
            >
              <AddressLine line={d.entry.address} compact />
              {d.entry.name !== d.entry.address ? (
                <Text style={styles.muted}>{d.entry.name}</Text>
              ) : null}
              <Text style={styles.muted}>
                {d.entry.region} · {d.records.length ? "私人记录" : "收藏公寓"}
              </Text>
              {d.records[0] ? (
                <>
                  <Text style={styles.code}>{d.records[0].value}</Text>
                  <Text>
                    {d.records[0].scope_label}
                    {d.records.length > 1
                      ? ` · 另有 ${d.records.length - 1} 条`
                      : ""}
                  </Text>
                </>
              ) : d.shared ? (
                <>
                  <Text style={styles.code}>{d.shared.value}</Text>
                  <Text>{d.shared.scope.label ?? "大门"} · 共享资料</Text>
                </>
              ) : (
                <>
                  <Text style={styles.muted}>
                    {!auth.me?.capabilities.includes("access.read")
                      ? "共享资料查看资格待审核"
                      : (d.sharedError ?? "暂无共享密码")}
                  </Text>
                  <ActionButton
                    label="查看当前共享资料"
                    secondary
                    onPress={() =>
                      router.push({
                        pathname: "/apartments",
                        params: { apartment_id: d.entry.apartment_id ?? "" },
                      })
                    }
                  />
                </>
              )}
            </Pressable>
          ))}
          {next ? (
            <ActionButton
              label="加载更多"
              busy={busy}
              secondary
              onPress={() => void load(next)}
            />
          ) : null}
        </>
      ) : (
        <SharedContributions
          key={String(params.revision) + ":" + sharedRevision}
        />
      )}
    </ApartmentPage>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 8,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    borderBottomWidth: 1,
    borderColor: tokens.color.border,
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  selectedTab: { borderBottomColor: tokens.color.brandPrimary },
  tabLabel: { fontSize: 15, color: tokens.color.textMuted },
  empty: { alignItems: "center", paddingVertical: 38, gap: 18 },
  inline: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  link: { fontSize: 14, color: tokens.color.brandPrimary },
  code: { fontSize: 30, fontWeight: "700", color: tokens.color.ink },
  label: { fontSize: 18, fontWeight: "600", color: tokens.color.ink },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  muted: { fontSize: 13, color: tokens.color.textSecondary },
});
