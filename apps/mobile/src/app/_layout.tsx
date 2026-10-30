import { Stack } from 'expo-router';
import { View, Platform } from 'react-native';
import { AuthProvider } from '../auth/AuthProvider';
export default function Layout() {
  return (
    <AuthProvider>
      <View
        style={{
          flex: 1,
          ...(Platform.OS === 'web'
            ? ({ width: '100%', maxWidth: 480, alignSelf: 'center' } as const)
            : {}),
        }}
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth/phone" />
          <Stack.Screen name="auth/code" />
          <Stack.Screen name="auth/profile" />
        </Stack>
      </View>
    </AuthProvider>
  );
}
