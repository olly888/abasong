import { useCallback } from "react";
import { router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { RequestGate } from "../../requests/RequestUi";
import { dataRequest } from "../../apartments/client";
import { ProfileEditor } from "../../profile/ProfileEditor";
import type { ProfileRequest } from "../../profile/profile-session";
export default function ProfileRoute() {
  return (
    <RequestGate title="个人资料">
      <Editor />
    </RequestGate>
  );
}
function Editor() {
  const auth = useAuth();
  const request: ProfileRequest = useCallback(
    (path, options) => dataRequest(auth.session!, path, options),
    [auth.session?.access_token],
  );
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/profile");
  return (
    <ProfileEditor
      request={request}
      owner={auth.session!.user.id}
      onBack={back}
      onSaved={() => {
        back();
        auth.retryAccount();
      }}
    />
  );
}
