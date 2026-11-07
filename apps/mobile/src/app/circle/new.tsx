import { router } from "expo-router";
import { RequestGate } from "../../requests/RequestUi";
import { useAuth } from "../../auth/AuthProvider";
import { CircleComposer } from "../../circle/CircleComposer";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import { backToCircle } from "../../circle/navigation";
function Composer() {
  const { session } = useAuth();
  const request = useBusinessRequest();
  return session ? (
    <CircleComposer
      key={session.user.id}
      request={request}
      actor={session.user.id}
      onBack={backToCircle}
      onDone={(post) =>
        router.replace({ pathname: "/circle/[id]", params: { id: post.id } })
      }
    />
  ) : null;
}
export default function Route() {
  return (
    <RequestGate title="发布动态">
      <Composer />
    </RequestGate>
  );
}
