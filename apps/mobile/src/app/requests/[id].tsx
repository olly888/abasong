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
import { DeliveryDetailBody } from "../../requests/DeliveryDetailBody";
import type { ContributionRequest } from "../../apartments/contribution-address-search";
import { GapSheet } from "../../requests/GapSheet";
import {
  canApplyTo,
  hasEditableGap,
  isV2,
  requestPickupRegion,
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
  const own = !!r && r.publisher.user_id === session?.user.id;
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
        signature = `${r.id}:${type}:${r.version}`;
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
  const delivery = r && !["vehicle_help", "other_help"].includes(r.kind);
  const canApply = r && canApplyTo(r);
  const transport: ContributionRequest = useCallback(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
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
              label={isV2(r) ? "核对需求" : "确认发布"}
              busy={busy}
              onPress={() => {
                if (isV2(r))
                  router.push({
                    pathname: "/requests/new",
                    params: { edit: r.id },
                  });
                else void action("publish");
              }}
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
              label="管理需求"
              disabled={busy}
              onPress={() => setManaging(true)}
            />
            <ActionButton
              label="查看报名司机"
              secondary
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/requests/applications",
                  params: { request_id: r.id },
                })
              }
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
            onPress={() =>
              router.push({
                pathname: "/requests/applications",
                params: { for_request: r.id },
              })
            }
          />
        ) : canApply ? (
          <ActionButton
            label={delivery ? "报名接活" : "我能帮忙"}
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
      {!r ? <FormError message={error} /> : null}
      {error && !r ? (
        <ActionButton label="重新加载" secondary onPress={() => void load()} />
      ) : null}
      {r ? (
        <DeliveryDetailBody
          request={r}
          regions={regions}
          transport={transport}
        />
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
          pickupRegionLabel={requestPickupRegion(r, regions)}
          onClose={() => setApplying(false)}
          onRefresh={() => void load()}
          onApplied={setApplication}
        />
      ) : null}
      {r && gapEditing ? (
        <GapSheet
          request={r}
          onRefresh={() => void load()}
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
            {r?.status === "open" && delivery && hasEditableGap(r) ? (
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
