import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { useAuth } from "../../auth/AuthProvider";
import { AuthPage, ActionButton, FormError } from "../../auth/AuthControls";
import { dataRequest } from "../../apartments/client";
import { RequestGate, requestStyles as s } from "../../requests/RequestUi";
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
      "found" | "closed" | "discard" | null
    >(null);
  const focused = useRef(false);
  const lock = useRef(false),
    attempts = useRef<Record<string, string>>({});
  async function load(signal?: AbortSignal) {
    if (!session || !id) return;
    setBusy(true);
    setError(null);
    try {
      const [value, page] = await Promise.all([
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
      ]);
      if (!signal?.aborted) {
        setRequest(value);
        setRegions(Object.fromEntries(page.items.map((x) => [x.id, x.label])));
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "需求读取失败");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useFocusEffect(
    useCallback(() => {
      const c = new AbortController();
      focused.current = true;
      void load(c.signal);
      return () => {
        focused.current = false;
        c.abort();
      };
    }, [session?.access_token, id]),
  );
  const own = r?.publisher.user_id === session?.user.id;
  async function action(type: "publish" | "found" | "closed" | "discard") {
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
        if (!focused.current) return;
        router.replace({ pathname: "/requests", params: { mine: "1" } });
        return;
      }
      const body = {
          expected_version: r.version,
          ...(type === "publish" ? {} : { status: type }),
        },
        signature = type + ":" + r.version;
      attempts.current[signature] ??= randomUUID();
      const value = await dataRequest<DeliveryRequest>(
        session,
        `/v1/requests/${r.id}/${type === "publish" ? "publish" : "close"}`,
        { method: "POST", body, key: attempts.current[signature] },
      );
      if (focused.current) setRequest(value);
    } catch (e) {
      if (focused.current)
        setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      lock.current = false;
      if (focused.current) setBusy(false);
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
  const footer =
    r && own ? (
      <View
        style={{
          padding: 16,
          gap: 10,
          backgroundColor: tokens.color.surface,
          borderTopWidth: 1,
          borderColor: tokens.color.border,
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
              label="已找到司机"
              busy={busy}
              onPress={() => setConfirmation("found")}
            />
            <ActionButton
              label="关闭需求"
              secondary
              disabled={busy}
              onPress={() => setConfirmation("closed")}
            />
          </>
        ) : (
          <ActionButton
            label="我的发布"
            secondary
            onPress={() =>
              router.replace({ pathname: "/requests", params: { mine: "1" } })
            }
          />
        )}
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
                : confirmation === "found"
                  ? "确认已找到司机？"
                  : "关闭这条需求？"}
            </Text>
            {confirmation !== "discard" ? (
              <Text style={s.secondary}>结束后不再接受新的报名。</Text>
            ) : null}
            <ActionButton
              label="确认"
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
    </AuthPage>
  );
}
