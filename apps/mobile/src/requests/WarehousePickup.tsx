import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { randomUUID } from "expo-crypto";
import { ActionButton, FormError } from "../ui/Controls";
import {
  createContributionAddressSearch,
  type ContributionRequest,
} from "../apartments/contribution-address-search";
import { RequestSheet, requestStyles as s } from "./RequestUi";
import { WarehouseMap } from "./WarehouseMap";
import {
  sameWarehouse,
  warehouseAddress,
  warehouseNavigation,
  type Warehouse,
} from "./warehouse";
export function WarehousePickup({
  pickup,
  request,
}: {
  pickup: Warehouse;
  request: ContributionRequest;
}) {
  const [open, setOpen] = useState(false),
    [point, setPoint] = useState(pickup.point),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [mapError, setMapError] = useState<string | null>(null),
    [copied, setCopied] = useState(false),
    [attribution, setAttribution] = useState("");
  const search = useMemo(
      () =>
        createContributionAddressSearch(request, randomUUID, Date.now, false),
      [request],
    ),
    epoch = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
      search.cancel();
    };
  }, [search]);
  useEffect(() => {
    epoch.current++;
    search.cancel();
    setOpen(false);
    setPoint(pickup.point);
    setCopied(false);
    setError(null);
    setMapError(null);
    setAttribution("");
  }, [
    pickup.address_version,
    pickup.address_line1,
    pickup.city,
    pickup.state,
    pickup.postal_code,
    pickup.point?.lat,
    pickup.point?.lng,
    pickup.point_source,
    search,
  ]);
  function close() {
    epoch.current++;
    search.cancel();
    setOpen(false);
    setBusy(false);
  }
  async function showMap() {
    setOpen(true);
    setError(null);
    setMapError(null);
    if (point) return;
    const version = ++epoch.current;
    setBusy(true);
    try {
      const choices = await search.search(warehouseAddress(pickup));
      if (!mounted.current || version !== epoch.current || !choices) return;
      const exact = choices.items.filter(
        (c) =>
          c.kind === "address" && sameWarehouse(pickup, c.suggestion.address),
      );
      if (exact.length !== 1 || exact[0]?.kind !== "address")
        throw new Error("暂时无法定位这个仓库，可复制地址或导航");
      const detail = await search.retrieve(exact[0], choices);
      if (!mounted.current || version !== epoch.current || !detail) return;
      if (!sameWarehouse(pickup, detail.address))
        throw new Error("地址还需核对，可复制地址或导航");
      setPoint(detail.point);
      setAttribution(detail.attribution);
    } catch (e) {
      if (mounted.current && version === epoch.current)
        setMapError(e instanceof Error ? e.message : "地图暂不可用");
    } finally {
      if (mounted.current && version === epoch.current) setBusy(false);
    }
  }
  async function copy() {
    const version = epoch.current;
    setCopied(false);
    setError(null);
    try {
      const ok = await Clipboard.setStringAsync(warehouseAddress(pickup));
      if (!ok) throw new Error("复制失败，请重试");
      if (mounted.current && version === epoch.current) {
        setCopied(true);
        setError(null);
      }
    } catch {
      if (mounted.current && version === epoch.current)
        setError("复制失败，请重试");
    }
  }
  async function navigate() {
    const version = epoch.current;
    try {
      await Linking.openURL(warehouseNavigation(pickup));
      if (mounted.current && version === epoch.current) setError(null);
    } catch {
      if (mounted.current && version === epoch.current)
        setError("未能打开导航，可复制地址后重试");
    }
  }
  const controls = (
    <>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <ActionButton
            label={copied ? "已复制" : "复制地址"}
            variant="text"
            onPress={() => void copy()}
          />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton
            label="导航"
            secondary
            onPress={() => void navigate()}
          />
        </View>
      </View>
      <FormError message={error} />
    </>
  );
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.label}>
        仓库取件{pickup.name ? ` · ${pickup.name}` : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看仓库地图，${warehouseAddress(pickup)}`}
        onPress={() => void showMap()}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={s.text}>{warehouseAddress(pickup) || "地址待补充"}</Text>
        <Text style={s.status}>查看地图</Text>
      </Pressable>
      {controls}
      {open ? (
        <RequestSheet onRequestClose={close}>
          <Text style={s.headline}>取件仓库</Text>
          <Text style={s.text}>{warehouseAddress(pickup)}</Text>
          {busy ? (
            <ActivityIndicator accessibilityLabel="正在定位仓库" />
          ) : point ? (
            <WarehouseMap key={`${point.lat}:${point.lng}`} point={point} />
          ) : null}
          {attribution ? <Text style={s.secondary}>{attribution}</Text> : null}
          <FormError message={mapError} />
          {mapError ? (
            <ActionButton
              label="重新加载地图"
              variant="text"
              onPress={() => void showMap()}
            />
          ) : null}
          {controls}
          <ActionButton label="关闭地图" variant="text" onPress={close} />
        </RequestSheet>
      ) : null}
    </View>
  );
}
