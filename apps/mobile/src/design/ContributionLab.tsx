import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ContributionForm } from "../apartments/ContributionForm";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { AddressLine } from "../apartments/AddressLine";
import { ActionButton } from "../ui/Controls";
type S = components["schemas"];
const apartment: S["Apartment"] = {
  id: "11111111-1111-4111-8111-111111112445",
  name: "TEST Del Mar Apartments",
  address_line1: "2445 E Del Mar Blvd",
  city: "Pasadena",
  state: "CA",
  postal_code: "91107",
  point: { lng: -118.1, lat: 34.1 },
  confidence: "unverified",
};
const unknown = {
  address_line1: "385 S Catalina Ave",
  city: "Pasadena",
  state: "CA",
  postal_code: "91106",
};
const scenes = [
  "我的入口",
  "卡片入口",
  "读取失败",
  "联想失败",
  "保存重试",
  "无资格",
  "私人记录",
] as const;
type Scene = (typeof scenes)[number];
export default function ContributionLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const params = useLocalSearchParams<{ scene?: string }>();
  const [scene, setScene] = useState<Scene>(
      scenes.includes(params.scene as Scene)
        ? (params.scene as Scene)
        : "我的入口",
    ),
    [revision, setRevision] = useState(0),
    [saved, setSaved] = useState<S["Apartment"] | null>(null),
    [privateSaved, setPrivateSaved] = useState(false);
  const writes = useRef(0);
  useEffect(() => {
    if (!scenes.includes(params.scene as Scene) || params.scene === scene)
      return;
    setScene(params.scene as Scene);
    setRevision((v) => v + 1);
    setSaved(null);
    setPrivateSaved(false);
    writes.current = 0;
  }, [params.scene]);
  const request = useMemo(() => {
    let targetReads = 0,
      saves = 0;
    const run: ContributionRequest = async <T,>(
      path: string,
      options?: Parameters<ContributionRequest>[1],
    ) => {
      if (options?.signal?.aborted) throw new Error("TEST cancelled");
      if (path === "/v1/apartments/" + apartment.id) {
        if (scene === "读取失败" && targetReads++ === 0)
          throw new Error("公寓资料暂不可用，请重新读取");
        return apartment as T;
      }
      if (path.includes("?query=") || path.includes("&query=")) {
        const query =
          new URL("http://test.invalid" + path).searchParams.get("query") ?? "";
        return { items: query.includes("2445") ? [apartment] : [] } as T;
      }
      if (path.endsWith("/suggest")) {
        if (scene === "联想失败") throw new Error("TEST offline");
        const query = (options?.body as { query: string }).query;
        const address = query.includes("385") ? unknown : apartment;
        return {
          items: [
            {
              provider_result_id: query.includes("385")
                ? "TEST:385"
                : "TEST:2445",
              title: address.address_line1,
              subtitle: address.city + " CA",
              label: address.address_line1,
              address,
            },
          ],
          attribution: "TEST · 合成地址候选",
        } as T;
      }
      if (path.endsWith("/retrieve")) {
        const isUnknown =
          (options?.body as { provider_result_id: string })
            .provider_result_id === "TEST:385";
        return {
          title: "TEST",
          label: "TEST",
          address: isUnknown ? unknown : apartment,
          point: apartment.point,
          apartments: isUnknown ? [] : [apartment],
          match_status: isUnknown ? "unmatched" : "matched",
          attribution: "TEST · 合成地址候选",
          use_mode: "temporary",
        } as T;
      }
      if (options?.method === "POST") {
        if (scene === "保存重试" && saves++ === 0)
          throw new Error("暂时无法保存，请重试");
        writes.current++;
        if (path === "/v1/me/apartment-library")
          return { id: "TEST-library" } as T;
        if (path.includes("/me/apartment-library/")) return {} as T;
        const body = options.body as { address?: S["SearchAddress"] };
        const result = {
          outcome: "created_active",
          record_id: "11111111-1111-4111-8111-111111110001",
          contributed_at: new Date().toISOString(),
        };
        return (
          body.address
            ? {
                apartment: {
                  ...apartment,
                  ...body.address,
                  id: "11111111-1111-4111-8111-111111110385",
                },
                contribution: result,
              }
            : result
        ) as T;
      }
      throw new Error("Unexpected TEST request");
    };
    return run;
  }, [scene, revision]);
  const target =
    scene === "卡片入口" || scene === "读取失败" || scene === "保存重试"
      ? apartment.id
      : undefined;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.color.surface }}
      edges={["top"]}
    >
      <Text
        style={{
          fontSize: 12,
          color: tokens.color.warning,
          textAlign: "center",
          padding: 8,
        }}
      >
        TEST · 仅内存合成 · 不连接业务服务
      </Text>
      <ScrollView
        horizontal
        style={{ flexGrow: 0, height: 48, maxHeight: 48 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {scenes.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={name}
            onPress={() => {
              setScene(name);
              setRevision((v) => v + 1);
              setSaved(null);
              setPrivateSaved(false);
              writes.current = 0;
            }}
            style={{
              padding: 12,
              minHeight: 48,
              backgroundColor:
                name === scene
                  ? tokens.color.brandSurface
                  : tokens.color.surfaceMuted,
            }}
          >
            <Text>{name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {saved || privateSaved ? (
        <View style={{ padding: 20, gap: 20 }}>
          <Text accessibilityRole="header">
            {privateSaved
              ? "TEST · 仅本人保存回程已触发"
              : "TEST · 共享成功回程已触发"}
          </Text>
          {saved ? (
            <>
              <AddressLine line={saved.address_line1} expanded />
              <Text>
                {saved.city} · {saved.state}
              </Text>
            </>
          ) : null}
          <Text>TEST · 写入次数 {writes.current}</Text>
          <ActionButton
            label="重新开始"
            onPress={() => {
              setSaved(null);
              setPrivateSaved(false);
              setRevision((v) => v + 1);
              writes.current = 0;
            }}
          />
        </View>
      ) : (
        <ContributionForm
          key={scene + revision}
          initialApartmentId={target}
          initialPrivate={scene === "私人记录"}
          canContribute={scene !== "无资格"}
          request={request}
          onBack={() => {
            setRevision((v) => v + 1);
          }}
          onPrivateSaved={() => setPrivateSaved(true)}
          onShared={(id) =>
            setSaved(
              id === apartment.id
                ? apartment
                : { ...apartment, ...unknown, id },
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
