import { openContributionMenu } from "../../apartments/contribution-entry";
import { useState, useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { MyAccount } from "../../profile/MyAccount";
import { dataRequest } from "../../apartments/client";
import type { ProfileRequest } from "../../profile/profile-session";
import { PageHeader } from "../../ui/PageFrame";
import { ActionButton, FormError } from "../../auth/AuthControls";
import { tokens } from "@abasong/ui";
export default function Profile() {
  const auth = useAuth();
  const request: ProfileRequest = useCallback(
    (path, options) => dataRequest(auth.session!, path, options),
    [auth.session?.access_token],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await auth.signOut();
    } catch (error) {
      setError(error instanceof Error ? error.message : "退出失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  if (auth.phase === "ready" && auth.me && auth.session)
    return (
      <MyAccount
        key={auth.session.user.id}
        request={request}
        onProfile={() => router.push("/account/profile")}
        onAvailability={(enable) =>
          router.push({
            pathname: "/account/availability",
            params: enable ? { enable: "1" } : {},
          })
        }
        onShare={openContributionMenu}
        onMenu={(menu) => {
          if (menu === "apartments") router.push("/apartments/library");
          else if (menu === "requests")
            router.push({ pathname: "/requests", params: { mine: "1" } });
          else if (menu === "applications")
            router.push("/requests/applications");
          else router.push("/account/settings");
        }}
      />
    );
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={{ marginHorizontal: -20 }}>
        <PageHeader title="我的" />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 20, paddingTop: 24, paddingBottom: 24 }}
      >
        {auth.phase === "restoring" ||
        auth.phase === "loading-account" ||
        auth.phase === "signing-out" ? (
          <ActivityIndicator color={tokens.color.brandPrimary} />
        ) : auth.phase === "needs-profile" ? (
          <>
            <Text style={styles.name}>完善个人资料</Text>
            <ActionButton
              label="填写显示名"
              onPress={() => router.push("/auth/profile")}
            />
            <ActionButton
              label="退出登录"
              secondary
              busy={busy}
              onPress={() => void logout()}
            />
          </>
        ) : auth.phase === "logout-error" ? (
          <>
            <FormError message={auth.error} />
            <ActionButton
              label="重试退出"
              busy={busy}
              onPress={() => void logout()}
            />
          </>
        ) : auth.phase === "error" ? (
          <>
            <FormError message={auth.error} />
            {auth.session ? (
              <>
                <ActionButton label="重试" onPress={auth.retryAccount} />
                <ActionButton
                  label="退出登录"
                  secondary
                  busy={busy}
                  onPress={() => void logout()}
                />
              </>
            ) : (
              <ActionButton
                label="重新登录"
                onPress={() => router.push("/auth/phone")}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.name}>欢迎使用 Abasong</Text>
            <ActionButton
              label="登录"
              onPress={() => router.push("/auth/phone")}
            />
          </>
        )}
        <FormError message={error} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 20,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.brandSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontSize: 24,
    fontWeight: "600",
    color: tokens.color.brandPrimary,
  },
  name: { fontSize: 24, fontWeight: "600", color: tokens.color.ink },
  secondary: {
    fontSize: 15,
    lineHeight: 23,
    color: tokens.color.textSecondary,
  },
});
