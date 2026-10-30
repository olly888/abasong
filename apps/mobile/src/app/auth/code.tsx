import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '../../auth/AuthProvider';
import {
  ActionButton,
  AuthPage,
  Field,
  FormError,
  AuthResolution,
} from '../../auth/AuthControls';
import { maskedPhone } from '../../auth/phone';
export default function VerifyCode() {
  const auth = useAuth();
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (
    auth.phase === 'signing-out' ||
    auth.phase === 'logout-error' ||
    auth.phase === 'restoring' ||
    auth.phase === 'loading-account' ||
    (auth.phase === 'error' && auth.session)
  )
    return <AuthResolution />;
  if (auth.phase === 'ready') return <Redirect href="/profile" />;
  if (auth.phase === 'needs-profile') return <Redirect href="/auth/profile" />;
  if (!auth.pendingPhone) return <Redirect href="/auth/phone" />;
  const remaining = Math.max(0, Math.ceil((auth.resendAt - now) / 1000));
  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCode(code);
    } catch (error) {
      setCode('');
      setError(error instanceof Error ? error.message : '验证码验证失败');
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!auth.pendingPhone) return;
    setBusy(true);
    setError(null);
    try {
      await auth.sendCode(auth.pendingPhone);
      setCode('');
    } catch (error) {
      setError(error instanceof Error ? error.message : '暂时无法重新发送');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPage
      title="输入验证码"
      subtitle={`验证码已发送至 ${maskedPhone(auth.pendingPhone)}`}
    >
      <Field
        label="验证码"
        value={code}
        onChangeText={(value) => {
          setCode(value.replace(/\D/g, ''));
          setError(null);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={10}
        editable={!busy}
        autoFocus
      />
      <FormError message={error ?? auth.error} />
      <ActionButton
        label="验证并继续"
        onPress={() => void verify()}
        busy={busy}
        disabled={!/^\d{6,10}$/.test(code)}
      />
      <ActionButton
        label={remaining ? `${remaining} 秒后重新发送` : '重新发送'}
        onPress={() => void resend()}
        disabled={remaining > 0 || busy}
        secondary
      />
      <ActionButton
        label="更改号码"
        secondary
        onPress={() => {
          setCode('');
          router.back();
        }}
        disabled={busy}
      />
    </AuthPage>
  );
}
