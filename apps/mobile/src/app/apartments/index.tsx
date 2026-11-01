import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import type { components } from "@abasong/contracts";
import { ApartmentPage, FormError } from "../../auth/AuthControls";
import { useAuth } from "../../auth/AuthProvider";
import { SensitiveScreen } from "../../apartments/SensitiveScreen";
import { dataRequest } from "../../apartments/client";
import {
  mergeSearchResults,
  type SearchResult,
} from "../../apartments/search-results";
import {
  clearSearchDestination,
  setSearchDestination,
} from "../../apartments/search-destination";
import { ListRow, SearchBox } from "../../ui/Primitives";
import { tokens } from "@abasong/ui";
type S = components["schemas"];
export default function Apartments() {
  const auth = useAuth();
  return (
    <SensitiveScreen>
      <Search key={auth.session?.user.id} />
    </SensitiveScreen>
  );
}
function Search() {
  const auth = useAuth(),
    params = useLocalSearchParams<{ apartment_id?: string }>(),
    control = useRef(new AbortController()),
    generation = useRef(0);
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
    };
  }, [params.apartment_id]);
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
    if (!identity || query.trim().length < 2) return () => controller.abort();
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
  }, [query, retry, auth.session]);
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
  const results = mergeSearchResults(local, external),
    failed = error ?? localError ?? providerError;
  return (
    <ApartmentPage
      title="搜索"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <SearchBox
        value={query}
        busy={selecting}
        onChange={(v) => {
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
        onSearch={() => {
          rotate();
          setRetry((v) => v + 1);
        }}
      />
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
            title={r.apartment.name ?? r.apartment.address_line1}
            subtitle={`${r.apartment.address_line1}, ${r.apartment.city}, ${r.apartment.state}`}
            disabled={selecting}
            onPress={() => void select(r)}
          />
        ) : (
          <ListRow
            key={r.suggestion.provider_result_id}
            title={r.suggestion.title}
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
