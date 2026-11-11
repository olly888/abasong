// Compatibility exports: business routes share the same provider-free UI kit.
import { ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { tokens } from "@abasong/ui";
import { PageFrame as AuthPage } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { useAuth } from "./AuthProvider";
export { PageFrame as AuthPage } from "../ui/PageFrame";
export { ActionButton, Field, FormError } from "../ui/Controls";

export function AuthResolution() {
  const auth = useAuth();
  if (
    auth.phase === "restoring" ||
    auth.phase === "loading-account" ||
    auth.phase === "signing-out"
  )
    return (
      <AuthPage title="正在确认登录">
        <ActivityIndicator color={tokens.color.brandPrimary} />
      </AuthPage>
    );
  if (auth.phase === "logout-error")
    return (
      <AuthPage title="退出登录未完成">
        <FormError message={auth.error} />
        <ActionButton
          label="重试退出"
          onPress={() => {
            void auth.signOut().catch(() => {});
          }}
        />
      </AuthPage>
    );
  if (auth.phase === "error" && auth.session)
    return (
      <AuthPage title="暂时无法连接">
        <FormError message={auth.error} />
        <ActionButton label="重试" onPress={auth.retryAccount} />
        <ActionButton
          label="更改账号"
          secondary
          onPress={() => {
            void auth
              .signOut()
              .then(() => router.dismissTo("/profile"))
              .catch(() => {});
          }}
        />
      </AuthPage>
    );
  return null;
}

export function ApartmentPage(
  props: Omit<Parameters<typeof AuthPage>[0], "compact">,
) {
  return <AuthPage {...props} compact />;
}
