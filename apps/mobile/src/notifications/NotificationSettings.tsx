import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "../apartments/client";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { typeStyles } from "../ui/foundation";
import { pushPermission, registerPush } from "./registration";
type Preferences = components["schemas"]["Preferences"];
export function NotificationSettingsView(p: {
  preferences: Preferences | null;
  status: string;
  enabled: boolean;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onChange: (value: Preferences) => void;
  onReload: () => void;
  onBack?: () => void;
}) {
  return (
    <PageFrame compact title="通知设置" onBack={p.onBack}>
      <Text style={typeStyles.body}>{p.status}</Text>
      {!p.enabled ? (
        <ActionButton
          label="开启系统通知"
          disabled={p.busy}
          onPress={p.onEnable}
        />
      ) : null}
      {p.preferences ? (
        (
          Object.entries({
            chat_push: "聊天消息",
            request_push: "支援需求更新",
            system_push: "系统通知",
          }) as [keyof Preferences, string][]
        ).map(([key, label]) => (
          <View
            key={key}
            style={{
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Text style={[typeStyles.body, { flex: 1 }]}>{label}</Text>
            <Switch
              accessibilityLabel={label}
              value={p.preferences![key]}
              disabled={p.busy}
              trackColor={{ true: tokens.color.brandPrimary }}
              onValueChange={(value) =>
                p.onChange({ ...p.preferences!, [key]: value })
              }
            />
          </View>
        ))
      ) : (
        <ActionButton
          label="重新加载通知偏好"
          secondary
          disabled={p.busy}
          onPress={p.onReload}
        />
      )}
      <Text style={typeStyles.secondary}>
        关闭系统通知后，站内消息仍会保留。
      </Text>
      <FormError message={p.error} />
    </PageFrame>
  );
}
export default function NotificationSettings() {
  const a = useAuth(),
    [preferences, setPreferences] = useState<Preferences | null>(null),
    [status, setStatus] = useState("正在读取系统通知状态"),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    scope = useRef(0),
    working = useRef(false);
  const load = useCallback(async () => {
    const g = ++scope.current;
    if (!a.session) return;
    setBusy(true);
    setError(null);
    try {
      const [pref, permission] = await Promise.all([
        dataRequest<Preferences>(a.session, "/v1/me/notification-preferences"),
        pushPermission(),
      ]);
      if (g !== scope.current) return;
      setPreferences(pref);
      setEnabled(permission === "granted");
      setStatus(
        permission === "granted"
          ? "已允许系统通知"
          : permission === "denied"
            ? "系统通知已关闭"
            : "系统通知尚未开启",
      );
    } catch {
      if (g === scope.current) setError("通知设置暂时无法加载，请重试");
    } finally {
      if (g === scope.current) setBusy(false);
    }
  }, [a.session?.access_token]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        scope.current++;
      };
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => sub.remove();
  }, [load]);
  async function change(value: Preferences) {
    if (!a.session || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const g = scope.current;
    try {
      const result = await dataRequest<Preferences>(
        a.session,
        "/v1/me/notification-preferences",
        { method: "PUT", body: value },
      );
      if (g === scope.current) setPreferences(result);
    } catch {
      if (g === scope.current) setError("未能保存通知偏好，请重试");
    } finally {
      working.current = false;
      if (g === scope.current) setBusy(false);
    }
  }
  async function enable() {
    if (!a.session || working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const g = scope.current;
    try {
      if ((await pushPermission()) === "denied") {
        await Linking.openSettings();
        return;
      }
      const result = await registerPush(a.session, true);
      if (g === scope.current) {
        setEnabled(result);
        setStatus(result ? "系统通知已启用" : "系统通知暂时无法启用");
      }
    } catch {
      if (g === scope.current) setError("未能启用系统通知，请稍后重试");
    } finally {
      working.current = false;
      if (g === scope.current) setBusy(false);
    }
  }
  return (
    <NotificationSettingsView
      {...{ preferences, status, enabled, busy, error }}
      onEnable={() => void enable()}
      onChange={(p) => void change(p)}
      onReload={() => void load()}
    />
  );
}
