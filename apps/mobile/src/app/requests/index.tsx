import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import {
  RequestGate,
  RequestCard,
  requestStyles,
} from "../../requests/RequestUi";
import type { DeliveryRequest } from "../../requests/presentation";
export default function Requests() {
  return (
    <RequestGate>
      <List />
    </RequestGate>
  );
}
function List() {
  const { session } = useAuth(),
    mine = useLocalSearchParams<{ mine?: string }>().mine === "1";
  const [rows, setRows] = useState<DeliveryRequest[]>([]),
    [regions, setRegions] = useState<Record<string, string>>({}),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  async function load(next?: string, signal?: AbortSignal) {
    const current = ++generation.current;
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const [page, regionPage] = await Promise.all([
        dataRequest<components["schemas"]["RequestPage"]>(
          session,
          `/v1/${mine ? "me/" : ""}requests?limit=20${next ? "&cursor=" + encodeURIComponent(next) : ""}`,
          { signal },
        ),
        dataRequest<components["schemas"]["RegionPage"]>(
          session,
          "/v1/regions?limit=100",
          { signal },
        ),
      ]);
      if (signal?.aborted || current !== generation.current) return;
      setRegions(
        Object.fromEntries(regionPage.items.map((r) => [r.id, r.label])),
      );
      setRows((old) =>
        next
          ? [
              ...old,
              ...page.items.filter((r) => !old.some((x) => x.id === r.id)),
            ]
          : page.items,
      );
      setCursor(page.next_cursor);
    } catch (e) {
      if (!signal?.aborted && current === generation.current)
        setError(e instanceof Error ? e.message : "需求读取失败");
    } finally {
      if (!signal?.aborted && current === generation.current) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      const c = new AbortController();
      void load(undefined, c.signal);
      return () => {
        generation.current++;
        c.abort();
      };
    }, [session?.access_token, mine]),
  );
  return (
    <AuthPage compact title={mine ? "我的发布" : "临时配送支援"}>
      <ActionButton
        label="＋ 发需求"
        onPress={() => router.push("/requests/new")}
      />
      <FormError message={error} />
      {error ? (
        <ActionButton
          label="重新加载"
          secondary
          disabled={busy}
          onPress={() => void load()}
        />
      ) : null}
      {busy ? <ActivityIndicator /> : null}
      {!busy && !error && !rows.length ? (
        <Text style={requestStyles.secondary}>
          {mine ? "还没有发布的需求" : "暂无开放的临时支援需求"}
        </Text>
      ) : null}
      <View style={{ gap: 12 }}>
        {rows.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            region={regions[r.region_id ?? ""]}
            onPress={() =>
              router.push({ pathname: "/requests/[id]", params: { id: r.id } })
            }
          />
        ))}
      </View>
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
