import { useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { ApplicationSheet } from "../requests/ApplySheet";
import { DeliveryDetailBody } from "../requests/DeliveryDetailBody";
import { createDeliveryWriter } from "../requests/delivery-writer";
import { collaborationSeed } from "./collaboration-seed";
import { nativeExitTransport, type ExitFixture } from "./native-exit-transport";
import { useConversationData } from "../messages/useConversation";
import { ConversationLayout } from "../messages/ConversationLayout";
import { ChatHistory, ChatComposer } from "../messages/MessageViews";
type S = components["schemas"];
type R = S["RequestDetailV2"];
const base =
  Platform.OS === "android" ? "http://10.0.2.2:3028" : "http://127.0.0.1:3028";
const own = nativeExitTransport(base, "owner"),
  drive = nativeExitTransport(base, "driver");
export default function NativeCollaborationLab() {
  return __DEV__ ? <Lab /> : <Redirect href="/" />;
}
function Lab() {
  const [fixture, setFixture] = useState<ExitFixture | null>(null),
    [r, setR] = useState<R | null>(null),
    [view, setView] = useState<"home" | "chat" | "detail">("home"),
    [applying, setApplying] = useState(false),
    [cid, setCid] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const writer = useMemo(() => createDeliveryWriter(own, randomUUID), []);
  useEffect(() => {
    void own<ExitFixture>("/fixture")
      .then((f) => {
        if (f.isolated) setFixture(f);
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
  const arm = (operation: string, after = false) =>
    own("/fixture/control", {
      method: "POST",
      body: { action: "fault", operation, after },
    });
  async function refresh() {
    if (r) setR(await drive<R>(`/v1/requests/${r.id}`));
  }
  async function prepare() {
    if (!fixture) return;
    setR(await writer.save(collaborationSeed(fixture), true));
    setNotice("TEST · 报名未写入");
  }
  if (view === "chat" && cid && fixture && r)
    return (
      <TestChat
        key={cid}
        cid={cid}
        userId={fixture.driver}
        r={r}
        onRequest={() => setView("detail")}
        onBack={() => setView("home")}
        arm={arm}
        onClose={async () => {
          const latest = await own<R>(`/v1/requests/${r.id}`);
          if (latest.status === "open")
            setR(
              await own<R>(`/v1/requests/${r.id}/close`, {
                method: "POST",
                body: { expected_version: latest.version, status: "found" },
                key: randomUUID(),
              }),
            );
        }}
      />
    );
  if (view === "detail" && r)
    return (
      <PageFrame
        compact
        title="TEST · 当前需求"
        onBack={() => setView(cid ? "chat" : "home")}
      >
        <Text>
          TEST · 当前状态 {r.status} · v{r.version}
        </Text>
        <DeliveryDetailBody
          request={r}
          regions={r.region_id ? { [r.region_id]: "TEST 派送区" } : {}}
          transport={drive}
        />
        <ActionButton label="刷新当前需求" onPress={() => void op(refresh)} />
      </PageFrame>
    );
  return (
    <PageFrame compact title="TEST · R4-12保护" onBack={() => {}}>
      <Text>仅本机隔离TEST库，不联系真人</Text>
      <Text>{notice}</Text>
      <FormError message={error} />
      <ActionButton
        label="准备报名保护"
        busy={busy}
        disabled={!fixture}
        onPress={() => void op(prepare)}
      />
      {r ? (
        <>
          <Text>
            TEST · 当前报价{r.price_cents} · v{r.version} · {r.status}
          </Text>
          <ActionButton
            label="打开报名表单"
            disabled={r.status !== "open"}
            onPress={() => setApplying(true)}
          />
          <ActionButton
            label="查看当前需求"
            variant="secondary"
            onPress={() => setView("detail")}
          />
        </>
      ) : null}
      {cid ? (
        <ActionButton
          label="打开已有会话"
          variant="secondary"
          onPress={() => setView("chat")}
        />
      ) : null}
      {applying && r ? (
        <ApplicationSheet
          request={r}
          regionLabel="TEST 派送区"
          transport={drive}
          onClose={() => setApplying(false)}
          onRefresh={() => void op(refresh)}
          onApplied={(a) => {
            setApplying(false);
            setCid(a.conversation_id);
            setNotice("TEST · 实际报名成功");
            setView("chat");
          }}
          testControls={
            <View style={{ gap: 4 }}>
              <Text>TEST · 表单版本保护</Text>
              <ActionButton
                label="TEST 更新报价并刷新"
                variant="text"
                disabled={busy}
                onPress={() =>
                  void op(async () => {
                    if (!fixture) return;
                    setR(
                      await writer.save(
                        { ...collaborationSeed(fixture), price_cents: 190 },
                        true,
                      ),
                    );
                  })
                }
              />
              <ActionButton
                label="TEST 报名响应丢失"
                variant="text"
                disabled={busy}
                onPress={() =>
                  void op(async () => {
                    await arm("apply", true);
                    setNotice("TEST · 已设置一次响应丢失");
                  })
                }
              />
            </View>
          }
        />
      ) : null}
    </PageFrame>
  );
}
function TestChat(p: {
  cid: string;
  userId: string;
  r: R;
  onRequest: () => void;
  onBack: () => void;
  arm: (op: string, after?: boolean) => Promise<unknown>;
  onClose: () => Promise<void>;
}) {
  const c = useConversationData(p.cid, p.userId, drive),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function op(fn: () => Promise<unknown>, text: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setNotice(text);
      c.onReload();
    } catch {
      setNotice("TEST · 操作失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ConversationLayout
      title="TEST · R4-12会话"
      onBack={p.onBack}
      onReload={c.onReload}
    >
      <View style={{ paddingHorizontal: 16, gap: 2 }}>
        <Text>{notice || "TEST · 原生组件／真实隔离接口"}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ActionButton
            label="发送失败"
            variant="text"
            disabled={busy}
            onPress={() =>
              void op(() => p.arm("message"), "TEST · 下次发送失败，可原条重试")
            }
          />
          <ActionButton
            label="只读"
            variant="text"
            disabled={busy}
            onPress={() =>
              void op(
                () =>
                  own("/fixture/control", {
                    method: "POST",
                    body: { action: "block", enabled: true },
                  }),
                "TEST · 仅历史可读",
              )
            }
          />
          <ActionButton
            label="恢复"
            variant="text"
            disabled={busy}
            onPress={() =>
              void op(
                () =>
                  own("/fixture/control", {
                    method: "POST",
                    body: { action: "block", enabled: false },
                  }),
                "TEST · 已恢复",
              )
            }
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ActionButton
            label="对方已读"
            variant="text"
            disabled={busy}
            onPress={() =>
              void op(
                () =>
                  own(`/v1/conversations/${p.cid}/read`, {
                    method: "PUT",
                    body: {
                      last_read_sequence: c.messages.at(-1)?.sequence ?? 0,
                    },
                  }),
                "TEST · 对方水位已更新",
              )
            }
          />
          <ActionButton
            label="关闭需求"
            variant="text"
            disabled={busy}
            onPress={() => void op(p.onClose, "TEST · 已找到，已有会话保留")}
          />
          <ActionButton label="当前需求" variant="text" onPress={p.onRequest} />
        </View>
      </View>
      <ChatHistory {...c} onOpenRequest={p.onRequest} />
      <ChatComposer {...c} />
    </ConversationLayout>
  );
}
