import { Text, View } from "react-native";
import type { components } from "@abasong/contracts";
export function WarehouseMap({
  point: _point,
}: {
  point: components["schemas"]["Point"];
}) {
  void _point;
  return (
    <View style={{ height: 160, justifyContent: "center" }}>
      <Text>请在原生 App 中查看仓库地图</Text>
    </View>
  );
}
