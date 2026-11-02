import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, FormError } from "../auth/AuthControls";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "./client";
import { AddressLine } from "./AddressLine";
type S = components["schemas"];
type Row = {
  source: S["ContributionSummary"];
  value?: string | null;
  failed?: boolean;
};
export function contributionStatus(s: S["ContributionSummary"]) {
  return s.status === "withdrawn"
    ? "本人已撤回"
    : s.status === "corrected"
      ? "本人已纠正"
      : s.record_status === "active"
        ? "已共享"
        : "已停止展示";
}
export function SharedContributions() {
  const auth = useAuth(),
    session = auth.session!;
  const [rows, setRows] = useState<Row[]>([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const controller = useRef(new AbortController()),
    epoch = useRef(0),
    writing = useRef(false),
    keys = useRef(new Map<string, string>());
  const canRead = auth.me?.capabilities.includes("access.read");
  const request = <T,>(
    path: string,
    options: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, path, {
      ...options,
      signal: controller.current.signal,
    });
  useEffect(
    () => { controller.current=new AbortController(); const current=controller.current; return () => {
      current.abort();
      keys.current.clear();
    }; },
    [],
  );
  async function load(cursor?: string) {
    const generation = ++epoch.current;
    setBusy(true);
    setError(null);
    try {
      const page = await request<S["ContributionSummaryPage"]>(
        "/v1/me/contributions?limit=20" + (cursor ? "&cursor=" + cursor : ""),
      );
      const items: Row[] = page.items.map((source) => ({ source }));
      // Small bounded groups; metadata/withdrawal remain usable without secret qualification.
      if (canRead)
        for (let i = 0; i < items.length; i += 4) {
          if (generation !== epoch.current || controller.current.signal.aborted)
            return;
          await Promise.all(
            items.slice(i, i + 4).map(async (row) => {
              if (
                row.source.status !== "active" ||
                row.source.record_status !== "active"
              )
                return;
              try {
                const d = await request<S["ContributionDetail"]>(
                  "/v1/me/contributions/" + row.source.id,
                );
                row.source = d.source;
                row.value = d.value;
              } catch {
                row.failed = true;
              }
            }),
          );
        }
      if (generation !== epoch.current || controller.current.signal.aborted)
        return;
      setRows((old) =>
        cursor
          ? [
              ...old,
              ...items.filter(
                (r) => !old.some((x) => x.source.id === r.source.id),
              ),
            ]
          : items,
      );
      setNext(page.next_cursor);
    } catch (e) {
      if (generation === epoch.current && !controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        epoch.current++;
      };
    }, [session.user.id, canRead]),
  );
  function withdraw(s: S["ContributionSummary"]) {
    if (writing.current) return;
    Alert.alert(
      "撤回我的贡献？",
      s.other_source_count
        ? "其他司机仍在共享此密码，撤回仅结束你的贡献。"
        : "撤回后，这条密码将停止共享。历史记录保留。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认撤回",
          style: "destructive",
          onPress: () =>
            void (async () => {
              if (writing.current) return;
              writing.current = true;
              setBusy(true);
              setError(null);
              const intent = s.id + ":" + s.version;
              let key = keys.current.get(intent);
              if (!key) {
                key = randomUUID();
                keys.current.set(intent, key);
              }
              try {
                const result = await request<S["ContributionChangeResult"]>(
                  "/v1/me/contributions/" + s.id + "/withdraw",
                  {
                    method: "POST",
                    body: { expected_version: s.version },
                    key,
                  },
                );
                if (controller.current.signal.aborted) return;
                // Commit is known: remove plaintext immediately, then only retry reads.
                keys.current.delete(intent);
                setRows((old) =>
                  old.map((r) =>
                    r.source.id === s.id ? { source: result.source } : r,
                  ),
                );
                await load();
              } catch (e) {
                if (!controller.current.signal.aborted)
                  setError(e instanceof Error ? e.message : "撤回失败，请重试");
              } finally {
                writing.current = false;
                setBusy(false);
              }
            })(),
        },
      ],
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <FormError message={error} />
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="正在读取共享记录"
          color={tokens.color.brandPrimary}
        />
      ) : null}
      {!busy && !rows.length && !error ? (
        <Text style={styles.muted}>还没有共享记录</Text>
      ) : null}
      {rows.map(({ source: s, value, failed }) => (
        <View style={styles.card} key={s.id}>
          <View style={styles.heading}>
            <Text style={styles.status}>{contributionStatus(s)}</Text>
            <Text style={styles.muted}>{s.scope_label}</Text>
          </View>
          <AddressLine line={s.address_label} compact />
          {value ? (
            <Text selectable style={styles.code}>
              {value}
            </Text>
          ) : s.status === "active" ? (
            <Text style={styles.muted}>
              {!canRead
                ? "暂无资料查看资格"
                : failed
                  ? "密码暂未读到，请刷新重试"
                  : s.record_status === "active"
                    ? "暂不可读"
                    : "已停止展示"}
            </Text>
          ) : null}
          <Text style={styles.muted}>
            {new Date(s.occurred_at).toLocaleString()} 贡献
          </Text>
          <View style={styles.feedback}>
            <Text>{s.useful_count} 有用</Text>
            <Text>{s.not_useful_count} 不能用</Text>
          </View>
          {s.last_feedback_at ? (
            <Text style={styles.muted}>
              最近反馈 {new Date(s.last_feedback_at).toLocaleString()}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {s.can_correct ? (
              <Pressable
                accessibilityRole="button"
                style={styles.action}
                disabled={busy}
                onPress={() =>
                  router.push({
                    pathname: "/apartments/contribution",
                    params: { source_id: s.id },
                  })
                }
              >
                <Text style={styles.actionLabel}>纠正密码</Text>
              </Pressable>
            ) : null}
            {s.can_withdraw_record ? (
              <Pressable
                accessibilityRole="button"
                style={styles.action}
                disabled={busy}
                onPress={() => withdraw(s)}
              >
                <Text
                  style={[styles.actionLabel, { color: tokens.color.danger }]}
                >
                  撤回我的贡献
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/",
                  params: { apartment_id: s.apartment_id },
                })
              }
            >
              <Text style={styles.actionLabel}>在地图查看</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <ActionButton
        label={error ? "重新读取" : "刷新记录"}
        secondary
        busy={busy}
        onPress={() => void load()}
      />
      {next ? (
        <ActionButton
          label="加载更多"
          secondary
          busy={busy}
          onPress={() => void load(next)}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 12,
    backgroundColor: tokens.color.surface,
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  status: { fontSize: 13, fontWeight: "600", color: tokens.color.brandPrimary },
  muted: { fontSize: 13, color: tokens.color.textSecondary, lineHeight: 20 },
  code: { fontSize: 30, fontWeight: "700", color: tokens.color.ink },
  feedback: { flexDirection: "row", gap: 24, flexWrap: "wrap" },
  actions: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderColor: tokens.color.border,
  },
  action: { minHeight: 48, justifyContent: "center", paddingHorizontal: 2 },
  actionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: tokens.color.brandPrimary,
  },
});
