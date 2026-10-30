import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { ActionButton, AuthPage, AuthResolution } from "../auth/AuthControls";
// Unmount all sensitive child state on background/logout/account refresh; no code persistence.
export function SensitiveScreen({ children }: { children: ReactNode }) {
  const auth = useAuth(),
    [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (s) =>
      setActive(s === "active"),
    );
    return () => listener.remove();
  }, []);
  if (!active) return <AuthPage title="公寓资料">{null}</AuthPage>;
  if (auth.phase === "ready" && auth.session) return <>{children}</>;
  if (["guest", "needs-profile"].includes(auth.phase))
    return (
      <AuthPage title="登录后使用公寓资料">
        <ActionButton
          label={auth.phase === "needs-profile" ? "完善个人资料" : "登录"}
          onPress={() =>
            router.push(
              auth.phase === "needs-profile" ? "/auth/profile" : "/auth/phone",
            )
          }
        />
      </AuthPage>
    );
  return <AuthResolution />;
}
