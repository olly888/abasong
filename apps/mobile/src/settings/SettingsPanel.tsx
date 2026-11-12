import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { ActionButton, FormError } from "../ui/Controls";
import { typeStyles } from "../ui/foundation";
import { PageFrame } from "../ui/PageFrame";
import { ListRow } from "../ui/Primitives";

export function SettingsPanel({
  permission,
  onLocation,
  onNotifications,
  onBlocks,
  onPrivacy,
  onTerms,
  onSignOut,
  signOutNeedsRetry = false,
  onBack,
}: {
  permission: string;
  onLocation: () => Promise<unknown>;
  onNotifications?: () => void;
  onBlocks?: () => void;
  onPrivacy?: () => Promise<unknown>;
  onTerms?: () => Promise<unknown>;
  onSignOut?: () => Promise<void>;
  signOutNeedsRetry?: boolean;
  onBack?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const pending = useRef(false);
  async function open(action: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
    }
  }
  async function signOut() {
    if (!onSignOut || pending.current) return;
    pending.current = true;
    setSigningOut(true);
    try {
      await open(onSignOut, "退出失败，请重试");
    } finally {
      pending.current = false;
      setSigningOut(false);
    }
  }
  return (
    <PageFrame compact title="设置" onBack={onBack}>
      {onNotifications ? (
        <ListRow title="通知设置" icon="bell" onPress={onNotifications} />
      ) : null}
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={typeStyles.label}>
          隐私
        </Text>
        <ListRow
          title="位置权限"
          subtitle={permission}
          onPress={() => void open(onLocation, "无法打开系统设置，请手动打开")}
        />
        {onBlocks ? (
          <ListRow title="已屏蔽用户" icon="person" onPress={onBlocks} />
        ) : null}
        {onPrivacy ? (
          <ListRow
            title="隐私政策"
            icon="shield"
            onPress={() => void open(onPrivacy, "无法打开隐私政策，请重试")}
          />
        ) : null}
        {onTerms ? (
          <ListRow
            title="服务条款"
            icon="shield"
            onPress={() => void open(onTerms, "无法打开服务条款，请重试")}
          />
        ) : null}
      </View>
      {onSignOut ? (
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={typeStyles.label}>
            账号
          </Text>
          <ActionButton
            label={signOutNeedsRetry ? "重试退出" : "退出登录"}
            secondary
            busy={signingOut}
            onPress={() => {
              if (signOutNeedsRetry) {
                void signOut();
                return;
              }
              Alert.alert("退出登录？", "下次使用此账号时需要重新登录。", [
                { text: "取消", style: "cancel" },
                {
                  text: "退出登录",
                  style: "destructive",
                  onPress: () => void signOut(),
                },
              ]);
            }}
          />
        </View>
      ) : null}
      <FormError
        message={error ?? (signOutNeedsRetry ? "退出登录未完成，请重试" : null)}
      />
    </PageFrame>
  );
}
