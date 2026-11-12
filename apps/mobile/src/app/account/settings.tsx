import { useCallback, useState } from "react";
import { AppState, Linking } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { useAuth } from "../../auth/AuthProvider";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import type { Circle } from "../../circle/session";
import { SettingsPanel } from "../../settings/SettingsPanel";

export default function Settings() {
  const auth = useAuth();
  const request = useBusinessRequest();
  const [hasBlocks, setHasBlocks] = useState(false);
  const [permission, setPermission] = useState("查看系统权限");
  const privacyUrl = process.env.EXPO_PUBLIC_PRIVACY_URL;
  const termsUrl = process.env.EXPO_PUBLIC_TERMS_URL;
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const refresh = () =>
        void Location.getForegroundPermissionsAsync()
          .then((p) => {
            if (live)
              setPermission(p.granted ? "使用时允许定位" : "尚未允许定位");
          })
          .catch(() => {
            if (live) setPermission("查看系统权限");
          });
      refresh();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => {
        live = false;
        sub.remove();
      };
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      setHasBlocks(false);
      if (auth.phase !== "ready") return;
      const c = new AbortController();
      void request<Circle["BlockedUserPage"]>("/v1/me/blocks?limit=1", {
        signal: c.signal,
      })
        .then((page) => {
          if (!c.signal.aborted) setHasBlocks(page.items.length > 0);
        })
        .catch(() => {});
      return () => c.abort();
    }, [auth.phase, request]),
  );
  return (
    <SettingsPanel
      permission={permission}
      onLocation={() => Linking.openSettings()}
      onNotifications={
        auth.session ? () => router.push("/account/notifications") : undefined
      }
      onBlocks={hasBlocks ? () => router.push("/account/blocks") : undefined}
      onPrivacy={
        privacyUrl?.startsWith("https://")
          ? () => Linking.openURL(privacyUrl)
          : undefined
      }
      onTerms={
        termsUrl?.startsWith("https://")
          ? () => Linking.openURL(termsUrl)
          : undefined
      }
      onSignOut={
        auth.session ||
        auth.phase === "logout-error" ||
        auth.phase === "signing-out"
          ? auth.signOut
          : undefined
      }
      signOutNeedsRetry={auth.phase === "logout-error"}
    />
  );
}
