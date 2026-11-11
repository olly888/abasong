import { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { tokens } from "@abasong/ui";
import { HomeChrome, type HomeMode } from "../../components/HomeChrome";
import { HomeApartments } from "../../apartments/HomeApartments";
import { MapModeSwitch } from "../../ui/MapControls";
export default function Home() {
  const params = useLocalSearchParams<{
    apartment_id?: string;
    destination_key?: string;
  }>();
  const [mode, setMode] = useState<HomeMode>("公寓");
  const [list, setList] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (params.apartment_id || params.destination_key) {
      setMode("公寓");
      setList(false);
    }
  }, [params.apartment_id, params.destination_key]);
  const toolbar = (
    <HomeChrome
      workspace
      mode={mode}
      list={list}
      onToggleList={() => setList(!list)}
      onSearch={() => setFiltersOpen(true)}
      onMode={(m) => {
        setMode(m);
        setList(false);
        setFiltersOpen(false);
      }}
    />
  );
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <HomeApartments
        workspace={{
          modes: (
            <MapModeSwitch
              fullWidth
              icons={{ 查码: "key", 找活: "box", 找人: "people" }}
              items={["查码", "找活", "找人"]}
              selected={mode === "公寓" ? "查码" : mode}
              onSelect={(v) => {
                setMode(v === "查码" ? "公寓" : (v as HomeMode));
                setFiltersOpen(false);
              }}
            />
          ),
          onFilter: () => setFiltersOpen(true),
        }}
        toolbar={toolbar}
        mode={mode}
        list={list}
        filtersOpen={filtersOpen}
        onCloseFilters={() => setFiltersOpen(false)}
        onToggleList={() => setList(!list)}
        destinationKey={
          typeof params.destination_key === "string"
            ? params.destination_key
            : undefined
        }
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
