import { useMemo, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
import { CorrectionForm } from "../apartments/CorrectionForm";
import { ImportSession } from "../imports/ImportScreen";
import type { Candidate, Source } from "../imports/types";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { AccountError } from "../auth/api-client";
import { PageFrame } from "../ui/PageFrame";
type S = components["schemas"];
const apartment: S["Apartment"] = {
  id: "11111111-1111-4111-8111-111111110100",
  name: "TEST Apartments",
  address_line1: "100 TEST Ave",
  city: "TEST City",
  state: "CA",
  postal_code: "90000",
  point: { lat: 34, lng: -118 },
  confidence: "unverified",
};
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6M8sAAAAASUVORK5CYII=";
export default function AccessContributionLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const { scene = "纠正重试" } = useLocalSearchParams<{ scene?: string }>();
  const [saved, setSaved] = useState("");
  const request = useMemo(() => {
    let submissions = 0;
    const run: ContributionRequest = async <T,>(
      path: string,
      options?: Parameters<ContributionRequest>[1],
    ) => {
      if (options?.signal?.aborted) throw Error("TEST cancelled");
      if (path.endsWith("/summary"))
        return {
          id: "TEST-source",
          apartment_id: apartment.id,
          address_label: "100 TEST Ave, TEST City, CA 90000",
          scope_label: scene === "历史门别" ? "TEST 东侧入口" : "行人门",
          can_correct: true,
          version: 1,
        } as T;
      if (path.endsWith("/corrections")) {
        const body = options?.body as {
          value: string;
          scope: { label: string };
        };
        if (scene === "版本冲突")
          throw new AccountError(
            409,
            "VERSION_CONFLICT",
            "TEST · 记录已变化，请刷新",
          );
        if (submissions++ === 0) throw Error("TEST · 结果尚未确认，请重试");
        setSaved(`${body.value} · ${body.scope.label}`);
        return {} as T;
      }
      if (path.includes("/apartments?")) return { items: [apartment] } as T;
      if (path.endsWith("/suggest"))
        return { items: [], attribution: "TEST" } as T;
      throw Error("TEST · 本页不提交截图；真实保存由隔离HTTP测试验证");
    };
    return run;
  }, [scene]);
  const seed = useMemo(() => {
    const sources: Source[] = [
      { id: "TEST-image", uri: pixel, state: "recognized" },
    ];
    const rows: Candidate[] = [
      {
        id: "TEST-row-1",
        sourceId: "TEST-image",
        address: "100 TEST Ave, TEST City, CA 90000",
        value: "*0012#",
        scope: "行人门",
        issues: [],
        target: apartment,
        selected: true,
        revision: 1,
      },
      {
        id: "TEST-row-2",
        sourceId: "TEST-image",
        address: "102 TEST Ave, TEST City, CA 90000",
        value: "#0008*",
        scope: "门别未注明",
        issues: ["address_uncertain"],
        target: null,
        selected: false,
        revision: 1,
      },
    ];
    return { sources, rows };
  }, []);
  if (saved)
    return (
      <PageFrame title="TEST · 纠正回程">
        <Text>100 TEST Ave</Text>
        <Text>{saved}</Text>
      </PageFrame>
    );
  const controls = <Text>TEST · M5-02 · 仅内存，不连接业务服务</Text>;
  return scene === "截图核对" ? (
    <ImportSession
      canContribute
      session={{ user: { id: "TEST" } } as Session}
      transport={request}
      initialReview={seed}
      testControls={controls}
    />
  ) : (
    <CorrectionForm
      id="TEST-source"
      request={request}
      onBack={() => {}}
      onSaved={() => {}}
      testControls={controls}
    />
  );
}
