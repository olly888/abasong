import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import {
  ActionButton,
  ApartmentPage,
  Field,
  FormError,
} from "../auth/AuthControls";
import { AccountError } from "../auth/api-client";
import { AddressLine } from "./AddressLine";
import type { ContributionRequest } from "./contribution-address-search";
import { createContributionAttempt } from "./contribution-attempt";
type S = components["schemas"];
export function CorrectionForm(p: {
  id: string;
  request: ContributionRequest;
  onBack: () => void;
  onSaved: (result: S["ContributionChangeResult"]) => void;
  testControls?: ReactNode;
}) {
  const { id } = p;
  const latest = useRef(p);
  latest.current = p;
  const controller = useRef(new AbortController()),
    attempt = useRef(createContributionAttempt(randomUUID));
  const [source, setSource] = useState<S["ContributionSummary"] | null>(null),
    [value, setValue] = useState(""),
    [scope, setScope] = useState(""),
    [attested, setAttested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [conflict, setConflict] = useState(false),
    [committed, setCommitted] = useState(false);
  const request = <T,>(
    path: string,
    options: Parameters<ContributionRequest>[1] = {},
  ) =>
    latest.current.request<T>(path, {
      ...options,
      signal: options.signal ?? controller.current.signal,
    });
  async function load() {
    const signal = controller.current.signal;
    setSource((old) => (old?.id === id ? old : null));
    setBusy(true);
    setError(null);
    try {
      const s = await request<S["ContributionSummary"]>(
        "/v1/me/contributions/" + id + "/summary",
        { signal },
      );
      if (signal.aborted) return;
      if (s.id !== id) throw new Error("贡献资料与所选记录不一致，请重新读取");
      setSource(s);
      setScope(s.scope_label);
      setConflict(false);
      setValue("");
      setAttested(false);
    } catch (e) {
      if (!signal.aborted)
        setError(e instanceof Error ? e.message : "暂时无法读取贡献");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    controller.current = new AbortController();
    attempt.current = createContributionAttempt(randomUUID);
    const current = controller.current,
      policy = attempt.current;
    void load();
    return () => {
      current.abort();
      policy.dispose();
    };
  }, [id]);
  function back() {
    latest.current.onBack();
  }
  async function submit() {
    if (
      !source ||
      source.id !== id ||
      !source.can_correct ||
      !value.trim() ||
      !scope.trim() ||
      !attested ||
      conflict ||
      committed
    )
      return;
    const body = {
      expected_version: source.version,
      value: value.trim(),
      scope: { label: scope.trim() },
      source_attested: true as const,
    };
    const intent = attempt.current.begin(source.id, JSON.stringify(body));
    if (!intent) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<S["ContributionChangeResult"]>(
        "/v1/me/contributions/" + source.id + "/corrections",
        { method: "POST", body, key: intent.recordKey },
      );
      attempt.current.finish(true);
      if (controller.current.signal.aborted) return;
      setCommitted(true);
      setValue("");
      setAttested(false);
      latest.current.onSaved(result);
    } catch (e) {
      attempt.current.finish();
      if (controller.current.signal.aborted) return;
      if (
        e instanceof AccountError &&
        ["VERSION_CONFLICT", "SOURCE_UNAVAILABLE"].includes(e.code)
      )
        setConflict(true);
      setError(e instanceof Error ? e.message : "纠正失败，请重试");
    } finally {
      if (!controller.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <ApartmentPage
      title="纠正密码"
      onBack={() => {
        if (!busy) back();
      }}
      footer={
        <>
          <FormError message={error} />
          {source?.can_correct && !committed ? (
            conflict ? (
              <ActionButton
                label="刷新当前记录"
                variant="secondary"
                busy={busy}
                onPress={() => void load()}
              />
            ) : (
              <ActionButton
                label="确认纠正并共享"
                busy={busy}
                disabled={!value.trim() || !scope.trim() || !attested}
                onPress={() => void submit()}
              />
            )
          ) : null}
        </>
      }
    >
      {p.testControls}
      {!source ? (
        <ActionButton
          label="重新读取"
          secondary
          busy={busy}
          onPress={() => void load()}
        />
      ) : (
        <>
          <AddressLine line={source.address_label} expanded />
          {committed ? (
            <>
              <Text>已纠正并共享</Text>
              <ActionButton label="返回共享记录" onPress={back} />
            </>
          ) : !source.can_correct ? (
            <>
              <Text>这条贡献当前不能纠正</Text>
              <ActionButton label="返回共享记录" secondary onPress={back} />
            </>
          ) : (
            <>
              <Field
                label="正确密码"
                value={value}
                onChangeText={(v) => {
                  setValue(v);
                  setAttested(false);
                }}
                maxLength={32}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                editable={!busy && !conflict}
              />
              <Field
                label="门别"
                value={scope}
                onChangeText={(v) => {
                  setScope(v);
                  setAttested(false);
                }}
                maxLength={100}
                editable={!busy && !conflict}
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="我已核对，并有权共享这条资料"
                accessibilityState={{
                  checked: attested,
                  disabled: busy || conflict,
                }}
                disabled={busy || conflict}
                onPress={() => setAttested((v) => !v)}
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text
                  style={{ fontSize: 24, color: tokens.color.brandText }}
                >
                  {attested ? "☑" : "□"}
                </Text>
                <Text style={{ flex: 1 }}>我已核对，并有权共享这条资料</Text>
              </Pressable>
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  color: tokens.color.textSecondary,
                }}
              >
                纠正仅结束你的旧贡献，其他司机的贡献和反馈保留。
              </Text>

              <View>
                <ActionButton
                  label="取消"
                  secondary
                  disabled={busy}
                  onPress={back}
                />
              </View>
            </>
          )}
        </>
      )}
    </ApartmentPage>
  );
}
