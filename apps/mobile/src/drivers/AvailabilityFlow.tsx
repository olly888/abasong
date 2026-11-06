import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, AppState } from "react-native";
import { useFocusEffect, usePreventRemove } from "expo-router";
import type { components } from "@abasong/contracts";
import { AvailabilityEditor } from "./AvailabilityEditor";
import {
  availabilityDraftKey,
  availabilityFields,
  availabilitySummary,
} from "./availability-fields";
import {
  availabilityConflict,
  createAvailabilitySession,
  type AvailabilityRequest,
} from "./availability-session";
type S = components["schemas"];
export function AvailabilityFlow({
  request,
  onSaved,
  onCancel,
  testControls,
}: {
  request: AvailabilityRequest;
  onSaved: (value: S["Availability"]) => void;
  onCancel: () => void;
  testControls?: ReactNode;
}) {
  const editor = useMemo(() => createAvailabilitySession(request), [request]);
  const [form, setForm] = useState(() => availabilityFields(null)),
    [current, setCurrent] = useState<S["Availability"] | null>(null),
    [regions, setRegions] = useState<S["Region"][]>([]),
    [error, setError] = useState<string | null>(null),
    [regionError, setRegionError] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [leaving, setLeaving] = useState(false),
    [clock, setClock] = useState(Date.now());
  const baseline = useRef(availabilityDraftKey(form)),
    visible = useRef(false),
    working = useRef(false);
  const dirty = availabilityDraftKey(form) !== baseline.current;
  const load = useCallback(async () => {
    if (working.current) return;
    setLoading(true);
    setReady(false);
    setError(null);
    try {
      const result = await editor.load();
      if (!visible.current || !result) return;
      const f = availabilityFields(result.value);
      baseline.current = availabilityDraftKey(f);
      setForm(f);
      setCurrent(result.value);
      setRegions(result.regions);
      setRegionError(result.regionError);
      setConflict(false);
      setReady(true);
    } catch (e) {
      if (visible.current)
        setError(e instanceof Error ? e.message : "状态读取失败，请重试");
    } finally {
      if (visible.current) setLoading(false);
    }
  }, [editor]);
  useFocusEffect(
    useCallback(() => {
      visible.current = true;
      void load();
      return () => {
        visible.current = false;
        editor.cancel();
      };
    }, [editor, load]),
  );
  const disablePrevention = usePreventRemove(
    !leaving && (dirty || busy),
    ({ repeat }) => {
      if (working.current) return;
      Alert.alert("放弃本次修改？", "未保存的修改不会生效。", [
        { text: "继续设置", style: "cancel" },
        {
          text: "放弃修改",
          style: "destructive",
          onPress: () => {
            setLeaving(true);
            repeat();
          },
        },
      ]);
    },
  );
  function cancel() {
    if (working.current) return;
    const leave = () => {
      setLeaving(true);
      disablePrevention();
      onCancel();
    };
    if (dirty)
      Alert.alert("放弃本次修改？", "未保存的修改不会生效。", [
        { text: "继续设置", style: "cancel" },
        { text: "放弃修改", style: "destructive", onPress: leave },
      ]);
    else leave();
  }
  function reload() {
    if (working.current) return;
    if (dirty)
      Alert.alert("读取最新状态？", "会替换本次未保存的填写。", [
        { text: "继续设置", style: "cancel" },
        { text: "读取并替换", onPress: () => void load() },
      ]);
    else void load();
  }
  // Foreground/midnight/expiry updates change display only, never write or renew.
  useEffect(() => {
    const now = Date.now(),
      boundaries = [
        Date.parse(current?.starts_at ?? ""),
        Date.parse(current?.ends_at ?? ""),
      ].filter((v) => v > now);
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(60000, ...boundaries.map((v) => v - now + 25)),
    );
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setClock(Date.now());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [current?.starts_at, current?.ends_at, clock]);
  useEffect(() => {
    if (
      !dirty &&
      form.enabled &&
      current?.enabled &&
      Date.parse(current.ends_at) <= clock
    ) {
      const f = availabilityFields(current, clock);
      baseline.current = availabilityDraftKey(f);
      setForm(f);
    }
  }, [clock, current, dirty, form.enabled]);
  async function save() {
    if (!ready || working.current || conflict) return;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      if (
        form.enabled &&
        (regionError ||
          form.regions.some((id) => !regions.some((r) => r.id === id)))
      )
        throw new Error("请读取区域并重新选择可去区域");
      const result = await editor.save(form);
      if (!visible.current || !result) return;
      setCurrent(result);
      baseline.current = availabilityDraftKey(availabilityFields(result));
      setLeaving(true);
      disablePrevention();
      onSaved(result);
    } catch (e) {
      if (visible.current) {
        setConflict(availabilityConflict(e));
        setError(
          e instanceof Error
            ? e.message
            : "保存结果未确认，请重试或读取最新状态",
        );
      }
    } finally {
      working.current = false;
      if (visible.current) setBusy(false);
    }
  }
  return (
    <AvailabilityEditor
      form={form}
      regions={regions}
      busy={busy || loading}
      loading={loading}
      ready={ready}
      error={error}
      status={availabilitySummary(current, clock)}
      regionError={regionError}
      conflict={conflict}
      saveDisabled={loading || (!conflict && form.enabled && !!regionError)}
      testControls={testControls}
      onChange={(f) => {
        setForm(f);
        setError(null);
      }}
      onSave={() => void save()}
      onReload={reload}
      onBack={cancel}
    />
  );
}
