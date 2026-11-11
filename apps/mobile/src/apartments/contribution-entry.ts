import { Alert } from "react-native";
import { router } from "expo-router";

// General contribution entries share the My-page menu. Apartment-specific
// "添加门禁码" keeps its direct, preselected-apartment path to the same form.
export function openContributionMenu() {
  Alert.alert("共享门禁码", undefined, [
    { text: "从截图添加", onPress: () => router.push("/apartments/import") },
    { text: "手动填写", onPress: () => router.push("/apartments/contribute") },
    { text: "取消", style: "cancel" },
  ]);
}
