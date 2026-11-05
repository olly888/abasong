import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import type { components } from "@abasong/contracts";
import { NotificationSettingsView } from "../notifications/NotificationSettings";
import { notificationSdk } from "../notifications/registration";
import { ActionButton } from "../ui/Controls";
import { typeStyles } from "../ui/foundation";

// DEV-only memory preferences plus an explicitly triggered local OS notification.
// This adapter never registers a token or calls a business/push service.
export default function NotificationLab() {
  const [preferences, setPreferences] = useState<
    components["schemas"]["Preferences"]
  >({ chat_push: true, request_push: true, system_push: true });
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function localNotification() {
    setBusy(true);
    try {
      if (Platform.OS === "web") throw new Error();
      const n = await notificationSdk();
      if (Platform.OS === "android")
        await n.setNotificationChannelAsync("collaboration", {
          name: "配送协作",
          importance: n.AndroidImportance.DEFAULT,
        });
      const p = await n.requestPermissionsAsync();
      if (!p.granted) {
        setNotice("TEST · 系统通知未获允许");
        return;
      }
      await n.scheduleNotificationAsync({
        content: {
          title: "Abasong TEST",
          body: "本机通知测试，不含消息或位置",
          data: { test: true },
        },
        trigger: {
          type: n.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 3,
          channelId: "collaboration",
        },
      });
      setNotice("TEST · 已安排本机通知");
    } catch {
      setNotice("TEST · 本机通知暂不可用");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.surface }}>
      <NotificationSettingsView
        preferences={preferences}
        status={enabled ? "TEST · 系统通知已启用" : "TEST · 系统通知尚未开启"}
        enabled={enabled}
        busy={busy}
        error={null}
        onEnable={() => setEnabled(true)}
        onChange={setPreferences}
        onReload={() => {}}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={{ paddingHorizontal: 20, gap: 12 }}
      >
        <Text style={typeStyles.metadata}>
          TEST · 仅内存偏好及本机通知，不调用推送供应商。{notice}
        </Text>
        <ActionButton
          label="测试本机系统通知"
          busy={busy}
          onPress={() => void localNotification()}
        />
      </SafeAreaView>
    </View>
  );
}
