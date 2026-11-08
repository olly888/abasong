import { AddressLine } from "./AddressLine";
import { locality } from "./address-presentation";
import { Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { ListRow } from "../ui/Primitives";
import { MapStatusRow } from "../ui/MapStatusRow";
import { typeStyles } from "../ui/foundation";
import { router } from "expo-router";

type Apartment = components["schemas"]["Apartment"];

export function HomeArrivalPanel(p: {
  state:
    | "loading"
    | "nearby"
    | "ambiguous"
    | "empty"
    | "error"
    | "location"
    | "partial";
  message?: string;
  blocked?: boolean;
  candidates: Apartment[];
  onSelect: (apartment: Apartment) => void;
  onContribute: () => void;
  onRetry: () => void;
}) {
  if (p.state === "loading")
    return <MapStatusRow state="loading" title={p.message ?? "正在定位"} />;
  if (p.state === "location")
    return (
      <MapStatusRow
        state="unavailable"
        title={p.message ?? "暂时无法获取位置"}
        action={{
          label: p.blocked ? "打开系统设置" : "重试定位",
          onPress: p.onRetry,
        }}
      />
    );
  if (p.state === "error")
    return (
      <MapStatusRow
        state="error"
        title="公寓资料暂时无法加载"
        action={{ label: "重新加载", onPress: p.onRetry }}
      />
    );
  if (p.state === "partial")
    return (
      <MapStatusRow
        title="部分范围待补全"
        action={{
          label: "搜索地址",
          onPress: () => router.push("/apartments"),
        }}
      />
    );
  if (p.candidates.length && p.state !== "empty")
    return (
      <View>
        <Text style={typeStyles.label}>
          {p.state === "ambiguous" ? "选择公寓" : "附近公寓"}
        </Text>
        {p.candidates.map((a) => (
          <ListRow
            key={a.id}
            title={<AddressLine line={a.address_line1} compact />}
            subtitle={[locality(a), a.name].filter(Boolean).join(" · ")}
            onPress={() => p.onSelect(a)}
          />
        ))}
      </View>
    );
  return (
    <MapStatusRow
      title="附近未匹配到公寓"
      action={{ label: "共享门禁码", onPress: p.onContribute }}
    />
  );
}
