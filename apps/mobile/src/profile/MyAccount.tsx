import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { components } from "@abasong/contracts";
import { tokens } from "@abasong/ui";
import { ActionButton, FormError } from "../ui/Controls";
import { ListRow } from "../ui/Primitives";
import { Icon } from "../ui/Icon";
import { metrics, typeStyles } from "../ui/foundation";
import { availabilitySummary } from "../drivers/availability-fields";
import { availabilityConflict } from "../drivers/availability-session";
import type { ProfileRequest, SelfProfile } from "./profile-session";
import { ownTeam, type OwnTeamSummary } from "../teams/team-client";
type A = components["schemas"]["Availability"];
export function MyAccount({
  request,
  onProfile,
  onTeam,
  onInvite,
  onAvailability,
  onShare,
  onMenu,
  testControls,
}: {
  request: ProfileRequest;
  onProfile: () => void;
  onTeam?: () => void;
  onInvite?: () => void;
  onAvailability: (enable: boolean) => void;
  onShare: () => void;
  onMenu: (
    menu: "apartments" | "requests" | "applications" | "settings",
  ) => void;
  testControls?: ReactNode;
}) {
  const [profile, setProfile] = useState<SelfProfile | null>(null),
    [team, setTeam] = useState<OwnTeamSummary | null>(),
    [availability, setAvailability] = useState<A | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [profileError, setProfileError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [clock, setClock] = useState(Date.now());
  const controller = useRef<AbortController | null>(null),
    visible = useRef(false),
    working = useRef(false);
  const showTeam = !!onTeam;
  const load = useCallback(async () => {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setReady(false);
    setError(null);
    setProfileError(null);
    if (showTeam) {
      void ownTeam<OwnTeamSummary>(request, c.signal, true).then(
        (summary) => {
          if (!c.signal.aborted && visible.current) setTeam(summary);
        },
        () => {
          if (!c.signal.aborted && visible.current) setTeam(undefined);
        },
      );
    }
    const [p, a] = await Promise.allSettled([
      request<SelfProfile>("/v1/me/profile", { signal: c.signal }),
      request<A>("/v1/me/availability", { signal: c.signal }).catch((e) => {
        if (e?.status === 404 && e?.code === "NOT_FOUND") return null;
        throw e;
      }),
    ]);
    if (c.signal.aborted || !visible.current) return;
    if (p.status === "fulfilled") setProfile(p.value);
    else {
      setProfile(null);
      setProfileError("个人资料暂时无法读取");
    }
    if (a.status === "fulfilled") {
      setAvailability(a.value);
      setReady(true);
      setConflict(false);
    } else {
      setAvailability(null);
      setError("接活状态暂时无法读取");
    }
  }, [request, showTeam]);
  useFocusEffect(
    useCallback(() => {
      visible.current = true;
      void load();
      return () => {
        visible.current = false;
        controller.current?.abort();
      };
    }, [load]),
  );
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        setClock(Date.now());
        if (!working.current) void load();
      } else {
        controller.current?.abort();
        setReady(false);
      }
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [load]);
  const enabled =
    !!availability?.enabled && Date.parse(availability.ends_at) > clock;
  async function toggle() {
    if (!ready || working.current || conflict) return;
    if (!enabled) {
      onAvailability(true);
      return;
    }
    working.current = true;
    setBusy(true);
    setError(null);
    const c = new AbortController();
    controller.current?.abort();
    controller.current = c;
    try {
      const a = await request<A>("/v1/me/availability", {
        method: "PUT",
        body: { expected_version: availability!.version, enabled: false },
        signal: c.signal,
      });
      if (!c.signal.aborted && visible.current) setAvailability(a);
    } catch (e) {
      if (!c.signal.aborted && visible.current) {
        setConflict(availabilityConflict(e));
        setError(e instanceof Error ? e.message : "未能关闭接活状态，请重试");
      }
    } finally {
      working.current = false;
      if (visible.current) setBusy(false);
    }
  }
  const group = {
    borderRadius: metrics.cardRadius,
    paddingHorizontal: 12,
    backgroundColor: tokens.color.surface,
    overflow: "hidden" as const,
  };
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: tokens.color.surfaceMuted }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: metrics.inset,
          gap: 20,
          paddingBottom: 32,
        }}
      >
        {testControls}
        {profile ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="编辑个人资料"
            onPress={onProfile}
            style={{
              flexDirection: "row",
              gap: 16,
              alignItems: "center",
              paddingVertical: 8,
              minHeight: 72,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: tokens.color.brandSurface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "600",
                  color: tokens.color.brandText,
                }}
              >
                {Array.from(profile.profile.display_name)[0]}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={typeStyles.title}>
                {profile.profile.display_name}
              </Text>
              <Text style={typeStyles.secondary}>编辑资料</Text>
            </View>
            <Icon name="chevron" />
          </Pressable>
        ) : (
          <>
            <FormError message={profileError} />
            <ActionButton
              label={profileError ? "重新读取资料" : "正在读取资料…"}
              secondary
              disabled={!profileError}
              onPress={() => void load()}
            />
          </>
        )}
        <View style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              minHeight: 60,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={typeStyles.label}>接活状态</Text>
              {enabled ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="修改接活时段"
                  disabled={busy}
                  onPress={() => onAvailability(false)}
                  style={{ minHeight: 48, justifyContent: "center" }}
                >
                  <Text
                    style={[
                      typeStyles.secondary,
                      { color: tokens.color.brandText },
                    ]}
                  >
                    {availabilitySummary(availability, clock)}
                    {availability?.region_ids.length
                      ? ` · ${availability.region_ids.length}个区域`
                      : ""}
                  </Text>
                </Pressable>
              ) : (
                <Text style={typeStyles.secondary}>
                  {ready ? "暂不接活" : "正在读取状态…"}
                </Text>
              )}
            </View>
            <Switch
              accessibilityLabel="接活状态"
              value={enabled}
              disabled={!ready || busy || conflict}
              onValueChange={() => void toggle()}
              trackColor={{ true: tokens.color.brandPrimary }}
              thumbColor={
                Platform.OS === "android" ? tokens.color.surface : undefined
              }
            />
          </View>
          <FormError message={error} />
          {!ready || conflict ? (
            <ActionButton
              label="读取最新状态"
              variant="text"
              onPress={() => void load()}
            />
          ) : error ? (
            <ActionButton
              label="重试关闭"
              variant="text"
              disabled={busy}
              onPress={() => void toggle()}
            />
          ) : null}
        </View>
        <ActionButton label="＋ 共享门禁码" onPress={onShare} />
        <View style={group}>
          <ListRow
            title="我的公寓"
            subtitle="我保存的 · 我共享的"
            icon="bookmark"
            onPress={() => onMenu("apartments")}
          />
          <ListRow
            title="我的发布"
            icon="box"
            onPress={() => onMenu("requests")}
          />
          <ListRow
            title="我的报名"
            icon="people"
            onPress={() => onMenu("applications")}
          />
        </View>
        {onInvite || onTeam ? (
          <View style={group}>
            {onInvite ? (
              <ListRow title="邀请司机" icon="send" onPress={onInvite} />
            ) : null}
            {onTeam ? (
              <ListRow
                title="我的团队"
                subtitle={team === null ? "添加团队资料" : team?.team.name}
                icon="warehouse"
                onPress={onTeam}
              />
            ) : null}
          </View>
        ) : null}
        <View style={group}>
          <ListRow
            title="设置"
            icon="settings"
            onPress={() => onMenu("settings")}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
