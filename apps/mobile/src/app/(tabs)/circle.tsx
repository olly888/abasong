import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { tokens } from "@abasong/ui";
import { PageHeader } from "../../ui/PageFrame";
import { StatusPanel } from "../../ui/Feedback";
export default function Circle() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface }}
      edges={["top"]}
    >
      <PageHeader title="司机圈" />
      <View style={{ paddingHorizontal: 20 }}>
        <StatusPanel state="unavailable" title="司机圈尚未开放" />
      </View>
    </SafeAreaView>
  );
}
