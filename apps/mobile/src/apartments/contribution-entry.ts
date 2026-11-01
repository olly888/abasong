import { Alert } from "react-native";
import { router } from "expo-router";

// General contribution entries share the My-page menu. Apartment-specific
// "添加密码" keeps its direct, preselected-apartment path.
export function openContributionMenu() {
  Alert.alert("贡献公寓密码", undefined, [
    { text: "截图识别", onPress: () => router.push("/apartments/import") },
    { text: "快速填写", onPress: () => router.push("/apartments/contribute") },
    { text: "取消", style: "cancel" },
  ]);
}
