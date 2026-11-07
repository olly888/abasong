import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { DeliveryEditor } from "../requests/DeliveryEditor";
import { DeliveryDetailBody } from "../requests/DeliveryDetailBody";
import { ApplicationSheet } from "../requests/ApplySheet";
import { GapEditor } from "../requests/GapSheet";
import { deliveryFixture } from "../requests/delivery-fixtures";
import { requestTitle } from "../requests/presentation";
import { AvailabilityFlow } from "../drivers/AvailabilityFlow";
import { useConversationData } from "../messages/useConversation";
import { ConversationLayout } from "../messages/ConversationLayout";
import { ChatHistory, ChatComposer } from "../messages/MessageViews";
import {
  nativeExitTransport,
  type ExitActor,
  type ExitFixture,
} from "./native-exit-transport";
type S = components["schemas"];
type R = S["RequestDetailV2"];
const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";
export default function NativeExitLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const [actor, setActor] = useState<ExitActor>("owner"),
    [fixture, setFixture] = useState<ExitFixture | null>(null),
    [regions, setRegions] = useState<S["Region"][]>([]),
    [items, setItems] = useState<S["RequestPageV2"]["items"]>([]),
    [current, setCurrent] = useState<R | null>(null),
    [view, setView] = useState<
      "home" | "editor" | "detail" | "availability" | "chat"
    >("home"),
    [detailOrigin, setDetailOrigin] = useState<"home" | "chat">("home"),
    [copy, setCopy] = useState(false),
    [revision, setRevision] = useState(0),
    [applying, setApplying] = useState(false),
    [gap, setGap] = useState(false),
    [conversation, setConversation] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useMemo(() => nativeExitTransport(base, actor), [actor]);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [f, p, list, conversations] = await Promise.all([
        request<ExitFixture>("/fixture"),
        request<S["RegionPage"]>("/v1/regions?limit=100"),
        request<S["RequestPageV2"]>(
          `/v1/${actor === "owner" ? "me/" : ""}requests?request_schema_version=2&limit=100`,
        ),
        request<S["ConversationPage"]>("/v1/conversations?limit=100"),
      ]);
      if (!f.isolated) throw new Error("TEST 环境未确认");
      setFixture(f);
      setRegions(p.items);
      setItems(list.items);
      setConversation(conversations.items[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "TEST 服务未启动");
    }
  }, [request, actor]);
  useEffect(() => {
    void load();
  }, [load]);
  const operation = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "TEST 请求失败");
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: string) => {
    const r = await request<R>(`/v1/requests/${id}`);
    setCurrent(r);
    setDetailOrigin(view === "chat" ? "chat" : "home");
    setView("detail");
  };
  const fault = async (operation: string) => {
    await request("/fixture/control", {
      method: "POST",
      body: { action: "fault", operation, after: true },
    });
    setNotice(`TEST · 下一次${operation}已写入但响应丢失`);
  };
  function newRequest(scenario: R["scenario"], unlocated = false) {
    if (!fixture) return;
    const seed = deliveryFixture(scenario);
    seed.region_id = fixture.region;
    seed.pickup_region_id = fixture.pickup;
    seed.publisher = {
      ...seed.publisher,
      user_id: fixture.owner,
      display_name: "TEST 发布人",
    };
    if (seed.pickup?.kind === "warehouse")
      seed.pickup = {
        ...seed.pickup,
        address_line1: unlocated ? "300 TEST Ave" : "100 TEST Ave",
        city: "TEST City",
        state: "CA",
        postal_code: "90000",
        address_source: unlocated ? "publisher_entered" : "provider_permanent",
        point: unlocated ? null : seed.pickup.point,
      };
    if (scenario === "delivery_handoff") {
      seed.quantity_mode = "unknown";
      seed.parcel_count = null;
      seed.remaining_parcels = null;
    }
    setCurrent(seed);
    setCopy(true);
    setRevision((n) => n + 1);
    setView("editor");
  }
  const testHeader = (
    <View style={{ gap: 8 }}>
      <Text>
        TEST · R4-10 · 真实隔离HTTP/PG · {actor === "owner" ? "发布人" : "司机"}
      </Text>
      {notice ? <Text>{notice}</Text> : null}
      <FormError message={error} />
    </View>
  );
  if (view === "editor" && current)
    return (
      <DeliveryEditor
        key={revision}
        request={request}
        regions={regions}
        initial={current}
        copy={copy}
        identity="TEST 发布人"
        testControls={
          <>
            {testHeader}
            <ActionButton
              label="TEST 丢失创建响应"
              variant="text"
              onPress={() => void operation(() => fault("create"))}
            />
          </>
        }
        onReload={() =>
          void operation(async () => {
            setCurrent(await request<R>(`/v1/requests/${current.id}`));
            setRevision((n) => n + 1);
          })
        }
        onDone={(r) => {
          setCurrent(r);
          setView("detail");
          setNotice("TEST · 已保存到真实测试库");
          void load();
        }}
      />
    );
  if (view === "availability")
    return (
      <AvailabilityFlow
        request={request}
        testControls={testHeader}
        onSaved={() => {
          setView("home");
          setNotice("TEST · 时段已写入测试库");
        }}
        onCancel={() => setView("home")}
      />
    );
  if (view === "chat" && conversation && fixture)
    return (
      <ExitChat
        key={actor + conversation}
        id={conversation}
        userId={fixture[actor]}
        request={request}
        back={() => {
          setDetailOrigin("home");
          setView(current ? "detail" : "home");
        }}
        open={(id) => void operation(() => open(id))}
      />
    );
  if (view === "detail" && current)
    return (
      <PageFrame
        compact
        title="TEST · 真实需求详情"
        onBack={() => {
          setView(detailOrigin === "chat" && conversation ? "chat" : "home");
          void load();
        }}
        footer={
          <ActionButton
            label={actor === "owner" ? "切换为司机查看" : "报名接活"}
            disabled={busy || current.status !== "open"}
            onPress={() =>
              void operation(async () => {
                if (actor === "owner") {
                  const reader = nativeExitTransport(base, "driver");
                  const r = await reader<R>(`/v1/requests/${current.id}`);
                  setActor("driver");
                  setCurrent(r);
                } else setApplying(true);
              })
            }
          />
        }
      >
        {testHeader}
        <DeliveryDetailBody
          request={current}
          regions={Object.fromEntries(regions.map((r) => [r.id, r.label]))}
          transport={request}
        />
        {actor === "owner" ? (
          <>
            <ActionButton
              label="编辑当前需求"
              variant="secondary"
              onPress={() => {
                setCopy(false);
                setRevision((n) => n + 1);
                setView("editor");
              }}
            />
            <ActionButton
              label="复制为新需求"
              variant="secondary"
              onPress={() => {
                setCopy(true);
                setRevision((n) => n + 1);
                setView("editor");
              }}
            />
            {current.status === "open" ? (
              <>
                {current.drivers_needed !== null ||
                (current.quantity_mode === "exact" &&
                  current.parcel_count !== null) ? (
                  <ActionButton
                    label="更新剩余缺口"
                    variant="secondary"
                    onPress={() => setGap(true)}
                  />
                ) : null}
                <ActionButton
                  label="已找到，关闭需求"
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    void operation(async () => {
                      setCurrent(
                        await request<R>(`/v1/requests/${current.id}/close`, {
                          method: "POST",
                          body: {
                            expected_version: current.version,
                            status: "found",
                          },
                          key: randomUUID(),
                        }),
                      );
                      setNotice("TEST · 已关闭，已有会话保留");
                    })
                  }
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <ActionButton
              label="切换回发布人"
              variant="secondary"
              onPress={() =>
                void operation(async () => {
                  const publisher = nativeExitTransport(base, "owner");
                  setCurrent(await publisher<R>(`/v1/requests/${current.id}`));
                  setActor("owner");
                })
              }
            />
            <ActionButton
              label="TEST 丢失报名响应"
              variant="text"
              onPress={() => void operation(() => fault("apply"))}
            />
          </>
        )}
        {conversation ? (
          <ActionButton
            label="打开已有会话"
            variant="secondary"
            onPress={() => setView("chat")}
          />
        ) : null}
        <ActionButton
          label="刷新当前需求"
          variant="text"
          onPress={() => void operation(() => open(current.id))}
        />
        {applying ? (
          <ApplicationSheet
            request={current}
            regionLabel={regions.find((r) => r.id === current.region_id)?.label}
            transport={request}
            onClose={() => setApplying(false)}
            onRefresh={() => void operation(() => open(current.id))}
            onApplied={(a) => {
              setApplying(false);
              setConversation(a.conversation_id);
              setView("chat");
              setNotice("TEST · 实际报名成功");
            }}
          />
        ) : null}
        {gap ? (
          <GapEditor
            request={current}
            transport={request}
            onClose={() => setGap(false)}
            onSaved={(r) => {
              if (
                "request_schema_version" in r &&
                r.request_schema_version === 2
              )
                setCurrent(r);
            }}
            onRefresh={() => void operation(() => open(current.id))}
          />
        ) : null}
      </PageFrame>
    );
  return (
    <PageFrame compact title="TEST · R4-10业务组合" onBack={() => {}}>
      {testHeader}
      <ActionButton label="刷新真实数据" onPress={() => void load()} />
      {fixture ? (
        <>
          <ActionButton
            label="创建仓库缺人 TEST"
            onPress={() => newRequest("warehouse_shortage")}
          />
          <ActionButton
            label="创建代送 TEST"
            onPress={() => newRequest("delivery_handoff")}
          />
          <ActionButton
            label="创建无坐标仓库 TEST"
            variant="secondary"
            onPress={() => newRequest("warehouse_shortage", true)}
          />
          <ActionButton
            label="切换测试身份"
            variant="secondary"
            onPress={() =>
              setActor((a) => (a === "owner" ? "driver" : "owner"))
            }
          />
          <ActionButton
            label="设置本次可接活"
            variant="secondary"
            onPress={() => setView("availability")}
          />
        </>
      ) : null}
      {conversation ? (
        <ActionButton
          label="打开已有会话"
          variant="secondary"
          onPress={() => setView("chat")}
        />
      ) : null}
      {items.map((r) => (
        <ActionButton
          key={r.id}
          label={`${requestTitle(r)} · ${r.status} · v${r.version}`}
          variant="secondary"
          onPress={() => void operation(() => open(r.id))}
        />
      ))}
    </PageFrame>
  );
}
function ExitChat({
  id,
  userId,
  request,
  back,
  open,
}: {
  id: string;
  userId: string;
  request: ReturnType<typeof nativeExitTransport>;
  back: () => void;
  open: (id: string) => void;
}) {
  const p = useConversationData(id, userId, request);
  return (
    <ConversationLayout
      title="TEST · 真实本地会话"
      onBack={back}
      onReload={p.onReload}
    >
      <ChatHistory {...p} onOpenRequest={open} />
      <ChatComposer
        {...p}
        readOnlyReason={
          p.readOnlyReason ??
          (!p.conversation
            ? p.busy
              ? "正在加载…"
              : "会话暂不可用"
            : undefined)
        }
      />
    </ConversationLayout>
  );
}
