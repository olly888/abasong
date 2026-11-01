import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ListRow } from "../ui/Primitives";
import { Icon } from "../ui/Icon";
type Apartment = components["schemas"]["Apartment"];
export function HomeArrivalPanel(p: {
  state: "loading" | "nearby" | "ambiguous" | "empty" | "error" | "location";
  message?: string;
  blocked?: boolean;
  candidates: Apartment[];
  onSelect: (apartment: Apartment) => void;
  onContribute: () => void;
  onRetry: () => void;
}) {
  if (p.state === "loading")
    return (
      <View style={s.quiet}>
        <ActivityIndicator color={tokens.color.brandPrimary} />
        <Text style={s.muted}>正在定位</Text>
      </View>
    );
  if (p.state === "location" || p.state === "error")
    return (
      <View style={s.error}>
        <Text style={s.title}>
          {p.state === "error" ? "公寓资料暂时无法加载" : p.message}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={p.onRetry}
          style={s.action}
        >
          <Text style={s.link}>
            {p.state === "error"
              ? "重新加载"
              : p.blocked
                ? "打开系统设置"
                : "使用当前位置"}
          </Text>
        </Pressable>
      </View>
    );
  if (p.candidates.length && p.state !== "empty")
    return (
      <View>
        <Text style={s.title}>
          {p.state === "ambiguous" ? "选择公寓" : "附近公寓"}
        </Text>
        {p.candidates.map((a) => (
          <ListRow
            key={a.id}
            title={a.name ?? a.address_line1}
            subtitle={`${a.address_line1}, ${a.city}, ${a.state}`}
            onPress={() => p.onSelect(a)}
          />
        ))}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={p.onContribute}
      style={s.quiet}
    >
      <Icon name="plus" size={20} color={tokens.color.brandPrimary} />
      <Text style={s.link}>共享公寓密码</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  quiet: {
    minHeight: 56,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: "600", color: tokens.color.ink },
  muted: { fontSize: 15, color: tokens.color.textMuted },
  link: { fontSize: 16, fontWeight: "600", color: tokens.color.brandPrimary },
  action: { minHeight: 48, justifyContent: "center" },
  error: { paddingVertical: 10 },
});
