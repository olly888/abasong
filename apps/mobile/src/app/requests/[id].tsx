import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, View, Alert } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import { RequestGate, requestStyles as s } from "../../requests/RequestUi";
import { ApplySheet } from "../../requests/ApplySheet";
import { GapSheet } from "../../requests/GapSheet";
import {
  kindLabels,
  requestPrice,
  requestTime,
  statusLabels,
  type DeliveryRequest,
} from "../../requests/presentation";
export default function RequestDetail() {
  return (
    <RequestGate>
      <Detail />
    </RequestGate>
  );
}
function Detail() {
  const { session } = useAuth(),
    { id } = useLocalSearchParams<{ id: string }>();
  const [r, setRequest] = useState<DeliveryRequest | null>(null),
    [regions, setRegions] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState<
      "found" | "closed" | "discard" | "reopen" | null
    >(null),
    [application, setApplication] = useState<
      components["schemas"]["Application"] | null
    >(null),
    [applying, setApplying] = useState(false),
    [gapEditing, setGapEditing] = useState(false),
    [managing, setManaging] = useState(false);
  const focused = useRef(false);
  const generation = useRef(0),
    targetId = useRef(id);
  targetId.current = id;
  const lock = useRef(false),
    attempts = useRef<Record<string, string>>({});
  async function load(signal?: AbortSignal) {
    if (!session || !id) return;
    const current = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const [value, page, applications] = await Promise.all([
        dataRequest<DeliveryRequest>(
          session,
          "/v1/requests/" + encodeURIComponent(id),
          { signal },
        ),
        dataRequest<components["schemas"]["RegionPage"]>(
          session,
          "/v1/regions?limit=100",
          { signal },
        ),
        dataRequest<components["schemas"]["ApplicationPage"]>(
          session,
          `/v1/me/applications?request_id=${encodeURIComponent(id)}&limit=1`,
          { signal },
        ),
      ]);
      if (
        !signal?.aborted &&
        focused.current &&
        current === generation.current
      ) {
        setRequest(value);
        setApplication(applications.items[0] ?? null);
        setRegions(Object.fromEntries(page.items.map((x) => [x.id, x.label])));
      }
    } catch (e) {
      if (!signal?.aborted && focused.current && current === generation.current)
        setError(e instanceof Error ? e.message : "需求读取失败");
    } finally {
      if (!signal?.aborted && focused.current && current === generation.current)
        setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      const c = new AbortController();
      focused.current = true;
      setRequest(null);
      setApplication(null);
      setApplying(false);
      setManaging(false);
      setGapEditing(false);
      void load(c.signal);
      return () => {
        focused.current = false;
        generation.current++;
        c.abort();
      };
    }, [session?.access_token, id]),
  );
  const own = r?.publisher.user_id === session?.user.id;
  async function action(
    type: "publish" | "found" | "closed" | "discard" | "reopen",
  ) {
    if (!session || !r || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      if (type === "discard") {
        await dataRequest(session, `/v1/requests/${r.id}`, {
          method: "DELETE",
        });
        if (!focused.current || targetId.current !== r.id) return;
        router.replace({ pathname: "/requests", params: { mine: "1" } });
        return;
      }
      const body = {
          expected_version: r.version,
          ...(type === "publish" || type === "reopen" ? {} : { status: type }),
        },
        signature = type + ":" + r.version;
      attempts.current[signature] ??= randomUUID();
      const value = await dataRequest<DeliveryRequest>(
        session,
        `/v1/requests/${r.id}/${type === "publish" || type === "reopen" ? type : "close"}`,
        { method: "POST", body, key: attempts.current[signature] },
      );
      if (focused.current && targetId.current === r.id) setRequest(value);
    } catch (e) {
      if (focused.current && targetId.current === r.id)
        setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      lock.current = false;
      if (focused.current && targetId.current === r.id) setBusy(false);
    }
  }
  const detail = (label: string, value: string | null | undefined) =>
    value ? (
      <View style={{ gap: 6 }}>
        <Text style={s.secondary}>{label}</Text>
        <Text style={s.text}>{value}</Text>
      </View>
    ) : null;
  const delivery = r && !["vehicle_help", "other_help"].includes(r.kind);
  const canApply =
    r?.status === "open" &&
    (!delivery ||
      (Number(r.remaining_parcels) > 0 &&
        Number(r.remaining_parcels) >= Number(r.minimum_parcels ?? 1) &&
        (r.kind !== "extra_drivers" || Number(r.remaining_drivers) > 0)));
  const footer =
    r && own ? (
      <View
        style={{
          gap: 10,
        }}
      >
        <FormError message={error} />
        {r.status === "draft" ? (
          <>
            <ActionButton
              label="确认发布"
              busy={busy}
              onPress={() => void action("publish")}
            />
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="继续编辑"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: "/requests/new",
                      params: { edit: r.id },
                    })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  label="删除草稿"
                  secondary
                  disabled={busy}
                  onPress={() => setConfirmation("discard")}
                />
              </View>
            </View>
          </>
        ) : r.status === "open" ? (
          <>
            <ActionButton
              label="查看报名司机"
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/requests/applications",
                  params: { request_id: r.id },
                })
              }
            />
            <ActionButton
              label="管理需求"
              secondary
              disabled={busy}
              onPress={() => setManaging(true)}
            />
          </>
        ) : (
          <>
            <ActionButton
              label="重新开放"
              busy={busy}
              onPress={() => setConfirmation("reopen")}
            />
            <ActionButton
              label="管理需求"
              secondary
              disabled={busy}
              onPress={() => setManaging(true)}
            />
          </>
        )}
      </View>
    ) : r ? (
      <View style={{ gap: 10 }}>
        <FormError message={error} />
        {application?.status === "applied" ? (
          <ActionButton
            label="查看我的报名"
            onPress={() => router.push("/requests/applications")}
          />
        ) : canApply ? (
          <ActionButton
            label={delivery ? "报名支援" : "我能帮忙"}
            disabled={busy}
            onPress={() => setApplying(true)}
          />
        ) : null}
      </View>
    ) : undefined;
  return (
    <AuthPage
      compact
      title={r?.status === "draft" ? "预览需求" : "需求详情"}
      footer={footer}
    >
      {!r && busy ? <ActivityIndicator /> : null}
      {!own || !r ? <FormError message={error} /> : null}
      {error && !r ? (
        <ActionButton label="重新加载" secondary onPress={() => void load()} />
      ) : null}
      {r ? (
        <>
          <View style={s.row}>
            <Text style={s.status}>{statusLabels[r.status]}</Text>
            <Text style={s.secondary}>{r.publisher.display_name}</Text>
          </View>
          <Text style={s.headline}>{kindLabels[r.kind]}</Text>
          {detail("配送区域", regions[r.region_id ?? ""] ?? "未选择区域")}
          {delivery ? (
            <>
              {detail("取件区域", r.pickup_area)}
              {detail(
                "承运商 / 线路",
                [r.carrier, r.route_label].filter(Boolean).join(" · "),
              )}
              <View style={s.row}>
                <Text style={s.headline}>
                  {r.parcel_count !== null
                    ? `${r.parcel_count} 件`
                    : "件数未填写"}
                </Text>
                <Text style={s.price}>{requestPrice(r)}</Text>
              </View>
              {r.drivers_needed
                ? detail("本次人数", `${r.drivers_needed} 人`)
                : null}
              {r.status === "open" && r.remaining_parcels !== null
                ? detail("当前剩余", `${r.remaining_parcels} 件`)
                : null}
              {detail(
                "承接方式",
                r.kind === "whole_route" || !r.accepts_partial
                  ? "整批接手"
                  : r.minimum_parcels
                    ? `可以分担，每人至少 ${r.minimum_parcels} 件`
                    : "可以分担",
              )}
            </>
          ) : null}
          {detail("开始时间", requestTime(r.starts_at))}
          {detail("有效截止", requestTime(r.expires_at))}
          {detail(
            "最晚取件",
            r.pickup_deadline_at ? requestTime(r.pickup_deadline_at) : null,
          )}
          {detail(
            "配送截止",
            r.delivery_deadline_at ? requestTime(r.delivery_deadline_at) : null,
          )}
          {delivery ? (
            <>
              {detail(
                "理货状态",
                (
                  {
                    sorted: "已理货",
                    unsorted: "未理货",
                    unknown: "联系确认",
                  } as Record<string, string>
                )[r.sorted_state ?? ""],
              )}
              {detail(
                "包裹转交",
                (
                  {
                    carrier_account: "须有承运商账号",
                    dsp_approval: "须 DSP 确认",
                    contact_confirm: "联系后确认",
                  } as Record<string, string>
                )[r.handoff_requirement ?? ""],
              )}
              {detail(
                "配送经验",
                {
                  any: "不限",
                  delivery_experience: "有配送经验",
                  carrier_experience: "熟悉该承运商",
                }[r.experience_requirement],
              )}
              {detail("私下付款约定", r.private_payment_terms)}
            </>
          ) : null}
          {detail("说明", r.description)}
        </>
      ) : null}
      <Modal
        visible={!!confirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmation(null)}
      >
        <View
          style={{
            flex: 1,
            padding: 24,
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,.35)",
          }}
        >
          <View
            style={{
              borderRadius: 22,
              backgroundColor: tokens.color.surface,
              padding: 24,
              gap: 18,
            }}
          >
            <Text style={s.headline}>
              {confirmation === "discard"
                ? "删除这份草稿？"
                : confirmation === "reopen"
                  ? "重新开放这条需求？"
                  : confirmation === "found"
                    ? "确认已找到司机？"
                    : "关闭这条需求？"}
            </Text>
            {confirmation !== "discard" && confirmation !== "reopen" ? (
              <Text style={s.secondary}>结束后不再接受新的报名。</Text>
            ) : null}
            <ActionButton
              label="确认"
              variant={confirmation === "discard" ? "danger" : "primary"}
              onPress={() => {
                if (confirmation) void action(confirmation);
              }}
            />
            <ActionButton
              label="取消"
              secondary
              onPress={() => setConfirmation(null)}
            />
          </View>
        </View>
      </Modal>
      {r && applying ? (
        <ApplySheet
          request={r}
          regionLabel={regions[r.region_id ?? ""]}
          onClose={() => setApplying(false)}
          onRefresh={() => void load()}
        />
      ) : null}
      {r && gapEditing ? (
        <GapSheet
          request={r}
          onClose={() => setGapEditing(false)}
          onSaved={(value) => {
            setRequest(value);
            if (
              value.remaining_parcels === 0 &&
              (value.remaining_drivers === null ||
                value.remaining_drivers === 0)
            )
              Alert.alert("缺口已补齐", "是否标记为已找到？", [
                { text: "暂不结束", style: "cancel" },
                { text: "已找到", onPress: () => setConfirmation("found") },
              ]);
          }}
        />
      ) : null}
      <Modal
        visible={managing && !!r}
        transparent
        animationType="slide"
        onRequestClose={() => setManaging(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,.3)",
          }}
        >
          <View
            style={{
              backgroundColor: tokens.color.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
              gap: 14,
            }}
          >
            <Text style={s.headline}>管理需求</Text>
            <ActionButton
              label="编辑需求"
              secondary
              onPress={() => {
                setManaging(false);
                if (r)
                  router.push({
                    pathname: "/requests/new",
                    params: { edit: r.id },
                  });
              }}
            />
            <ActionButton
              label="复制为新需求"
              secondary
              onPress={() => {
                setManaging(false);
                if (r)
                  router.push({
                    pathname: "/requests/new",
                    params: { copy: r.id },
                  });
              }}
            />
            {r?.status === "open" && delivery ? (
              <ActionButton
                label="更新剩余缺口"
                secondary
                onPress={() => {
                  setManaging(false);
                  setGapEditing(true);
                }}
              />
            ) : null}
            {r?.status === "open" ? (
              <>
                <ActionButton
                  label="已找到司机"
                  secondary
                  onPress={() => {
                    setManaging(false);
                    setConfirmation("found");
                  }}
                />
                <ActionButton
                  label="关闭需求"
                  secondary
                  onPress={() => {
                    setManaging(false);
                    setConfirmation("closed");
                  }}
                />
              </>
            ) : (
              <ActionButton
                label="查看报名司机"
                secondary
                onPress={() => {
                  setManaging(false);
                  if (r)
                    router.push({
                      pathname: "/requests/applications",
                      params: { request_id: r.id },
                    });
                }}
              />
            )}
            <ActionButton
              label="取消"
              secondary
              onPress={() => setManaging(false)}
            />
          </View>
        </View>
      </Modal>
    </AuthPage>
  );
}
