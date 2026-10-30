import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { tokens } from '@abasong/ui';
import { useAuth } from './AuthProvider';
import type { ReactNode } from 'react';
export function AuthPage({
  title,
  subtitle,
  children,
  onBack,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={
              onBack ??
              (() =>
                router.canGoBack() ? router.back() : router.replace('/profile'))
            }
            style={styles.back}
          >
            <Text style={{ fontSize: 32, color: tokens.color.ink }}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <View style={{ gap: 20, marginTop: 32 }}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function ActionButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        secondary && styles.secondary,
        (disabled || busy) && { opacity: 0.45 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? tokens.color.ink : '#FFFFFF'} />
      ) : (
        <Text
          style={[styles.buttonText, secondary && { color: tokens.color.ink }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={tokens.color.textMuted}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function FormError({ message }: { message: string | null }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      style={{ color: tokens.color.danger, fontSize: 14, lineHeight: 22 }}
    >
      {message}
    </Text>
  ) : null;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: tokens.color.surface },
  content: { padding: 24, flexGrow: 1 },
  back: {
    minWidth: 48,
    minHeight: 48,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: tokens.color.ink,
    marginTop: 28,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 25,
    color: tokens.color.textSecondary,
    marginTop: 12,
  },
  label: { fontSize: 14, fontWeight: '600', color: tokens.color.ink },
  input: {
    borderWidth: 1,
    borderColor: tokens.color.controlBorder,
    borderRadius: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    fontSize: 18,
    color: tokens.color.ink,
    backgroundColor: tokens.color.surface,
  },
  button: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: tokens.color.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondary: { backgroundColor: tokens.color.surfaceMuted },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});

export function AuthResolution() {
  const auth = useAuth();
  if (
    auth.phase === 'restoring' ||
    auth.phase === 'loading-account' ||
    auth.phase === 'signing-out'
  )
    return (
      <AuthPage title="正在确认登录">
        <ActivityIndicator color={tokens.color.brandPrimary} />
      </AuthPage>
    );
  if (auth.phase === 'logout-error')
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
  if (auth.phase === 'error' && auth.session)
    return (
      <AuthPage title="暂时无法完成登录">
        <FormError message={auth.error} />
        <ActionButton label="重试" onPress={auth.retryAccount} />
        <ActionButton
          label="更改账号"
          secondary
          onPress={() => {
            void auth
              .signOut()
              .then(() => router.dismissTo('/profile'))
              .catch(() => {});
          }}
        />
      </AuthPage>
    );
  return null;
}
