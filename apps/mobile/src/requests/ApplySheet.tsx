import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../auth/AuthProvider";
import { ActionButton, FormError } from "../auth/AuthControls";
import { ApplicationFields } from "./ApplicationFields";
import { dataRequest } from "../apartments/client";
import { AccountError } from "../auth/api-client";
import { type DeliveryRequest } from "./presentation";
import { initialApplication, applicationInput } from "./application-input";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { useCallback } from "react";
import { requestStyles as s, RequestSheet } from "./RequestUi";
export function ApplySheet({
  request: r,
  regionLabel,
  onClose,
  onRefresh,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { session } = useAuth();
  const transport: ContributionRequest = useCallback(
    (path, options) => {
      if (!session) return Promise.reject(new Error("请先登录"));
      return dataRequest(session, path, options);
    },
    [session?.access_token],
  );
  return (
    <ApplicationSheet
      request={r}
      regionLabel={regionLabel}
      transport={transport}
      onClose={onClose}
      onRefresh={onRefresh}
      onApplied={(result) => {
        onClose();
        onRefresh();
        router.push({
          pathname: "/conversations/[id]",
          params: { id: result.conversation_id },
        });
      }}
    />
  );
}
export function ApplicationSheet({
  request: r,
  regionLabel,
  transport,
  onClose,
  onRefresh,
  onApplied,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  transport: ContributionRequest;
  onClose: () => void;
  onRefresh: () => void;
  onApplied: (a: components["schemas"]["Application"]) => void;
}) {
  const initial = initialApplication(r);
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time),
    [capacity, setCapacity] = useState(initial.capacity),
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
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const body = applicationInput(r, date, time, capacity);
      const signature = JSON.stringify(body);
      if (attempt.current.signature !== signature)
        attempt.current = { signature, key: randomUUID() };
      const result = await transport<components["schemas"]["Application"]>(
        `/v1/requests/${r.id}/applications`,
        { method: "POST", body, key: attempt.current.key },
      );
      if (!mounted.current) return;
      onApplied(result);
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
      <Text style={s.headline}>{delivery ? "报名接活" : "我能帮忙"}</Text>
      <ApplicationFields
        request={r}
        regionLabel={regionLabel}
        date={date}
        time={time}
        capacity={capacity}
        disabled={busy}
        onDate={setDate}
        onTime={setTime}
        onCapacity={setCapacity}
      />
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
      <ActionButton
        label="取消"
        variant="text"
        disabled={busy}
        onPress={onClose}
      />
    </RequestSheet>
  );
}
