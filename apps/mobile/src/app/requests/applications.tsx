import { useCallback, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { StatusPanel } from "../../ui/Feedback";
import { dataRequest } from "../../apartments/client";
import { RequestGate, requestStyles as s } from "../../requests/RequestUi";
import { requestTime, requestTitle } from "../../requests/presentation";
type Application = components["schemas"]["Application"];
export default function Applications() {
  return (
    <RequestGate>
      <List />
    </RequestGate>
  );
}
function List() {
  const { session } = useAuth(),
    { request_id, for_request } = useLocalSearchParams<{
      request_id?: string;
      for_request?: string;
    }>();
  const [items, setItems] = useState<Application[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [working, setWorking] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    active = useRef(false),
    lock = useRef(false);
  async function load(next?: string, signal?: AbortSignal) {
    if (!session) return;
    const g = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const path = request_id
        ? `/v1/requests/${encodeURIComponent(request_id)}/applications`
        : "/v1/me/applications";
      const query = new URLSearchParams({ limit: "20" });
      if (for_request && !request_id) query.set("request_id", for_request);
      if (next) query.set("cursor", next);
      const page = await dataRequest<components["schemas"]["ApplicationPage"]>(
        session,
        `${path}?${query}`,
        { signal },
      );
      if (!signal?.aborted && g === generation.current && active.current) {
        setItems((old) =>
          next
            ? [
                ...old,
                ...page.items.filter((x) => !old.some((y) => y.id === x.id)),
              ]
            : page.items,
        );
        setCursor(page.next_cursor);
      }
    } catch (e) {
      if (!signal?.aborted && g === generation.current && active.current)
        setError(e instanceof Error ? e.message : "报名读取失败");
    } finally {
      if (!signal?.aborted && g === generation.current && active.current)
        setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      const c = new AbortController();
      setItems([]);
      setCursor(null);
      void load(undefined, c.signal);
      return () => {
        active.current = false;
        generation.current++;
        c.abort();
      };
    }, [session?.access_token, request_id, for_request]),
  );
  async function mutate(item: Application, withdraw: boolean) {
    if (!session || lock.current) return;
    lock.current = true;
    setWorking(item.id);
    setError(null);
    try {
      await dataRequest(
        session,
        `/v1/applications/${item.id}${withdraw ? "" : "/contacted"}`,
        { method: withdraw ? "DELETE" : "PUT" },
      );
      if (active.current) await load();
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      lock.current = false;
      if (active.current) setWorking(null);
    }
  }
  return (
    <AuthPage compact title={request_id ? "报名司机" : "我的报名"}>
      <FormError message={error} />
      {error ? (
        <ActionButton
          label="重新加载"
          secondary
          disabled={busy}
          onPress={() => void load()}
        />
      ) : null}
      {busy && !items.length ? (
        <StatusPanel state="loading" title="正在加载报名" />
      ) : null}
      {!busy && !error && !items.length ? (
        <StatusPanel state="empty" title="暂无报名" />
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>
              {request_id
                ? (item.applicant_profile?.display_name ?? "用户当前不可见")
                : item.request_summary
                  ? requestTitle(item.request_summary)
                  : "来源需求当前不可见"}
            </Text>
            <Text style={s.status}>
              {item.status === "withdrawn"
                ? "已撤回"
                : item.contacted_at
                  ? "已联系"
                  : "已报名"}
            </Text>
          </View>
          {item.request_summary ? (
            <Text style={s.text}>
              {item.request_summary.carrier} {item.request_summary.route_label}
            </Text>
          ) : null}
          <Text style={s.text}>
            {requestTime(item.expected_arrival_at)}
            {item.capacity_parcels ? ` · 可接 ${item.capacity_parcels} 件` : ""}
          </Text>
          {item.request_summary &&
          item.observed_request_version !== item.request_summary.version ? (
            <Text style={s.status}>需求条件已更新</Text>
          ) : null}
          {request_id
            ? item.applicant_profile?.experience.map((e, i) => (
                <Text style={s.secondary} key={i}>
                  {e.carrier} · {e.region_label} · {e.description}（本人填写）
                </Text>
              ))
            : null}
          {item.request_summary ? (
            <View style={{ gap: 8 }}>
              <ActionButton
                label="查看会话"
                secondary
                disabled={working !== null}
                onPress={() =>
                  router.push({
                    pathname: "/conversations/[id]",
                    params: { id: item.conversation_id },
                  })
                }
              />
              {request_id && item.status === "applied" && !item.contacted_at ? (
                <ActionButton
                  label="标记已联系"
                  busy={working === item.id}
                  onPress={() => void mutate(item, false)}
                />
              ) : null}
              {!request_id ? (
                <ActionButton
                  label="查看当前需求"
                  secondary
                  onPress={() =>
                    router.push({
                      pathname: "/requests/[id]",
                      params: { id: item.request_id },
                    })
                  }
                />
              ) : null}
            </View>
          ) : null}
          {!request_id && item.status === "applied" ? (
            <ActionButton
              label="撤回报名"
              secondary
              disabled={working !== null}
              onPress={() =>
                Alert.alert("撤回这次报名？", undefined, [
                  { text: "取消", style: "cancel" },
                  {
                    text: "撤回报名",
                    style: "destructive",
                    onPress: () => void mutate(item, true),
                  },
                ])
              }
            />
          ) : null}
        </View>
      ))}
      {cursor ? (
        <ActionButton
          label="加载更多"
          secondary
          busy={busy}
          onPress={() => void load(cursor)}
        />
      ) : null}
    </AuthPage>
  );
}
