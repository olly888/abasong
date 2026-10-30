import { useState } from 'react';
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '../../auth/AuthProvider';
import {
  ActionButton,
  AuthPage,
  Field,
  FormError,
  AuthResolution,
} from '../../auth/AuthControls';
import { normalizePhone, phoneCountries } from '../../auth/phone';
import { tokens } from '@abasong/ui';
export default function PhoneLogin() {
  const auth = useAuth();
  const [number, setNumber] = useState(''),
    [country, setCountry] = useState<(typeof phoneCountries)[number]>(
      phoneCountries[0],
    ),
    [choosing, setChoosing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
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
  async function submit() {
    const phone = normalizePhone(number, country.country);
    if (!phone) {
      setError('请输入有效的手机号');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.sendCode(phone);
      router.push('/auth/code');
    } catch (error) {
      setError(error instanceof Error ? error.message : '暂时无法发送验证码');
    } finally {
      setBusy(false);
    }
  }
  const legal = [
    { title: '服务条款', url: process.env.EXPO_PUBLIC_TERMS_URL },
    { title: '隐私政策', url: process.env.EXPO_PUBLIC_PRIVACY_URL },
  ].filter((item) => item.url?.startsWith('https://'));
  return (
    <AuthPage title="手机号登录" subtitle="使用手机号登录 Abasong">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="选择国家或地区"
        disabled={busy}
        onPress={() => setChoosing(true)}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 16, color: tokens.color.ink }}>
          {country.name} {country.code} ⌄
        </Text>
      </Pressable>
      <Field
        label="手机号"
        value={number}
        onChangeText={(value) => {
          setNumber(value);
          setError(null);
        }}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoCapitalize="none"
        maxLength={24}
        editable={!busy}
        placeholder={country.country === 'US' ? '(202) 555-0146' : '手机号'}
      />
      <FormError message={error} />
      <ActionButton
        label="获取验证码"
        onPress={() => void submit()}
        busy={busy}
        disabled={!number.trim()}
      />
      {legal.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 20 }}>
          {legal.map((item) => (
            <Pressable
              key={item.title}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(item.url!)}
            >
              <Text style={{ color: tokens.color.textSecondary, fontSize: 13 }}>
                {item.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Modal
        visible={choosing}
        transparent
        animationType="fade"
        onRequestClose={() => setChoosing(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: '#00000055',
          }}
        >
          <View
            style={{
              padding: 24,
              paddingBottom: 40,
              backgroundColor: '#FFFFFF',
              gap: 8,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            {phoneCountries.map((item) => (
              <Pressable
                key={item.country}
                accessibilityRole="button"
                onPress={() => {
                  setCountry(item);
                  setChoosing(false);
                  setError(null);
                }}
                style={{ minHeight: 56, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 18 }}>
                  {item.name} {item.code}
                </Text>
              </Pressable>
            ))}
            <ActionButton
              label="取消"
              secondary
              onPress={() => setChoosing(false)}
            />
          </View>
        </View>
      </Modal>
    </AuthPage>
  );
}
