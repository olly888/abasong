import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../auth/AuthProvider";
import { notificationTarget } from "./routing";
import {
  notificationSdk,
  registerPush,
  setPushOwner,
  drainPushRevocations,
} from "./registration";
export function NotificationBridge() {
  const a = useAuth(),
    session = a.phase === "ready" ? a.session : null;
  useEffect(() => {
    setPushOwner(session?.user.id ?? null);
    if (Platform.OS === "web") return;
    let live = true,
      seen = "",
      cleanup = () => {};
    const refresh = () => {
      if (session && AppState.currentState === "active")
        void registerPush(session).catch(() => {});
      else void drainPushRevocations().catch(() => {});
    };
    refresh();
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    const timer = setInterval(refresh, 3600000);
    void notificationSdk()
      .then(async (n) => {
        if (!live) return;
        n.setNotificationHandler({
          handleNotification: async (notification) => {
            const data = notification.request.content.data;
            const visible =
              !!notificationTarget(data, session?.user.id ?? null) ||
              (__DEV__ && data?.test === true);
            return {
              shouldShowBanner: visible,
              shouldShowList: visible,
              shouldPlaySound: visible,
              shouldSetBadge: false,
            };
          },
        });
        const response = (
          r: import("expo-notifications").NotificationResponse,
        ) => {
          if (
            !live ||
            !session ||
            r.actionIdentifier !== n.DEFAULT_ACTION_IDENTIFIER ||
            seen === r.notification.request.identifier
          )
            return;
          seen = r.notification.request.identifier;
          const target = notificationTarget(
            r.notification.request.content.data,
            session.user.id,
          );
          void n.clearLastNotificationResponseAsync().catch(() => {});
          if (target) router.push(target);
        };
        const sub = n.addNotificationResponseReceivedListener(response);
        cleanup = () => sub.remove();
        const last = await n.getLastNotificationResponseAsync();
        if (last) response(last);
      })
      .catch(() => {});
    return () => {
      live = false;
      setPushOwner(null);
      clearInterval(timer);
      app.remove();
      cleanup();
    };
  }, [session?.user.id, session?.access_token]);
  return null;
}
