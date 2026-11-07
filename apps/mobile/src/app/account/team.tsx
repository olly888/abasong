import { useCallback } from "react";
import { router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { RequestGate } from "../../requests/RequestUi";
import { dataRequest } from "../../apartments/client";
import { TeamEditor } from "../../teams/TeamEditor";
import type { TeamRequest } from "../../teams/team-client";

export default function TeamRoute() {
  return (
    <RequestGate title="团队资料（DSP）">
      <Editor />
    </RequestGate>
  );
}
function Editor() {
  const { session, me } = useAuth();
  const request: TeamRequest = useCallback(
    (path, options) => dataRequest(session!, path, options),
    [session?.access_token],
  );
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/profile");
  return (
    <TeamEditor
      request={request}
      contactName={me?.profile.display_name ?? "本人"}
      onBack={back}
      onSaved={back}
      onProfile={() => router.push("/account/profile")}
    />
  );
}
