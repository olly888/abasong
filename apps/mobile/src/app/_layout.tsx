import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { tokens } from '@abasong/ui';
export default function Layout() {
  return <><StatusBar style="dark" /><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: tokens.color.brandPrimary, tabBarInactiveTintColor: tokens.color.textSecondary, tabBarIcon: () => null, tabBarLabelStyle: { fontSize: 14 }, tabBarStyle: { backgroundColor: tokens.color.surface } }}>
    <Tabs.Screen name="index" options={{ title: '首页' }} />
    <Tabs.Screen name="circle" options={{ title: '司机圈' }} />
    <Tabs.Screen name="profile" options={{ title: '我的' }} />
  </Tabs></>;
}
