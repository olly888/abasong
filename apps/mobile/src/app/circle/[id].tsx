import { router, useLocalSearchParams } from "expo-router";
import { RequestGate } from "../../requests/RequestUi";
import { useAuth } from "../../auth/AuthProvider";
import { CircleDetail } from "../../circle/CircleDetail";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import {
  backToCircle,
  openAuthor,
  openCircleRequest,
} from "../../circle/navigation";

function Detail() {
  const { id, comment } = useLocalSearchParams<{
    id: string;
    comment?: string;
  }>();
  const { session } = useAuth();
  const request = useBusinessRequest();
  return session ? (
    <CircleDetail
      key={id}
      actor={session.user.id}
      id={id}
      commentId={comment}
      request={request}
      onBack={backToCircle}
      onHome={() => router.dismissTo("/(tabs)/circle")}
      onAuthor={openAuthor}
      onRequest={openCircleRequest}
    />
  ) : null;
}
export default function Route() {
  return (
    <RequestGate title="动态与回复">
      <Detail />
    </RequestGate>
  );
}
