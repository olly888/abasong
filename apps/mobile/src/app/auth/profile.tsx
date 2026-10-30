import { useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { Redirect, router } from 'expo-router';
import { useAuth } from '../../auth/AuthProvider';
import {
  ActionButton,
  AuthPage,
  Field,
  FormError,
  AuthResolution,
} from '../../auth/AuthControls';
export default function InitialProfile() {
  const auth = useAuth();
  const [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const intent = useRef<{ name: string; key: string } | null>(null);
  if (
    auth.phase === 'signing-out' ||
    auth.phase === 'logout-error' ||
    auth.phase === 'restoring' ||
    auth.phase === 'loading-account' ||
    (auth.phase === 'error' && auth.session)
  )
    return <AuthResolution />;
  if (auth.phase === 'ready') return <Redirect href="/profile" />;
  if (!auth.session) return <Redirect href="/auth/phone" />;
  async function submit() {
    const value = name.trim();
    if (!value || value.length > 60) {
      setError('请输入1–60字的显示名');
      return;
    }
    if (intent.current?.name !== value)
      intent.current = { name: value, key: randomUUID() };
    setBusy(true);
    setError(null);
    try {
      await auth.completeProfile(value, intent.current.key);
      router.dismissTo('/profile');
    } catch (error) {
      setError(error instanceof Error ? error.message : '暂时无法保存，请重试');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPage
      title="怎么称呼你？"
      subtitle="填写其他司机看到的名字"
      onBack={() => {
        void auth
          .signOut()
          .then(() => router.dismissTo('/profile'))
          .catch(() => setError('暂时无法退出，请重试'));
      }}
    >
      <Field
        label="显示名"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(null);
        }}
        maxLength={60}
        editable={!busy}
        autoComplete="nickname"
        textContentType="nickname"
        autoFocus
      />
      <FormError message={error} />
      <ActionButton
        label="保存并继续"
        onPress={() => void submit()}
        busy={busy}
        disabled={!name.trim()}
      />
    </AuthPage>
  );
}
