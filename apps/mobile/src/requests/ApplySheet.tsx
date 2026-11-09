import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import type { components } from "@abasong/contracts";
import { useAuth } from "../auth/AuthProvider";
import { ActionButton, FormError } from "../auth/AuthControls";
import { ApplicationFields } from "./ApplicationFields";
import { dataRequest } from "../apartments/client";
import { AccountError } from "../auth/api-client";
import { type DeliveryRequest } from "./presentation";
import { ApplicationFieldError, initialApplication } from "./application-input";
import { createApplicationAttempt } from "./application-attempt";
import type { ContributionRequest } from "../apartments/contribution-address-search";
import { requestStyles as s, RequestSheet } from "./RequestUi";
export function ApplySheet({
  request: r,
  regionLabel,
  pickupRegionLabel,
  onClose,
  onRefresh,
  onApplied,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  pickupRegionLabel?: string;
  onClose: () => void;
  onRefresh: () => void;
  onApplied: (application: components["schemas"]["Application"]) => void;
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
      pickupRegionLabel={pickupRegionLabel}
      transport={transport}
      onClose={onClose}
      onRefresh={onRefresh}
      onApplied={(result) => {
        onClose();
        onApplied(result);
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
  pickupRegionLabel,
  transport,
  onClose,
  onRefresh,
  onApplied,
  testControls,
}: {
  request: DeliveryRequest;
  regionLabel?: string;
  pickupRegionLabel?: string;
  transport: ContributionRequest;
  onClose: () => void;
  onRefresh: () => void;
  onApplied: (a: components["schemas"]["Application"]) => void;
  testControls?: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  const largeType = fontScale >= 1.6;
  const observed = useRef(r).current;
  const [initial] = useState(() => initialApplication(observed));
  const [date, setDate] = useState(initial.date),
    [time, setTime] = useState(initial.time),
    [capacity, setCapacity] = useState(initial.capacity),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [fieldError, setFieldError] = useState<ApplicationFieldError | null>(null),
    [conflict, setConflict] = useState(false);
  function clearErrors() {
    setError(null);
    setFieldError(null);
  }
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
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const content = useRef<ComponentRef<typeof View>>(null);
  const anchors = useRef(new Map<string, ComponentRef<typeof View>>());
  useEffect(() => {
    if (!fieldError) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const locate = (attempt: number) => {
      if (stopped) return;
      const retry = () => {
        if (attempt < 4) timer = setTimeout(() => locate(attempt + 1), 50);
      };
      const node = anchors.current.get(fieldError.field);
      if (!node || !content.current) return retry();
      node.measureLayout(
        content.current,
        (_x, y) => {
          if (stopped) return;
          scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
          AccessibilityInfo.announceForAccessibility(fieldError.message);
        },
        retry,
      );
    };
    timer = setTimeout(() => locate(0), 50);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fieldError]);
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
    clearErrors();
    try {
      const result = await attempt.current(r, date, time, capacity);
      if (!mounted.current) return;
      if (result) onApplied(result);
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApplicationFieldError) {
        setFieldError(e);
      } else if (e instanceof AccountError && e.code === "INVALID_ARRIVAL") {
        setFieldError(new ApplicationFieldError("arrival", e.message));
      } else if (e instanceof AccountError && e.code === "INVALID_CAPACITY") {
        setFieldError(new ApplicationFieldError("capacity", e.message));
      } else {
        if (
          e instanceof AccountError &&
          [
            "VERSION_CONFLICT",
            "REQUEST_ENDED",
            "NO_REMAINING_GAP",
            "ALREADY_APPLIED",
          ].includes(e.code)
        )
          setConflict(true);
        setError(e instanceof Error ? e.message : "报名未确认，请重试");
      }
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
      scrollRef={scroll}
      footer={
        <View style={{ gap: 6 }}>
          <FormError
            message={
              error ??
              (changed ? "需求条件已更新，请查看当前需求后重新报名" : null)
            }
          />
          <View style={largeType ? { gap: 8 } : s.row}>
            <View style={largeType ? undefined : { flex: 1 }}>
              <ActionButton
                label="取消"
                variant="text"
                disabled={busy}
                onPress={onClose}
              />
            </View>
            <View style={largeType ? undefined : { flex: 2 }}>
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
                  label={error ? "重试报名" : "提交报名"}
                  busy={busy}
                  onPress={() => void apply()}
                />
              )}
            </View>
          </View>
        </View>
      }
    >
      <View ref={content} collapsable={false} style={{ gap: 20 }}>
        {testControls}
        <Text style={s.headline}>{delivery ? "报名接活" : "我能帮忙"}</Text>
        <ApplicationFields
          request={observed}
          regionLabel={regionLabel}
          pickupRegionLabel={pickupRegionLabel}
          date={date}
          time={time}
          capacity={capacity}
          anchor={(field, children) => (
            <View
              key={field}
              collapsable={false}
              ref={(node) => {
                if (node) anchors.current.set(field, node);
                else anchors.current.delete(field);
              }}
            >
              {children}
            </View>
          )}
          disabled={busy || changed}
          arrivalError={
            fieldError?.field === "arrival" ? fieldError.message : undefined
          }
          capacityError={
            fieldError?.field === "capacity" ? fieldError.message : undefined
          }
          onDate={(value) => {
            setDate(value);
            clearErrors();
          }}
          onTime={(value) => {
            setTime(value);
            clearErrors();
          }}
          onCapacity={(value) => {
            setCapacity(value);
            clearErrors();
          }}
        />
      </View>
    </RequestSheet>
  );
}
