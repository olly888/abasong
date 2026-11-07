import { useCallback, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import { RequestGate } from "../../requests/RequestUi";
import { PageFrame } from "../../ui/PageFrame";
import { ActionButton, FormError } from "../../ui/Controls";
import { StatusPanel } from "../../ui/Feedback";
import { typeStyles } from "../../ui/foundation";
import type { Circle } from "../../circle/session";

export default function Route() {
  return (
    <RequestGate title="已屏蔽用户">
      <BlockedUsers />
    </RequestGate>
  );
}
function BlockedUsers() {
  const request = useBusinessRequest();
  const [users, setUsers] = useState<Circle["BlockedUser"][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const working = useRef(false);
  const run = useCallback(
    async (work: (signal: AbortSignal) => Promise<void>) => {
      const signal = active.current?.signal;
      if (!signal || signal.aborted || working.current) return;
      working.current = true;
      setBusy(true);
      setError(null);
      try {
        await work(signal);
      } catch {
        if (!signal.aborted) setError("暂时无法更新屏蔽列表，请重试");
      } finally {
        if (!signal.aborted) {
          setBusy(false);
          working.current = false;
        }
      }
    },
    [],
  );
  const load = useCallback(
    (after?: string) =>
      run(async (signal) => {
        const page = await request<Circle["BlockedUserPage"]>(
          `/v1/me/blocks?limit=30${after ? "&cursor=" + encodeURIComponent(after) : ""}`,
          { signal },
        );
        if (!signal.aborted) {
          setUsers((old) =>
            after
              ? [
                  ...old,
                  ...page.items.filter(
                    (u) => !old.some((x) => x.user_id === u.user_id),
                  ),
                ]
              : page.items,
          );
          setCursor(page.next_cursor);
        }
      }),
    [request, run],
  );
  useFocusEffect(
    useCallback(() => {
      const c = new AbortController();
      active.current = c;
      working.current = false;
      void load();
      return () => c.abort();
    }, [load]),
  );
  function unblock(user: Circle["BlockedUser"]) {
    Alert.alert("解除屏蔽？", undefined, [
      { text: "取消", style: "cancel" },
      {
        text: "解除屏蔽",
        onPress: () =>
          void run(async (signal) => {
            await request(`/v1/me/blocks/${user.user_id}`, {
              method: "DELETE",
              signal,
            });
            if (!signal.aborted)
              setUsers((old) => old.filter((u) => u.user_id !== user.user_id));
          }),
      },
    ]);
  }
  return (
    <PageFrame compact title="已屏蔽用户">
      <FormError message={error} />
      {error ? (
        <ActionButton
          label="重新加载"
          variant="text"
          onPress={() => void load()}
        />
      ) : null}
      {users.map((u) => (
        <View
          key={u.user_id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={[typeStyles.body, { flex: 1 }]}>{u.display_name}</Text>
          <ActionButton
            label="解除屏蔽"
            secondary
            disabled={busy}
            onPress={() => unblock(u)}
          />
        </View>
      ))}
      {cursor ? (
        <ActionButton
          label="加载更多"
          variant="text"
          busy={busy}
          onPress={() => void load(cursor)}
        />
      ) : null}
      {busy && !users.length ? (
        <StatusPanel state="loading" title="正在加载" />
      ) : null}
      {!busy && !error && !users.length && !cursor ? (
        <StatusPanel state="empty" title="没有已屏蔽用户" />
      ) : null}
    </PageFrame>
  );
}
