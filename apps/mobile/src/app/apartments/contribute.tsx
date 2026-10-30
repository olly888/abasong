import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import {
  ActionButton,
  AuthPage,
  Field,
  FormError,
} from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { dataRequest } from "../../apartments/client";
type S = components["schemas"];
export default function Contribute() {
  const a = useAuth();
  return (
    <SensitiveScreen>
      <Content key={a.session?.user.id} />
    </SensitiveScreen>
  );
}
function Content() {
  const a = useAuth(),
    session = a.session!,
    params = useLocalSearchParams<{ mode?: string; apartment_id?: string }>(),
    isPrivate = params.mode === "private",
    controller = useRef(new AbortController());
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<S["Apartment"][]>([]),
    [target, setTarget] = useState<S["Apartment"] | null>(null),
    [address, setAddress] = useState(""),
    [value, setValue] = useState(""),
    [scope, setScope] = useState("大门"),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  // A stable write key is retained across uncertain transport retries; content changes get a new intent.
  const attempt = useRef<{
    fingerprint: string;
    entryKey: string;
    recordKey: string;
  } | null>(null);
  const request = <T,>(
    path: string,
    opts: Parameters<typeof dataRequest>[2] = {},
  ) =>
    dataRequest<T>(session, path, {
      ...opts,
      signal: controller.current.signal,
    });
  useEffect(() => () => controller.current.abort(), []);
  useEffect(() => {
    if (!params.apartment_id) return;
    void request<S["Apartment"]>("/v1/apartments/" + params.apartment_id)
      .then((item) => {
        if (!controller.current.signal.aborted) setTarget(item);
      })
      .catch((e) => {
        if (!controller.current.signal.aborted)
          setError(e instanceof Error ? e.message : "无法确认公寓");
      });
  }, [params.apartment_id]);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const page = await request<S["ApartmentPage"]>(
        "/v1/apartments?query=" + encodeURIComponent(query),
      );
      setMatches(page.items);
      if (!page.items.length) setError("未找到已收录公寓；可先保存私人记录。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!value.trim() || !scope.trim()) return;
    setBusy(true);
    setError(null);
    const body = isPrivate
      ? { target: target?.id ?? null, address, value, scope }
      : { target: target?.id ?? null, value, scope, confirmed };
    const fingerprint = JSON.stringify(body);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = {
        fingerprint,
        entryKey: randomUUID(),
        recordKey: randomUUID(),
      };
    const intent = attempt.current;
    try {
      if (isPrivate) {
        const entry = await request<S["LibraryEntry"]>(
          "/v1/me/apartment-library",
          {
            method: "POST",
            key: intent.entryKey,
            body: target ? { apartment_id: target.id } : { address },
          },
        );
        await request("/v1/me/apartment-library/" + entry.id + "/records", {
          method: "POST",
          key: intent.recordKey,
          body: { value, scope_label: scope },
        });
        router.replace("/apartments/library");
      } else {
        if (!target || !confirmed) throw new Error("请核对公寓并确认共享来源");
        await request("/v1/apartments/" + target.id + "/access-records", {
          method: "POST",
          key: intent.recordKey,
          body: {
            method: "keypad",
            value,
            scope: { label: scope },
            source_attested: true,
          },
        });
        setValue("");
        setConfirmed(false);
        attempt.current = null;
        Alert.alert(
          "已提交贡献",
          "新密码待审核；同码贡献保留原时间，不产生有用反馈。",
        );
        router.back();
      }
    } catch (e) {
      if (!controller.current.signal.aborted)
        setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPage title={isPrivate ? "添加私人记录" : "贡献公寓密码"}>
      <FormError message={error} />
      {!isPrivate && !a.me?.capabilities.includes("access.contribute") ? (
        <Text>共享贡献资格待审核。你仍可保存自己的私人记录。</Text>
      ) : null}
      {target ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "600" }}>
            {target.name ?? "公寓"}
          </Text>
          <Text>
            {target.address_line1}, {target.city}, {target.state}
          </Text>
          <ActionButton
            label="更换公寓"
            secondary
            disabled={busy}
            onPress={() => {
              setTarget(null);
              setConfirmed(false);
            }}
          />
        </View>
      ) : (
        <>
          <Field
            label="搜索公寓或地址"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          <ActionButton
            label="搜索"
            secondary
            busy={busy}
            disabled={query.trim().length < 2}
            onPress={() => void search()}
          />
          {matches.map((p) => (
            <ActionButton
              key={p.id}
              label={`${p.name ?? ""} · ${p.address_line1}`}
              secondary
              onPress={() => {
                setTarget(p);
                setConfirmed(false);
              }}
            />
          ))}
        </>
      )}
      {isPrivate && !target ? (
        <Field
          label="未收录公寓的英文地址"
          value={address}
          onChangeText={setAddress}
          maxLength={300}
        />
      ) : null}
      <Field
        label="密码"
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setConfirmed(false);
        }}
        maxLength={32}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label="门别"
        value={scope}
        onChangeText={(v) => {
          setScope(v);
          setConfirmed(false);
        }}
        maxLength={100}
      />
      {!isPrivate ? (
        <ActionButton
          label={
            confirmed ? "✓ 已核对公寓，并有权共享" : "我已核对公寓，并有权共享"
          }
          secondary
          onPress={() => setConfirmed((v) => !v)}
        />
      ) : null}
      <ActionButton
        label={isPrivate ? "仅自己保存" : "确认共享"}
        busy={busy}
        disabled={
          !value.trim() ||
          !scope.trim() ||
          (!target && (!isPrivate || !address.trim())) ||
          (!isPrivate &&
            (!confirmed || !a.me?.capabilities.includes("access.contribute")))
        }
        onPress={() => void submit()}
      />
      {!isPrivate ? (
        <ActionButton
          label="改为添加私人记录"
          secondary
          disabled={busy}
          onPress={() => router.replace("/apartments/contribute?mode=private")}
        />
      ) : null}
    </AuthPage>
  );
}
