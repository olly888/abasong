import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import { RequestGate } from "../../requests/RequestUi";
import { DeliveryEditor } from "../../requests/DeliveryEditor";
import type { ContributionRequest } from "../../apartments/contribution-address-search";
import type { DeliveryRequest } from "../../requests/presentation";
export default function NewRequest() {
  return (
    <RequestGate>
      <Form />
    </RequestGate>
  );
}
function Form() {
  const { session, me } = useAuth(),
    params = useLocalSearchParams<{ edit?: string; copy?: string }>();
  const [initial, setInitial] = useState<DeliveryRequest | null>(null),
    [regions, setRegions] = useState<components["schemas"]["Region"][]>([]),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const request: ContributionRequest = useCallback(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      request<components["schemas"]["RegionPage"]>("/v1/regions?limit=100", {
        signal: c.signal,
      }),
      params.edit || params.copy
        ? request<DeliveryRequest>(
            `/v1/requests/${encodeURIComponent(params.edit ?? params.copy!)}`,
            { signal: c.signal },
          )
        : Promise.resolve(null),
    ])
      .then(([page, r]) => {
        if (c.signal.aborted) return;
        if (r && r.publisher.user_id !== session?.user.id)
          throw new Error("当前需求不能编辑");
        if (r && !("request_schema_version" in r))
          throw new Error("这条历史需求请重新发布为两场景需求");
        setRegions(page.items);
        setInitial(r);
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "表单读取失败");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [request, params.edit, params.copy, revision]);
  if (loading || error)
    return (
      <AuthPage compact title="发需求">
        {loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <FormError message={error} />
            <ActionButton
              label="重新加载"
              onPress={() => setRevision((n) => n + 1)}
            />
          </>
        )}
      </AuthPage>
    );
  return (
    <DeliveryEditor
      key={revision}
      request={request}
      regions={regions}
      initial={initial}
      copy={!!params.copy}
      identity={me?.profile.display_name ?? "本人"}
      onOpenTeam={() => router.push("/account/team")}
      onReload={() => setRevision((n) => n + 1)}
      onDone={(r) =>
        router.replace({ pathname: "/requests/[id]", params: { id: r.id } })
      }
    />
  );
}
