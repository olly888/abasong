import { View, Platform } from "react-native";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../ui/Icon";
import { tokens } from "@abasong/ui";
export default function Layout() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        ...(Platform.OS === "web"
          ? ({
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              backgroundColor: tokens.color.surface,
            } as const)
          : {}),
      }}
    >
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tokens.color.brandPrimary,
          tabBarInactiveTintColor: tokens.color.textSecondary,
          tabBarIconStyle: { width: 24, height: 24, marginTop: 6 },
          tabBarLabelStyle: { fontSize: 14, marginBottom: 4 },
          tabBarStyle: {
            backgroundColor: tokens.color.surface,
            height: 60 + Math.max(insets.bottom, 10),
            paddingBottom: Math.max(insets.bottom, 10),
            paddingTop: 4,
            borderTopWidth: 1,
            borderTopColor: tokens.color.border,
            elevation: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "首页",
            tabBarIcon: ({ focused }) => (
              <Icon
                name="home"
                color={
                  focused
                    ? tokens.color.brandPrimary
                    : tokens.color.textSecondary
                }
              />
            ),
          }}
        />
        <Tabs.Screen
          name="circle"
          options={{
            title: "司机圈",
            tabBarIcon: ({ focused }) => (
              <Icon
                name="people"
                color={
                  focused
                    ? tokens.color.brandPrimary
                    : tokens.color.textSecondary
                }
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "我的",
            tabBarIcon: ({ focused }) => (
              <Icon
                name="person"
                color={
                  focused
                    ? tokens.color.brandPrimary
                    : tokens.color.textSecondary
                }
              />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
