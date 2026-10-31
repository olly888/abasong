import { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { tokens } from "@abasong/ui";
import { HomeChrome, type HomeMode } from "../../components/HomeChrome";
import { HomeApartments } from "../../apartments/HomeApartments";
export default function Home() {
  const params = useLocalSearchParams<{ apartment_id?: string }>();
  const [mode, setMode] = useState<HomeMode>("公寓");
  const [list, setList] = useState(false);
  useEffect(() => {
    if (params.apartment_id) {
      setMode("公寓");
      setList(false);
    }
  }, [params.apartment_id]);
  const toolbar = (
    <HomeChrome
      mode={mode}
      list={list}
      onToggleList={() => setList(!list)}
      onMode={(m) => {
        setMode(m);
        setList(false);
      }}
    />
  );
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <HomeApartments
        toolbar={toolbar}
        mode={mode}
        list={list}
        apartmentId={
          typeof params.apartment_id === "string"
            ? params.apartment_id
            : undefined
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface },
});
