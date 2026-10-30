import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "../../auth/AuthProvider";
import { ListRow } from "../../ui/Primitives";
import { ActionButton, FormError } from "../../auth/AuthControls";
import { tokens } from "@abasong/ui";
export default function Profile() {
  const auth = useAuth();
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
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>我的</Text>
      </View>
      <View style={{ gap: 20, marginTop: 24 }}>
        {auth.phase === "restoring" ||
        auth.phase === "loading-account" ||
        auth.phase === "signing-out" ? (
          <ActivityIndicator color={tokens.color.brandPrimary} />
        ) : auth.phase === "ready" && auth.me ? (
          <>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>
                  {auth.me.profile.display_name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.name}>{auth.me.profile.display_name}</Text>
            </View>
            <Text style={styles.secondary}>
              {auth.me.capabilities.includes("access.read")
                ? "公寓资料查看资格已开通"
                : "资料查看资格待审核"}
            </Text>
            <ActionButton
              label="贡献公寓密码"
              onPress={() => router.push("/apartments/contribute")}
            />
            <ListRow
              title="我的公寓"
              icon="bookmark"
              onPress={() => router.push("/apartments/library")}
            />
            <ActionButton
              label="退出登录"
              secondary
              busy={busy}
              onPress={() => void logout()}
            />
          </>
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
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 20,
  },
  header: {
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -20,
    borderBottomWidth: 1,
    borderColor: tokens.color.surfaceMuted,
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
  title: { fontSize: 19, fontWeight: "700", color: tokens.color.ink },
  name: { fontSize: 24, fontWeight: "600", color: tokens.color.ink },
  secondary: {
    fontSize: 15,
    lineHeight: 23,
    color: tokens.color.textSecondary,
  },
});
