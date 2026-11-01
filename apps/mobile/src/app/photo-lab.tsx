import { useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ApartmentSearch } from "../apartments/ApartmentSearch";
import { PhotoSessionBoundary } from "../address-photo/PhotoSessionBoundary";
import { PhotoError, type CaptureAddress } from "../address-photo/capture";
import type { LabelAddress } from "../address-photo/extract";
import { useAuth } from "../auth/AuthProvider";
const addresses: LabelAddress[] = [
  {
    street: "2445 E Del Mar Blvd",
    city: "Pasadena",
    state: "CA",
    postalCode: "91107",
    searchText: "2445 E Del Mar Blvd, Pasadena, CA 91107",
    issues: [],
  },
  {
    street: "100 N Garfield Ave",
    city: "Pasadena",
    state: "CA",
    postalCode: "91101",
    searchText: "100 N Garfield Ave, Pasadena, CA 91101",
    issues: [],
  },
];
// DEV-only UI exercise. No camera/OCR claim, no auth bypass, only public addresses.
function Lab() {
  const [scene, setScene] = useState("一个地址");
  const auth = useAuth();
  const capture: CaptureAddress = async (_signal, recognizing) => {
    const chosen = scene;
    recognizing();
    // Deliberately return late even after cancellation to exercise UI guards.
    await new Promise<void>((resolve) =>
      setTimeout(resolve, chosen === "延迟结果" ? 12000 : 700),
    );
    if (chosen === "权限关闭")
      throw new PhotoError("需要相机权限才能拍面单", true);
    if (chosen === "拍照取消") return null;
    if (chosen === "没识别到") return [];
    if (chosen === "多个地址") return addresses;
    return [addresses[chosen === "未匹配地址" ? 1 : 0]!];
  };
  return (
    <PhotoSessionBoundary>
      <View style={{ flex: 1, paddingTop: 60 }}>
        <Text style={{ textAlign: "center" }}>
          TEST · 地址确认交互 · 非相机/OCR验收
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", padding: 8 }}>
          {[
            "一个地址",
            "多个地址",
            "未匹配地址",
            "没识别到",
            "权限关闭",
            "拍照取消",
            "延迟结果",
          ].map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              onPress={() => setScene(name)}
              style={{
                padding: 10,
                backgroundColor: scene === name ? "#DCE9FF" : "#F4F4F4",
                margin: 2,
              }}
            >
              <Text>{name}</Text>
            </Pressable>
          ))}
        </View>
        <ApartmentSearch key={auth.session?.user.id} testCapture={capture} />
      </View>
    </PhotoSessionBoundary>
  );
}
export default function PhotoLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
