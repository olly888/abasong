import { useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { Redirect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import type { components } from "@abasong/contracts";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { ImportSession } from "../imports/ImportScreen";
import type { Source, Candidate } from "../imports/types";
import { AddressLine } from "../apartments/AddressLine";
import { nativeExitTransport, type ExitFixture } from "./native-exit-transport";
type S = components["schemas"];
type F = ExitFixture & { scenario: string; apartments: string[] };
const request = nativeExitTransport(
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028",
  "owner",
);
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6M8sAAAAASUVORK5CYII=";
export default function UnlistedImportLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const [fixture, setFixture] = useState<F | null>(null),
    [seed, setSeed] = useState<{ sources: Source[]; rows: Candidate[] } | null>(
      null,
    ),
    [target, setTarget] = useState<S["Apartment"] | null>(null),
    [codes, setCodes] = useState<S["AccessList"]["items"]>([]),
    [view, setView] = useState<"home" | "import" | "result">("home"),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void request<F>("/fixture")
      .then((f) => {
        if (f.scenario === "contribution" && f.isolated) setFixture(f);
        else setError("请启动R4-13 TEST服务");
      })
      .catch(() => setError("TEST 服务未启动"));
  }, []);
  async function op(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError("TEST 操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  const control = (action: string, enabled: boolean) =>
    request("/fixture/control", { method: "POST", body: { action, enabled } });
  async function begin(bad: boolean, reviewed = false) {
    if (!fixture) return;
    const known = await request<S["Apartment"]>(
      `/v1/apartments/${fixture.apartments[0]}`,
    );
    const source: Source = {
      id: randomUUID(),
      uri: pixel,
      state: "recognized",
      width: 1,
      height: 1,
      bytes: 68,
      mime: "image/png",
    };
    const n = bad ? 999 : reviewed ? 220 : 200;
    const a = {
      address_line1: `${n} TEST Ave`,
      city: "TEST City",
      state: "CA",
      postal_code: "90000",
    };
    const row: Candidate = {
      id: randomUUID(),
      sourceId: source.id,
      address: `${n} TEST Ave, TEST City, CA 90000`,
      value: "*0012#",
      scope: bad ? "行人门" : "TEST 恢复门",
      issues: [],
      target: null,
      confirmedAddress: bad || reviewed ? a : null,
      selected: bad || reviewed,
      revision: 1,
    };
    const rows = bad
      ? [row]
      : [
          row,
          {
            ...row,
            id: randomUUID(),
            address: "100 TEST Ave, TEST City, CA 90000",
            target: known,
            confirmedAddress: null,
            selected: true,
            scope: "行人门",
            value: "#0008*",
          },
        ];
    await control("address_storage", true);
    await control("share_failure", !bad);
    setSeed({ sources: [source], rows });
    setRevision((x) => x + 1);
    setNotice(
      bad
        ? "TEST · 已核对字段，供应商无法确认999；非真实识别率"
        : reviewed
          ? "TEST · 220为已核对合成字段，验证真实提交/部分失败；非手工输入或识别质量"
          : "TEST · 先核对200新地址；另一条100已收录",
    );
    setView("import");
  }
  async function finish(rows: Candidate[]) {
    const first = rows.find(
      (x) => x.shared && (x.sharedApartmentId || x.target?.id),
    );
    if (!first) throw new Error("TEST 无返回目标");
    const id = first.sharedApartmentId ?? first.target!.id;
    const [a, list] = await Promise.all([
      request<S["Apartment"]>(`/v1/apartments/${id}`),
      request<S["AccessList"]>(`/v1/apartments/${id}/access-records`),
    ]);
    setTarget(a);
    setCodes(list.items);
    setView("result");
  }
  if (view === "import" && seed && fixture)
    return (
      <ImportSession
        key={revision}
        session={{ user: { id: fixture.owner }, access_token: "" } as Session}
        canContribute
        transport={request}
        initialReview={seed}
        onCompleted={(rows) => void op(() => finish(rows))}
        testControls={
          <>
            <Text>TEST · R4-13 · 合成字段／真实本地保存</Text>
            <Text>{notice}</Text>
            <FormError message={error} />
            <ActionButton
              label="恢复共享服务"
              variant="text"
              onPress={() =>
                void op(async () => {
                  await control("share_failure", false);
                  setNotice("TEST · 已恢复共享，可重试失败项");
                })
              }
            />
          </>
        }
      />
    );
  if (view === "result" && target)
    return (
      <PageFrame
        compact
        title="TEST · 返回提交公寓"
        onBack={() => setView("home")}
      >
        <AddressLine line={target.address_line1} />
        <Text>
          {target.city}, {target.state}
        </Text>
        {codes.map((c) => (
          <Text key={c.id}>
            {c.value} · {c.scope.label}
          </Text>
        ))}
        <ActionButton label="返回TEST首页" onPress={() => setView("home")} />
      </PageFrame>
    );
  return (
    <PageFrame compact title="TEST · R4-13截图共享" onBack={() => {}}>
      <Text>只写独立一次性TEST库，不使用真实照片/账号</Text>
      <FormError message={error} />
      <ActionButton
        label="新地址与部分失败"
        busy={busy}
        disabled={!fixture}
        onPress={() => void op(() => begin(false))}
      />
      <ActionButton
        label="已核对220 · 提交与重试"
        variant="secondary"
        busy={busy}
        disabled={!fixture}
        onPress={() => void op(() => begin(false, true))}
      />
      <ActionButton
        label="地址需核对与修正"
        variant="secondary"
        busy={busy}
        disabled={!fixture}
        onPress={() => void op(() => begin(true))}
      />
    </PageFrame>
  );
}
