import { useCallback } from "react";
import { router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { dataRequest } from "../../apartments/client";
import { RequestGate } from "../../requests/RequestUi";
import { AvailabilityFlow } from "../../drivers/AvailabilityFlow";
import type { AvailabilityRequest } from "../../drivers/availability-session";
export default function Availability() {
  return (
    <RequestGate title="可接活设置">
      <Editor />
    </RequestGate>
  );
}
function Editor() {
  const { session } = useAuth();
  const request: AvailabilityRequest = useCallback(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/profile");
  return <AvailabilityFlow request={request} onSaved={back} onCancel={back} />;
}
