import { useCallback, useState } from "react";
import { AppState, Linking } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import {
  ApartmentPage,
  ActionButton,
  FormError,
} from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { useBusinessRequest } from "../../auth/useBusinessRequest";
import type { Circle } from "../../circle/session";
import { ListRow } from "../../ui/Primitives";

export default function Settings() {
  const auth = useAuth();
  const request = useBusinessRequest();
  const [hasBlocks, setHasBlocks] = useState(false);
  const [permission, setPermission] = useState("查看系统权限");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  async function openSettings() {
    try {
      await Linking.openSettings();
    } catch {
      setError("无法打开系统设置，请手动打开");
    }
  }
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await auth.signOut();
    } catch {
      setError("退出失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ApartmentPage title="设置">
      {auth.session ? (
        <ListRow
          title="通知设置"
          icon="message"
          onPress={() => router.push("/account/notifications")}
        />
      ) : null}
      {hasBlocks ? (
        <ListRow
          title="已屏蔽用户"
          icon="person"
          onPress={() => router.push("/account/blocks")}
        />
      ) : null}
      <ListRow
        title="位置权限"
        subtitle={permission}
        onPress={() => void openSettings()}
      />
      {auth.session ? (
        <ActionButton
          label="退出登录"
          secondary
          busy={busy}
          onPress={() => void signOut()}
        />
      ) : null}
      <FormError message={error} />
    </ApartmentPage>
  );
}
