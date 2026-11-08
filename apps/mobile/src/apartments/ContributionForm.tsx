import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, ApartmentPage, FormError } from "../auth/AuthControls";
import { createContributionAttempt } from "./contribution-attempt";
import { ContributionAddressField } from "./ContributionAddressField";
import { unspecifiedDoor } from "./DoorScopeField";
import {
  privateAddressText,
  validContributionAddress,
  type ContributionAddress,
  type ContributionRequest,
} from "./contribution-address-search";
import { AccessCodeFields } from "./AccessCodeFields";
import { CheckField } from "../ui/CheckField";
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
      ready && !!value.trim() && (isPrivate || (confirmed && p.canContribute));
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
          body: { value, scope_label: scope || unspecifiedDoor },
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
          ...(scope ? { scope: { label: scope } } : {}),
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
      <AccessCodeFields
        value={value}
        scope={scope}
        disabled={busy}
        onValueChange={(v) => {
          setValue(v);
          setConfirmed(false);
        }}
        onScopeChange={(v) => {
          setScope(v);
          setConfirmed(false);
        }}
      />
      {!isPrivate && !p.canContribute ? (
        <Text style={{ color: tokens.color.textSecondary }}>
          暂未开通共享资格
        </Text>
      ) : null}
      {!isPrivate ? (
        <CheckField
          label="我已核对公寓地址，并有权共享"
          checked={confirmed}
          disabled={busy || !ready}
          onChange={setConfirmed}
        />
      ) : null}
    </ApartmentPage>
  );
}
