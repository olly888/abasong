import { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../auth/AuthProvider";
import { Field, ActionButton, FormError } from "../auth/AuthControls";
import { dataRequest } from "../apartments/client";
import { AccountError } from "../auth/api-client";
import {
  localDateTime,
  laInstant,
  requestPrice,
  type DeliveryRequest,
} from "./presentation";
import { requestStyles as s, RequestSheet } from "./RequestUi";
export function ApplySheet({
  request: r,
  onClose,
  onRefresh,
}: {
  request: DeliveryRequest;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { session } = useAuth(),
    initial = localDateTime(
      new Date(
        Math.max(Date.now() + 15 * 60000, Date.parse(r.starts_at ?? "")),
      ).toISOString(),
    );
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time),
    [capacity, setCapacity] = useState(
      r.accepts_partial ? "" : String(r.remaining_parcels ?? ""),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [changed, setChanged] = useState(false);
  const lock = useRef(false),
    attempt = useRef({ signature: "", key: randomUUID() });
  const delivery = !["vehicle_help", "other_help"].includes(r.kind);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function apply() {
    if (!session || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (delivery && (!/^\d+$/.test(capacity) || Number(capacity) < 1))
        throw new Error("请填写本次可接件数");
      const body = {
        expected_arrival_at: laInstant(date, time),
        observed_request_version: r.version,
        ...(delivery ? { capacity_parcels: Number(capacity) } : {}),
      };
      const signature = JSON.stringify(body);
      if (attempt.current.signature !== signature)
        attempt.current = { signature, key: randomUUID() };
      const result = await dataRequest<components["schemas"]["Application"]>(
        session,
        `/v1/requests/${r.id}/applications`,
        { method: "POST", body, key: attempt.current.key },
      );
      if (!mounted.current) return;
      onClose();
      onRefresh();
      router.push({
        pathname: "/conversations/[id]",
        params: { id: result.conversation_id },
      });
    } catch (e) {
      if (
        mounted.current &&
        e instanceof AccountError &&
        ["VERSION_CONFLICT", "REQUEST_ENDED", "ALREADY_APPLIED"].includes(
          e.code,
        )
      )
        setChanged(true);
      if (mounted.current)
        setError(e instanceof Error ? e.message : "报名失败，请重试");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <RequestSheet
      onRequestClose={() => {
        if (!lock.current) onClose();
      }}
    >
      <Text style={s.headline}>{delivery ? "报名支援" : "我能帮忙"}</Text>
      <Text style={s.text}>
        {r.carrier} {r.route_label}
      </Text>
      {delivery ? (
        <Text style={s.price}>
          {requestPrice(r)} · 剩余 {r.remaining_parcels} 件
        </Text>
      ) : null}
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="可到日期"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            editable={!busy}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="可到时间"
            value={time}
            onChangeText={setTime}
            placeholder="HH:mm"
            editable={!busy}
          />
        </View>
      </View>
      {delivery ? (
        <Field
          label={r.accepts_partial ? "本次可接件数" : "整批件数"}
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
          editable={!busy && r.accepts_partial}
        />
      ) : null}
      <FormError message={error} />
      {changed ? (
        <ActionButton
          label="查看当前需求"
          onPress={() => {
            onClose();
            onRefresh();
          }}
        />
      ) : (
        <ActionButton
          label="提交报名"
          busy={busy}
          onPress={() => void apply()}
        />
      )}
      <ActionButton label="取消" secondary disabled={busy} onPress={onClose} />
    </RequestSheet>
  );
}
