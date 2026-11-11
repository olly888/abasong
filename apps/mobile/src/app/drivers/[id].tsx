import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { dataRequest } from "../../apartments/client";
import { RequestGate } from "../../requests/RequestUi";
import { DriverProfileView } from "../../drivers/DriverProfileView";
import { RelatedTeam } from "../../teams/RelatedTeam";
import type { TeamRequest } from "../../teams/team-client";
type S = components["schemas"];
export default function Driver() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequestGate title="司机资料">
      <Profile key={id} id={id} />
    </RequestGate>
  );
}
function Profile({ id }: { id: string }) {
  const { session } = useAuth(),
    [driver, setDriver] = useState<S["Driver"] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    scope = useRef(0),
    working = useRef(false),
    key = useRef(randomUUID());
  const request: TeamRequest = useCallback(
    (path, options) => dataRequest(session!, path, options),
    [session?.access_token],
  );
  const load = useCallback(async () => {
    if (!session) return;
    const g = ++scope.current;
    setBusy(true);
    setError(null);
    try {
      const d = await dataRequest<S["Driver"]>(session, `/v1/drivers/${id}`);
      if (g === scope.current) setDriver(d);
    } catch (e) {
      if (g === scope.current) {
        setDriver(null);
        setError(e instanceof Error ? e.message : "司机资料暂不可用");
      }
    } finally {
      if (g === scope.current) setBusy(false);
    }
  }, [id, session?.access_token]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        scope.current++;
      };
    }, [load]),
  );
  async function contact() {
    if (!session || !driver || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const g = scope.current;
    try {
      const c = await dataRequest<S["Conversation"]>(
        session,
        "/v1/conversations",
        { method: "POST", key: key.current, body: { other_user_id: id } },
      );
      if (g === scope.current)
        router.push({ pathname: "/conversations/[id]", params: { id: c.id } });
    } catch (e) {
      if (g === scope.current)
        setError(e instanceof Error ? e.message : "暂时无法联系，请重试");
    } finally {
      working.current = false;
      if (g === scope.current) setBusy(false);
    }
  }
  return (
    <DriverProfileView
      {...{ driver, busy, error }}
      canContact={!!driver && id !== session?.user.id}
      team={
        driver ? (
          <RelatedTeam
            key={id}
            path={`/v1/drivers/${id}/team`}
            request={request}
          />
        ) : null
      }
      onContact={() => void contact()}
      onReload={() => void load()}
    />
  );
}
