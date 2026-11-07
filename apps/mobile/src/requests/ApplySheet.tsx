import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { initialApplication } from "./application-input";
import { createApplicationAttempt } from "./application-attempt";
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
  testControls,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  transport: ContributionRequest;
  onClose: () => void;
  onRefresh: () => void;
  onApplied: (a: components["schemas"]["Application"]) => void;
  testControls?: ReactNode;
}) {
  const observed = useRef(r).current;
  const initial = initialApplication(observed);
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time),
    [capacity, setCapacity] = useState(initial.capacity),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [conflict, setConflict] = useState(false);
  const changed =
    conflict || observed.id !== r.id || observed.version !== r.version;
  const latest = useRef(transport);
  latest.current = transport;
  const lock = useRef(false),
    attempt = useRef(
      createApplicationAttempt(
        observed,
        (path, options) => latest.current(path, options),
        randomUUID,
      ),
    );
  const delivery = !["vehicle_help", "other_help"].includes(r.kind);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function apply() {
    if (lock.current || changed) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await attempt.current(r, date, time, capacity);
      if (!mounted.current) return;
      if (result) onApplied(result);
    } catch (e) {
      if (
        mounted.current &&
        e instanceof AccountError &&
        ["VERSION_CONFLICT", "REQUEST_ENDED", "ALREADY_APPLIED"].includes(
          e.code,
        )
      )
        setConflict(true);
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
      {testControls}
      <Text style={s.headline}>{delivery ? "报名接活" : "我能帮忙"}</Text>
      <ApplicationFields
        request={observed}
        regionLabel={regionLabel}
        date={date}
        time={time}
        capacity={capacity}
        disabled={busy || changed}
        onDate={setDate}
        onTime={setTime}
        onCapacity={setCapacity}
      />
      <FormError
        message={
          error ?? (changed ? "需求条件已更新，请查看当前需求后重新报名" : null)
        }
      />
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
