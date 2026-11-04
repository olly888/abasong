import { useCallback, useState, useRef } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import { RequestGate, requestStyles as s } from "../../requests/RequestUi";
import {
  requestPrice,
  requestTime,
  kindLabels,
} from "../../requests/presentation";
type Message = components["schemas"]["Message"];
export default function Conversation() {
  return (
    <RequestGate>
      <Sources />
    </RequestGate>
  );
}
function Sources() {
  const { session } = useAuth(),
    { id } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<Message[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0),
    active = useRef(false);
  async function load(signal?: AbortSignal, next?: string) {
    if (!session || !id) return;
    const current = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const page = await dataRequest<components["schemas"]["MessagePage"]>(
        session,
        `/v1/conversations/${encodeURIComponent(id)}/messages?limit=30${next ? "&cursor=" + encodeURIComponent(next) : ""}`,
        { signal },
      );
      if (signal?.aborted || !active.current || current !== generation.current)
        return;
      setRows((old) =>
        next
          ? [
              ...old,
              ...page.items.filter((x) => !old.some((y) => y.id === x.id)),
            ]
          : page.items,
      );
      setCursor(page.next_cursor);
      const sequence = page.items.at(-1)?.sequence;
      if (sequence)
        await dataRequest(session, `/v1/conversations/${id}/read`, {
          method: "PUT",
          body: { last_read_sequence: sequence },
          signal,
        });
    } catch (e) {
      if (!signal?.aborted && active.current && current === generation.current)
        setError(e instanceof Error ? e.message : "联系记录读取失败");
    } finally {
      if (!signal?.aborted && active.current && current === generation.current)
        setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      const c = new AbortController();
      active.current = true;
      setRows([]);
      setCursor(null);
      void load(c.signal);
      return () => {
        active.current = false;
        generation.current++;
        c.abort();
      };
    }, [session?.access_token, id]),
  );
  return (
    <AuthPage compact title="来源记录">
      <FormError message={error} />
      {busy ? <ActivityIndicator /> : null}
      {error ? (
        <ActionButton label="重新加载" secondary onPress={() => void load()} />
      ) : null}
      {rows.map((m) => (
        <View key={m.id} style={s.card}>
          <Text style={s.secondary}>
            {requestTime(m.created_at)} · 来源需求
          </Text>
          {m.request_snapshot ? (
            <>
              <Text style={s.headline}>
                {kindLabels[
                  m.request_snapshot.kind as keyof typeof kindLabels
                ] ?? "配送求助"}
              </Text>
              <Text style={s.text}>
                {m.request_snapshot.carrier} {m.request_snapshot.route_label}
              </Text>
              {!["vehicle_help", "other_help"].includes(
                m.request_snapshot.kind,
              ) ? (
                <Text style={s.price}>{requestPrice(m.request_snapshot)}</Text>
              ) : null}
              <Text style={s.text}>
                {requestTime(m.request_snapshot.starts_at)}
              </Text>
              <Text style={s.secondary}>
                报名或联系时的条件 · 第 {m.request_snapshot.version} 版
              </Text>
              <ActionButton
                label="查看当前需求"
                secondary
                onPress={() =>
                  router.push({
                    pathname: "/requests/[id]",
                    params: { id: m.request_snapshot!.request_id },
                  })
                }
              />
            </>
          ) : (
            <Text style={s.secondary}>来源需求当前不可见</Text>
          )}
        </View>
      ))}
      {cursor ? (
        <ActionButton
          label="加载更多"
          secondary
          busy={busy}
          onPress={() => void load(undefined, cursor)}
        />
      ) : null}
    </AuthPage>
  );
}
