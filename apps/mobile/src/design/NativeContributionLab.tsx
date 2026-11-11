import { useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Redirect } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
import { randomUUID } from "expo-crypto";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { AddressLine } from "../apartments/AddressLine";
import { ContributionForm } from "../apartments/ContributionForm";
import { CorrectionForm } from "../apartments/CorrectionForm";
import { SharedContributionCard } from "../apartments/SharedContributions";
import { ImportSession } from "../imports/ImportScreen";
import { extractCandidates, type OcrLine } from "../imports/extract";
import { exactApartment } from "../imports/match";
import type { Candidate, Source } from "../imports/types";
import { nativeExitTransport, type ExitFixture } from "./native-exit-transport";
type S = components["schemas"];
type Fixture = ExitFixture & { scenario: string; apartments: string[] };
const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6M8sAAAAASUVORK5CYII=";
function review(apartments: S["Apartment"][], ambiguous: boolean) {
  const line = (text: string, y: number): OcrLine => ({
    text,
    y,
    x: 0.1,
    width: 0.8,
    height: 0.02,
    confidence: 0.99,
  });
  const lines = ambiguous
    ? [
        line("100 TEST Ave", 0.1),
        line("104 TEST Ave", 0.12),
        line("Gate code: *0044#", 0.18),
      ]
    : [
        line("102 TEST Ave", 0.1),
        line("TEST City, CA 90000", 0.13),
        line("Gate code: *0012#", 0.18),
        line("104 TEST Ave", 0.4),
        line("TEST City, CA 90000", 0.43),
        line("Gate code: #0007*", 0.48),
      ];
  const id = randomUUID();
  const sources: Source[] = [
    {
      id,
      uri: pixel,
      state: "recognized",
      width: 1,
      height: 1,
      bytes: 68,
      mime: "image/png",
    },
  ];
  const rows: Candidate[] = extractCandidates(lines).map((e, i) => {
    const target = exactApartment(e.address, apartments);
    return {
      id: randomUUID(),
      sourceId: id,
      address: e.address,
      value: e.value,
      scope: i === 1 ? "TEST 恢复门" : "行人门",
      issues: e.issues,
      target,
      selected: !!target && !e.issues.length,
      revision: 1,
    };
  });
  return { sources, rows };
}
export default function NativeContributionLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const request = useMemo(() => nativeExitTransport(base, "owner"), []),
    other = useMemo(() => nativeExitTransport(base, "driver"), []);
  const [fixture, setFixture] = useState<Fixture | null>(null),
    [apartments, setApartments] = useState<S["Apartment"][]>([]),
    [view, setView] = useState<
      "home" | "manual" | "import" | "correct" | "result"
    >("home"),
    [known, setKnown] = useState(true),
    [source, setSource] = useState(""),
    [target, setTarget] = useState(""),
    [seed, setSeed] = useState<ReturnType<typeof review> | null>(null),
    [revision, setRevision] = useState(0),
    [records, setRecords] = useState<S["AccessRecord"][]>([]),
    [shared, setShared] = useState<
      { source: S["ContributionSummary"]; value?: string | null }[]
    >([]),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function operation(run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "TEST 服务不可用");
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const f = await request<Fixture>("/fixture");
    if (!f.isolated || f.scenario !== "contribution")
      throw new Error("请启动贡献TEST服务");
    const a = await Promise.all(
      f.apartments.map((id) => request<S["Apartment"]>(`/v1/apartments/${id}`)),
    );
    setFixture(f);
    setApartments(a);
  }
  async function arm(operation: string) {
    await request("/fixture/control", {
      method: "POST",
      body: { action: "fault", operation, after: true },
    });
    setNotice("TEST · 下一次已保存但响应丢失");
  }
  async function result(id: string) {
    setTarget(id);
    setView("result");
    setRecords([]);
    setShared([]);
    const codes = await request<S["AccessList"]>(
      `/v1/apartments/${id}/access-records`,
    );
    setRecords(codes.items);
    const list = await request<S["ContributionSummaryPage"]>(
      "/v1/me/contributions?limit=100",
    );
    const rows = await Promise.all(
      list.items
        .filter((s) => s.apartment_id === id)
        .map(async (s) => ({
          source: s,
          value:
            s.status === "active" && s.record_status === "active"
              ? (
                  await request<S["ContributionDetail"]>(
                    `/v1/me/contributions/${s.id}`,
                  )
                ).value
              : null,
        })),
    );
    setShared(rows);
  }
  async function correction() {
    const a = apartments[0];
    if (!a) return;
    const body = {
      method: "keypad",
      value: "*0099#",
      scope: { label: "行人门" },
      source_attested: true,
    };
    const old = await request<S["ContributionResult"]>(
      `/v1/apartments/${a.id}/access-records`,
      { method: "POST", body, key: randomUUID() },
    );
    await other(`/v1/apartments/${a.id}/access-records`, {
      method: "POST",
      body,
      key: randomUUID(),
    });
    const list = await request<S["ContributionSummaryPage"]>(
      "/v1/me/contributions?limit=100",
    );
    const s = list.items.find(
      (x) => x.record_id === old.record_id && x.can_correct,
    );
    if (!s) throw new Error("TEST 来源未建立");
    await arm("correct");
    setSource(s.id);
    setRevision((n) => n + 1);
    setView("correct");
  }
  const controls = (
    <View style={{ gap: 8 }}>
      <Text>TEST · R4-11 · 真实隔离HTTP/PG</Text>
      {notice ? <Text>{notice}</Text> : null}
      <FormError message={error} />
    </View>
  );
  if (view === "manual" && fixture)
    return (
      <ContributionForm
        key={revision}
        initialApartmentId={known ? apartments[0]?.id : undefined}
        canContribute
        request={request}
        onShared={(id) => void operation(() => result(id))}
        onPrivateSaved={() => setView("home")}
        onBack={() => setView("home")}
      />
    );
  if (view === "correct")
    return (
      <CorrectionForm
        key={source + revision}
        id={source}
        request={request}
        testControls={controls}
        onBack={() => setView("home")}
        onSaved={(r) =>
          void operation(() =>
            result(r.replacement?.apartment_id ?? r.source.apartment_id),
          )
        }
      />
    );
  if (view === "import" && fixture && seed)
    return (
      <ImportSession
        key={revision}
        session={{ user: { id: fixture.owner }, access_token: "" } as Session}
        canContribute
        transport={request}
        initialReview={seed}
        testControls={
          <>
            {controls}
            <Text>TEST · 合成识别字段，不计真实识别率</Text>
            <ActionButton
              label="恢复共享服务"
              variant="text"
              onPress={() =>
                void operation(async () => {
                  await request("/fixture/control", {
                    method: "POST",
                    body: { action: "share_failure", enabled: false },
                  });
                  setNotice("TEST · 共享服务已恢复，仅重试未完成资料");
                })
              }
            />
          </>
        }
        onCompleted={(rows) =>
          void operation(async () => {
            const a = rows.find((r) => r.shared && r.target)?.target;
            if (a) await result(a.id);
            else setView("home");
          })
        }
      />
    );
  if (view === "result")
    return (
      <PageFrame title="TEST · 返回目标公寓" onBack={() => setView("home")}>
        {controls}
        <AddressLine
          line={apartments.find((a) => a.id === target)?.address_line1 ?? ""}
          expanded
        />
        {records.map((r) => (
          <View key={r.id} style={{ gap: 6, paddingVertical: 12 }}>
            <Text style={{ fontSize: 30, fontWeight: "700" }}>{r.value}</Text>
            <Text>{r.scope.label}</Text>
          </View>
        ))}
        {shared.map((r) => (
          <SharedContributionCard
            key={r.source.id}
            source={r.source}
            value={r.value}
            canRead
            onCorrect={() => {
              setSource(r.source.id);
              setRevision((n) => n + 1);
              setView("correct");
            }}
            onMap={() => void operation(() => result(r.source.apartment_id))}
          />
        ))}
        <ActionButton
          label="返回TEST首页"
          variant="secondary"
          onPress={() => setView("home")}
        />
      </PageFrame>
    );
  return (
    <PageFrame title="TEST · R4-11贡献保护" onBack={() => {}}>
      {controls}
      <ActionButton
        label="读取TEST公寓"
        busy={busy}
        onPress={() => void operation(load)}
      />
      {fixture ? (
        <>
          <ActionButton
            label="公寓卡添加 · 响应丢失重试"
            onPress={() =>
              void operation(async () => {
                await arm("contribute");
                setKnown(true);
                setRevision((n) => n + 1);
                setView("manual");
              })
            }
          />
          <ActionButton
            label="我的入口 · 更换地址"
            onPress={() => {
              setKnown(false);
              setRevision((n) => n + 1);
              setView("manual");
            }}
          />
          <ActionButton
            label="截图 · 部分失败重试"
            onPress={() =>
              void operation(async () => {
                await request("/fixture/control", {
                  method: "POST",
                  body: { action: "share_failure", enabled: true },
                });
                setSeed(review(apartments, false));
                setRevision((n) => n + 1);
                setView("import");
              })
            }
          />
          <ActionButton
            label="截图 · 多地址核对"
            onPress={() => {
              setSeed(review(apartments, true));
              setRevision((n) => n + 1);
              setView("import");
            }}
          />
          <ActionButton
            label="本人纠正 · 响应丢失重试"
            onPress={() => void operation(correction)}
          />
        </>
      ) : null}
    </PageFrame>
  );
}
