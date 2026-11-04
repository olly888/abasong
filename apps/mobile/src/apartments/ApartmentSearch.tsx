import { AddressLine } from "./AddressLine";
import { locality } from "./address-presentation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { ActionButton, ApartmentPage, FormError } from "../auth/AuthControls";
import { useAuth } from "../auth/AuthProvider";
import { dataRequest } from "./client";
import { mergeSearchResults, type SearchResult } from "./search-results";
import {
  clearSearchDestination,
  setSearchDestination,
} from "./search-destination";
import { ListRow, SearchBox } from "../ui/Primitives";
import { tokens } from "@abasong/ui";
import {
  captureAddress,
  PhotoError,
  type CaptureAddress,
} from "../address-photo/capture";
import type { LabelAddress } from "../address-photo/extract";
import { canSearchPhotoDraft } from "../address-photo/photo-policy";
type S = components["schemas"];
export function ApartmentSearch({
  testCapture,
}: { testCapture?: CaptureAddress } = {}) {
  const auth = useAuth(),
    params = useLocalSearchParams<{ apartment_id?: string }>(),
    control = useRef(new AbortController()),
    generation = useRef(0);
  const photoControl = useRef<AbortController | null>(null);
  const photoVersion = useRef(0);
  const [photoBusy, setPhotoBusy] = useState<"camera" | "recognizing" | null>(
    null,
  );
  const [reviewing, setReviewing] = useState(false);
  const [photoChoices, setPhotoChoices] = useState<LabelAddress[]>([]);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [photoSettings, setPhotoSettings] = useState(false);
  const stopPhoto = useCallback(() => {
    photoVersion.current++;
    photoControl.current?.abort();
  }, []);
  useFocusEffect(
    useCallback(() => {
      setPhotoBusy(null);
      return () => stopPhoto();
    }, [stopPhoto]),
  );
  const session = useRef({
    token: randomUUID(),
    started: Date.now(),
    calls: 0,
  });
  const [query, setQuery] = useState(""),
    [local, setLocal] = useState<S["Apartment"][]>([]),
    [external, setExternal] = useState<S["AddressSuggestion"][]>([]),
    [attribution, setAttribution] = useState(""),
    [busy, setBusy] = useState(false),
    [selecting, setSelecting] = useState(false),
    [searched, setSearched] = useState(false),
    [retry, setRetry] = useState(0),
    [localError, setLocalError] = useState<string | null>(null),
    [providerError, setProviderError] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const rotate = () => {
    session.current = { token: randomUUID(), started: Date.now(), calls: 0 };
  };
  const choose = (id: string) => {
    Keyboard.dismiss();
    control.current.abort();
    generation.current++;
    clearSearchDestination();
    router.dismissTo({
      pathname: "/",
      params: { apartment_id: id, destination_key: "" },
    });
  };
  useEffect(() => {
    if (params.apartment_id) choose(params.apartment_id);
    return () => {
      control.current.abort();
      generation.current++;
      stopPhoto();
    };
  }, [params.apartment_id, stopPhoto]);
  useEffect(() => {
    control.current.abort();
    const controller = new AbortController();
    control.current = controller;
    const version = ++generation.current;
    const identity = auth.session;
    const valid = () =>
      !controller.signal.aborted && generation.current === version;
    setLocal([]);
    setExternal([]);
    setAttribution("");
    setLocalError(null);
    setProviderError(null);
    setError(null);
    setSearched(false);
    setBusy(false);
    setSelecting(false);
    if (
      !identity ||
      auth.phase !== "ready" ||
      !canSearchPhotoDraft(query, reviewing, !!photoBusy || !!photoMessage)
    )
      return () => controller.abort();
    const timer = setTimeout(() => {
      if (
        Date.now() - session.current.started >= 140000 ||
        session.current.calls >= 40
      )
        rotate();
      const token = session.current.token;
      session.current.calls++;
      setBusy(true);
      void Promise.allSettled([
        dataRequest<S["ApartmentPage"]>(
          identity,
          "/v1/apartments?limit=5&query=" + encodeURIComponent(query.trim()),
          { signal: controller.signal },
        )
          .then((p) => {
            if (valid()) setLocal(p.items);
          })
          .catch(() => {
            if (valid()) setLocalError("公寓资料暂不可用");
          }),
        dataRequest<S["AddressSuggestions"]>(
          identity,
          "/v1/search/addresses/suggest",
          {
            method: "POST",
            body: { query: query.trim(), session_token: token },
            signal: controller.signal,
          },
        )
          .then((p) => {
            if (valid()) {
              setExternal(p.items);
              setAttribution(p.attribution);
            }
          })
          .catch(() => {
            if (valid()) setProviderError("地址联想暂不可用");
          }),
      ]).finally(() => {
        if (valid()) {
          setBusy(false);
          setSearched(true);
        }
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    query,
    retry,
    auth.session,
    auth.phase,
    reviewing,
    photoBusy,
    photoMessage,
  ]);
  async function select(result: SearchResult) {
    if (selecting) return;
    if (result.kind === "apartment") {
      choose(result.apartment.id);
      return;
    }
    control.current.abort();
    const controller = new AbortController();
    control.current = controller;
    const version = ++generation.current;
    const valid = () =>
      !controller.signal.aborted && generation.current === version;
    setBusy(false);
    setSelecting(true);
    setError(null);
    try {
      const destination = await dataRequest<S["TemporaryAddress"]>(
        auth.session!,
        "/v1/search/addresses/retrieve",
        {
          method: "POST",
          body: {
            provider_result_id: result.suggestion.provider_result_id,
            session_token: session.current.token,
          },
          signal: controller.signal,
        },
      );
      if (!valid()) return;
      rotate();
      if (
        destination.match_status === "matched" &&
        destination.apartments.length === 1
      ) {
        choose(destination.apartments[0]!.id);
        return;
      }
      Keyboard.dismiss();
      const key = randomUUID();
      setSearchDestination(key, auth.session!.user.id, destination);
      router.dismissTo({
        pathname: "/",
        params: { apartment_id: "", destination_key: key },
      });
    } catch (e) {
      if (valid())
        setError(e instanceof Error ? e.message : "地址暂不可用，请重试");
    } finally {
      if (valid()) setSelecting(false);
    }
  }
  async function takePhoto() {
    if (photoBusy) return;
    Keyboard.dismiss();
    stopPhoto();
    control.current.abort();
    generation.current++;
    const controller = new AbortController();
    photoControl.current = controller;
    const version = photoVersion.current;
    const valid = () =>
      !controller.signal.aborted && photoVersion.current === version;
    setPhotoBusy("camera");
    setPhotoMessage(null);
    setPhotoSettings(false);
    try {
      const take = __DEV__ && testCapture ? testCapture : captureAddress;
      const choices = await take(controller.signal, () => {
        if (valid()) setPhotoBusy("recognizing");
      });
      if (!valid() || choices === null) return;
      if (choices.length) {
        setPhotoChoices(choices);
        setReviewing(true);
        setQuery(choices.length === 1 ? choices[0]!.searchText : "");
      } else setPhotoMessage("没识别到收件地址");
    } catch (e) {
      if (valid()) {
        setPhotoMessage(
          e instanceof PhotoError
            ? e.message
            : "无法识别照片，请重新拍照或手动输入",
        );
        setPhotoSettings(e instanceof PhotoError && e.settings);
      }
    } finally {
      if (valid()) setPhotoBusy(null);
    }
  }
  function submitSearch() {
    if (photoBusy || query.trim().length < 2) return;
    Keyboard.dismiss();
    setReviewing(false);
    setPhotoChoices([]);
    setPhotoMessage(null);
    setPhotoSettings(false);
    rotate();
    setRetry((v) => v + 1);
  }
  const results = mergeSearchResults(local, external),
    failed = error ?? localError ?? providerError;
  return (
    <ApartmentPage
      title="搜索"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <SearchBox
        value={query}
        busy={selecting || !!photoBusy}
        onCamera={() => void takePhoto()}
        onChange={(v) => {
          stopPhoto();
          setPhotoBusy(null);
          setPhotoMessage(null);
          setPhotoSettings(false);
          if (!v.trim()) {
            setReviewing(false);
            setPhotoChoices([]);
          }
          generation.current++;
          control.current.abort();
          setQuery(v);
          setLocal([]);
          setExternal([]);
          setAttribution("");
          setSearched(false);
          setBusy(false);
          setSelecting(false);
          setError(null);
          if (!v.trim()) rotate();
        }}
        onSearch={submitSearch}
      />
      {photoBusy ? (
        <View style={{ gap: 10, alignItems: "center", paddingVertical: 24 }}>
          <ActivityIndicator color={tokens.color.brandPrimary} />
          <Text>
            {photoBusy === "camera" ? "正在打开相机" : "正在识别地址"}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={{ minHeight: 48, justifyContent: "center" }}
            onPress={() => {
              stopPhoto();
              setPhotoBusy(null);
            }}
          >
            <Text style={{ color: tokens.color.brandPrimary }}>取消识别</Text>
          </Pressable>
        </View>
      ) : null}
      {reviewing && !photoBusy && !photoMessage ? (
        <View style={{ gap: 12 }}>
          <Text
            style={{ fontSize: 20, fontWeight: "600", color: tokens.color.ink }}
          >
            {photoChoices.length > 1 && !query
              ? "选择收件地址"
              : "核对收件地址"}
          </Text>
          {photoChoices.length > 1 && !query ? (
            photoChoices.map((address) => (
              <ListRow
                key={address.searchText}
                title={<AddressLine line={address.street} compact />}
                subtitle={[address.city, address.state, address.postalCode]
                  .filter(Boolean)
                  .join(", ")}
                onPress={() => {
                  setQuery(address.searchText);
                  setPhotoChoices([address]);
                }}
              />
            ))
          ) : (
            <>
              <AddressLine line={query} expanded />
              <ActionButton
                label="查找此地址"
                disabled={query.trim().length < 2}
                onPress={submitSearch}
              />
            </>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => void takePhoto()}
            style={{
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: tokens.color.brandPrimary }}>重新拍照</Text>
          </Pressable>
        </View>
      ) : null}
      {photoMessage && !photoBusy ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, color: tokens.color.ink }}>
            {photoMessage}
          </Text>
          <ActionButton
            label={photoSettings ? "打开系统设置" : "重新拍照"}
            onPress={() => {
              if (photoSettings)
                void Linking.openSettings().catch(() =>
                  setPhotoMessage("请在系统设置中开启相机权限"),
                );
              else void takePhoto();
            }}
          />
          <Pressable
            accessibilityRole="button"
            style={{
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => {
              setPhotoMessage(null);
              if (reviewing) setQuery("");
              setReviewing(false);
              setPhotoChoices([]);
            }}
          >
            <Text style={{ color: tokens.color.brandPrimary }}>手动输入</Text>
          </Pressable>
        </View>
      ) : null}
      {busy || selecting ? (
        <ActivityIndicator
          accessibilityLabel={selecting ? "正在定位地址" : "正在搜索"}
          color={tokens.color.brandPrimary}
          style={{ marginVertical: 12 }}
        />
      ) : null}
      <FormError message={failed} />
      {failed ? (
        <Pressable
          accessibilityRole="button"
          disabled={selecting}
          onPress={() => {
            rotate();
            setRetry((v) => v + 1);
          }}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={{ color: tokens.color.brandPrimary }}>重试搜索</Text>
        </Pressable>
      ) : null}
      {searched && !results.length && !busy && !failed ? (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: "600" }}>
            未找到匹配地址
          </Text>
          <Text style={{ color: tokens.color.textMuted }}>
            试试门牌号、街道或城市
          </Text>
        </View>
      ) : null}
      {results.map((r) =>
        r.kind === "apartment" ? (
          <ListRow
            key={r.apartment.id}
            title={<AddressLine line={r.apartment.address_line1} compact />}
            subtitle={[locality(r.apartment), r.apartment.name]
              .filter(Boolean)
              .join(" · ")}
            disabled={selecting}
            onPress={() => void select(r)}
          />
        ) : (
          <ListRow
            key={r.suggestion.provider_result_id}
            title={
              <AddressLine
                line={r.suggestion.address?.address_line1 || r.suggestion.title}
                compact
              />
            }
            subtitle={r.suggestion.subtitle || r.suggestion.label}
            disabled={selecting}
            onPress={() => void select(r)}
          />
        ),
      )}
      {attribution ? (
        <Text
          style={{
            fontSize: 11,
            color: tokens.color.textMuted,
            lineHeight: 16,
            marginTop: 16,
          }}
        >
          {attribution}
        </Text>
      ) : null}
    </ApartmentPage>
  );
}
