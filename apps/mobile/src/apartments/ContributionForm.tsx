import { useCallback, useEffect, useRef, useState } from "react";
import { Text, Pressable, View } from "react-native";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import {
  ActionButton,
  ApartmentPage,
  Field,
  FormError,
} from "../auth/AuthControls";
import { createContributionAttempt } from "./contribution-attempt";
import { ContributionAddressField } from "./ContributionAddressField";
import {
  privateAddressText,
  validContributionAddress,
  type ContributionAddress,
  type ContributionRequest,
} from "./contribution-address-search";
type S = components["schemas"];
export function ContributionForm(p: {
  initialApartmentId?: string;
  initialAddress?: S["SearchAddress"] | null;
  initialPrivate?: boolean;
  canContribute: boolean;
  request: ContributionRequest;
  onShared: (id: string, outcome: S["ContributionResult"]["outcome"]) => void;
  onPrivateSaved: () => void;
  onBack?: () => void;
}) {
  const [isPrivate, setPrivate] = useState(!!p.initialPrivate),
    [address, setAddress] = useState<ContributionAddress>(
      p.initialAddress
        ? { kind: "address", address: p.initialAddress }
        : { kind: "pending" },
    ),
    [value, setValue] = useState(""),
    [scope, setScope] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<string | null>(null);
  const current = useRef(p);
  current.current = p;
  const control = useRef(new AbortController()),
    attempt = useRef(createContributionAttempt(randomUUID));
  const changeAddress = useCallback((next: ContributionAddress) => {
    setAddress(next);
    setConfirmed(false);
    setError(null);
  }, []);
  const request = useCallback<ContributionRequest>(
    (path, options) =>
      current.current.request(path, {
        ...options,
        signal: options?.signal ?? control.current.signal,
      }),
    [],
  );
  useEffect(() => {
    control.current = new AbortController();
    attempt.current = createContributionAttempt(randomUUID);
    return () => {
      control.current.abort();
      attempt.current.dispose();
    };
  }, []);
  const ready = validContributionAddress(address, isPrivate),
    canSubmit =
      ready &&
      !!value.trim() &&
      (!isPrivate || !!scope.trim()) &&
      (isPrivate || (confirmed && p.canContribute));
  async function submit() {
    if (busy || !canSubmit) return;
    const target = address.kind === "apartment" ? address.apartment : null;
    const postal = address.kind === "address" ? address.address : null;
    const privateText = privateAddressText(address);
    const entryFingerprint = JSON.stringify({
      isPrivate,
      target: target?.id ?? null,
      address: target ? null : isPrivate ? privateText : postal,
    });
    const bodyFingerprint = JSON.stringify({
      entryFingerprint,
      value,
      scope,
      confirmed,
    });
    const intent = attempt.current.begin(entryFingerprint, bodyFingerprint);
    if (!intent) return;
    setBusy(true);
    setAttempted(true);
    setError(null);
    let committed = false;
    try {
      if (isPrivate) {
        const entry = await request<S["LibraryEntry"]>(
          "/v1/me/apartment-library",
          {
            method: "POST",
            key: intent.entryKey,
            body: target
              ? { apartment_id: target.id }
              : { address: privateText },
          },
        );
        if (control.current.signal.aborted) return;
        await request("/v1/me/apartment-library/" + entry.id + "/records", {
          method: "POST",
          key: intent.recordKey,
          body: { value, scope_label: scope },
        });
        if (control.current.signal.aborted) return;
        committed = true;
        setValue("");
        current.current.onPrivateSaved();
      } else {
        if (!target && !postal) return;
        const content = {
          method: "keypad",
          value,
          ...(scope.trim() ? { scope: { label: scope.trim() } } : {}),
          source_attested: true,
        };
        let result: S["ContributionResult"], apartmentId: string;
        if (target) {
          result = await request<S["ContributionResult"]>(
            "/v1/apartments/" + target.id + "/access-records",
            { method: "POST", key: intent.recordKey, body: content },
          );
          apartmentId = target.id;
        } else {
          const created = await request<S["AddressContributionResult"]>(
            "/v1/apartments/address-contributions",
            {
              method: "POST",
              key: intent.recordKey,
              body: { ...content, address: postal!, address_confirmed: true },
            },
          );
          result = created.contribution;
          apartmentId = created.apartment.id;
        }
        if (control.current.signal.aborted) return;
        committed = true;
        setValue("");
        setConfirmed(false);
        current.current.onShared(apartmentId, result.outcome);
      }
    } catch (e) {
      if (!control.current.signal.aborted)
        setError(e instanceof Error ? e.message : "提交失败，请重试");
    } finally {
      attempt.current.finish(committed);
      if (!control.current.signal.aborted) setBusy(false);
    }
  }
  return (
    <ApartmentPage
      title={isPrivate ? "添加私人记录" : "添加门禁码"}
      onBack={p.onBack}
      footer={
        <>
          <FormError message={error} />
          <ActionButton
            label={isPrivate ? "仅自己保存" : "确认共享"}
            busy={busy}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
          {!attempted ? (
            <ActionButton
              label={isPrivate ? "改为共享门禁码" : "改为仅自己保存"}
              variant="text"
              disabled={busy}
              onPress={() => {
                setPrivate((v) => !v);
                setConfirmed(false);
                setError(null);
              }}
            />
          ) : null}
        </>
      }
    >
      <ContributionAddressField
        value={address}
        initialApartmentId={p.initialApartmentId}
        isPrivate={isPrivate}
        disabled={busy}
        request={request}
        onChange={changeAddress}
      />
      <Field
        label="门禁码"
        placeholder="保留 #、* 和开头的 0"
        value={value}
        editable={!busy}
        onChangeText={(v) => {
          setValue(v);
          setConfirmed(false);
        }}
        maxLength={32}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label={isPrivate ? "门别" : "门别（选填）"}
        placeholder="例如：行人门"
        value={scope}
        editable={!busy}
        onChangeText={(v) => {
          setScope(v);
          setConfirmed(false);
        }}
        maxLength={100}
      />
      {!isPrivate && !p.canContribute ? (
        <Text style={{ color: tokens.color.textSecondary }}>
          暂未开通共享资格
        </Text>
      ) : null}
      {!isPrivate ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed, disabled: busy || !ready }}
          disabled={busy || !ready}
          onPress={() => setConfirmed((v) => !v)}
          style={{
            flexDirection: "row",
            gap: 10,
            alignItems: "center",
            minHeight: 48,
          }}
        >
          <View
            style={{
              height: 20,
              width: 20,
              borderWidth: 1.5,
              borderColor: confirmed
                ? tokens.color.brandPrimary
                : tokens.color.controlBorder,
              borderRadius: 4,
              backgroundColor: confirmed
                ? tokens.color.brandPrimary
                : tokens.color.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {confirmed ? (
              <Text style={{ color: tokens.color.onBrand, fontSize: 14 }}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 22,
              color: tokens.color.ink,
              flex: 1,
            }}
          >
            我已核对公寓地址，并有权共享
          </Text>
        </Pressable>
      ) : null}
    </ApartmentPage>
  );
}
