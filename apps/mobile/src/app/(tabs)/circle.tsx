import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { useAuth } from "../../auth/AuthProvider";
import { AuthResolution } from "../../auth/AuthControls";
import { PageHeader } from "../../ui/PageFrame";
import { StatusPanel } from "../../ui/Feedback";
import { CircleFeed } from "../../circle/CircleFeed";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import {
  openAuthor,
  openCircleRequest,
  openPost,
} from "../../circle/navigation";

export default function Circle() {
  const auth = useAuth();
  const request = useBusinessRequest();
  if (auth.phase === "ready" && auth.session)
    return (
      <CircleFeed
        key={auth.session.user.id}
        request={request}
        onPublish={() => router.push("/circle/new")}
        onNewRequest={() => router.push("/requests/new")}
        onOpen={openPost}
        onAuthor={openAuthor}
        onRequest={openCircleRequest}
      />
    );
  const guest = auth.phase === "guest" || auth.phase === "needs-profile";
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface }}
      edges={["top"]}
    >
      <PageHeader title="司机圈" />
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        {guest ? (
          <StatusPanel
            state="unavailable"
            title="登录后查看司机圈"
            action={{
              label: auth.phase === "guest" ? "登录" : "完善资料",
              onPress: () =>
                router.push(
                  auth.phase === "guest" ? "/auth/phone" : "/auth/profile",
                ),
            }}
          />
        ) : (
          <AuthResolution />
        )}
      </View>
    </SafeAreaView>
  );
}
